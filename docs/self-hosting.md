# Self-hosting with Docker Compose

This setup runs one Boring Analytics process and PostgreSQL. Compose builds the application image locally. It does not
need Redis, a worker, or a reverse proxy. The application listens only on the host loopback interface by default. Put a
TLS-terminating proxy in front of it when clients connect from another machine.

## Install

Install Git, Docker Engine with Docker Compose, OpenSSL, and curl. Then clone the repository and create the environment
file:

```bash
git clone https://github.com/RomainLanz/boring-analytics.git
cd boring-analytics
cp self-hosted.env.example .env
chmod 600 .env
```

Set these values in `.env` before the first start:

- `POSTGRES_PASSWORD`: generate it with `openssl rand -hex 32`. Keep it URL-safe because Compose puts it in
  `DATABASE_URL`. PostgreSQL reads it only when it initializes a new volume.
- `APP_KEY`: generate it with `openssl rand -base64 32`. Changing it invalidates existing encrypted sessions.
- `ANONYMOUS_ID_SECRET`: generate it with `openssl rand -hex 32`. Changing it breaks anonymous visitor linkage across
  the rotation boundary.
- `APP_URL`: the public origin, for example `https://analytics.example.com`. Boring Analytics uses it in tracker and
  server-event instructions.

Do not commit `.env`. The repository ignores it. If you change `APP_PORT`, update the local reverse proxy target. If a
reverse proxy supplies `X-Forwarded-For`, narrow `TRUST_PROXY` to its addresses or CIDRs.

Build and start the installation:

```bash
docker compose up -d --build --wait
docker compose ps
app_address="$(docker compose port app 3333)"
curl --fail "http://${app_address}/health/ready"
```

PostgreSQL initializes its named volume first. The one-shot `migrate` service starts only after `pg_isready` succeeds.
It runs every pending Kysely migration and must exit successfully before Compose starts `app`. Migration failure leaves
`app` stopped. The migration command is safe to run again after correcting the cause.

Open `${APP_URL}/signup` to create the first owner. No bootstrap account or default password exists.

### Health probes

`GET /health/live` returns HTTP 200 when the AdonisJS HTTP process can answer. It does not query PostgreSQL. Use it as a
liveness probe. Restarting the process cannot repair PostgreSQL or a pending migration.

`GET /health/ready` returns HTTP 200 only when PostgreSQL answers and every migration shipped in the running image is
recorded as executed. It returns HTTP 503 for a database error or pending migration. Compose uses this endpoint for the
application healthcheck. This separates process failure from a dependency or release-order failure.

## Update

Updates use a short maintenance window. Set the reviewed target revision, then run the guarded sequence:

```bash
target_revision=<reviewed-tag-or-commit>
(
  set -Eeuo pipefail
  app_stopped=0
  trap 'status=$?; if [[ "$app_stopped" == 1 ]]; then docker compose stop app >/dev/null 2>&1 || true; fi; exit "$status"' ERR

  git rev-parse HEAD
  git fetch origin
  backup="backups/boring-analytics-$(date -u +%Y%m%dT%H%M%SZ).dump"
  install -d -m 700 backups
  umask 077
  docker compose exec -T database pg_dump \
    --format=custom --no-owner --no-privileges --username=app --dbname=app > "$backup"
  docker compose exec -T database pg_restore --list < "$backup" >/dev/null

  git checkout "$target_revision"
  docker compose build app migrate
  docker compose stop app
  app_stopped=1
  docker compose run --rm migrate
  docker compose up -d --remove-orphans --wait app
  app_address="$(docker compose port app 3333)"
  curl --fail "http://${app_address}/health/ready"
  trap - ERR
)
```

The backup and its archive validation finish before checkout, build, migration, or restart. Any later error leaves `app`
stopped. Inspect `docker compose logs migrate app` before correcting the problem and starting it again.

There is no automatic schema rollback guarantee. Do not run `migrate:rollback` as a general release rollback. If the
new migrations are backward-compatible, checking out the previous revision, rebuilding, and starting it may be enough.
If compatibility is uncertain, restore the pre-update backup into a fresh database with the previous application
revision. That restores the complete installation to the backup point and discards writes made after it.

## PostgreSQL backup and restore

The update procedure creates a complete PostgreSQL custom-format backup. Use the same command for scheduled backups.
Copy each resulting file off the Docker host and apply retention appropriate to the installation. A successful command
and `pg_restore --list` prove that PostgreSQL can read the archive structure. Only a test restore proves recoverability.

To restore, select the application revision that matches the backup or a newer reviewed revision. The sequence builds
that revision before it stops writes and replaces `app` with a newly created empty database:

```bash
backup=backups/BACKUP.dump
recovery_revision=<backup-release-or-commit>
(
  set -Eeuo pipefail
  app_stopped=0
  trap 'status=$?; if [[ "$app_stopped" == 1 ]]; then docker compose stop app >/dev/null 2>&1 || true; fi; exit "$status"' ERR

  test -r "$backup"
  docker compose exec -T database pg_restore --list < "$backup" >/dev/null
  git checkout "$recovery_revision"
  docker compose build app migrate
  docker compose stop app
  app_stopped=1
  docker compose exec -T database dropdb --force --username=app app
  docker compose exec -T database createdb --username=app --owner=app app
  docker compose exec -T database pg_restore \
    --exit-on-error --no-owner --no-privileges --username=app --dbname=app < "$backup"
  docker compose run --rm migrate
  docker compose up -d --wait app
  app_address="$(docker compose port app 3333)"
  curl --fail "http://${app_address}/health/ready"
  trap - ERR
)
```

The guarded subshell leaves `app` stopped if restore, migration, startup, or readiness fails.

Sign in and check a known Website and recent event after the restore. The automated smoke test performs the same cycle
and verifies a known pageview before and after restoration:

```bash
tools/self-hosted/smoke.sh
```

The download at `/account/export` is owner-scoped NDJSON for portability and inspection. It deliberately omits users,
passwords, sessions, server-key secrets, and other installation state. It cannot restore an installation. Use
`pg_dump` for disaster recovery.

## Purge expired events

The installation needs no permanent scheduler container. Run the idempotent purge once a day from the host or platform
scheduler. For a checkout at `/srv/boring-analytics`, add this crontab entry:

```cron
17 3 * * * cd /srv/boring-analytics && docker compose exec -T app node ace events:purge
```

The command has bounded batches and tolerates concurrent invocation. Check its exit status and container logs in the
host monitoring system. See [Data lifecycle](data-lifecycle.md) for retention semantics and optional batch limits.

## Operational checks

Run the shell checks after changing Docker or operational files:

```bash
tools/self-hosted/test.sh
tools/self-hosted/smoke.sh
```

`test.sh` rejects a Compose configuration without required secrets and forces a post-start failure to prove cleanup.
`smoke.sh` also stops PostgreSQL to prove that liveness stays healthy while readiness fails. It always uses a unique
Compose project, generated test secrets, a random loopback port, and a disposable named volume. Its trap removes all
test containers, volumes, networks, and images on success, failure, or interruption. It never reads the installation's
`.env` values and never connects to a database outside its own Compose project.
