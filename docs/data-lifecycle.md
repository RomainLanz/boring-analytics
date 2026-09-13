# Data lifecycle

## Raw event retention

Each Website has its own raw event retention policy. New and existing Websites default to 90 days. An owner may choose
60, 90, 180, or 365 days, or keep events indefinitely.

Retention uses `received_at`, the time PostgreSQL accepted the event. It does not use the caller-controlled
`occurred_at`. This prevents a late or future-dated event from escaping its storage lifetime. Reports still group and
order events by `occurred_at`.

The application accepts event times within `EVENT_TIME_TOLERANCE_HOURS` of receipt. A report is guaranteed complete
only when its first required event time is on or after the retention cutoff plus that tolerance. Traffic and Events
need the displayed 30-day period. Since an active Session may last for an arbitrary time, Traffic only reports session
metrics when each contributing Session's earliest retained Event is at least 30 minutes after the available-history
boundary. A Product Funnel shifts the displayed cohort period back by its conversion window so only mature cohorts appear. A 30-day report with a 30-day conversion window therefore
needs about 60 days of raw events. With a 60-day policy, the event-time tolerance can make that edge report unavailable.
The UI marks such a report unavailable instead of displaying partial counts as zero.

The purge records this availability boundary on the Website. Lengthening retention or switching to indefinite
retention does not imply that previously purged history has returned; reports before the recorded boundary remain
unavailable.

`$identify` rows are raw events. The purge keeps an expired `$identify` row while any anonymous event that can use that
identification remains. Funnel definitions and steps are configuration and are not purged. `event_id` deduplication
lasts as long as its raw event remains; a sender may reuse an ID after that event has been purged.

### Running the purge

The purge is an idempotent Ace command. Each invocation deletes at most 100 batches of 1,000 events by default. The SQL
uses `FOR UPDATE SKIP LOCKED`, so concurrent invocations do not select the same rows.

```bash
yarn workspace @boring-analytics/web exec node ace events:purge
```

The limits can be lowered for small PostgreSQL installations:

```bash
yarn workspace @boring-analytics/web exec node ace events:purge --batch-size=250 --max-batches=20
```

The current self-hosted deployment runs one AdonisJS process and PostgreSQL, with no application worker. Schedule the
command once per day with the host scheduler. For a checkout managed directly on the host, a crontab entry is enough:

```cron
17 3 * * * cd /srv/boring-analytics && corepack yarn workspace @boring-analytics/web exec node ace events:purge
```

For the repository's Compose deployment, run the command in the existing application container:

```cron
17 3 * * * cd /srv/boring-analytics && docker compose exec -T app node ace events:purge
```

Do not run `VACUUM FULL` after the purge. PostgreSQL autovacuum reclaims dead tuples without taking the table-wide lock
that `VACUUM FULL` requires.

## Owner data export

An authenticated owner can download `/account/export`. The response is streamed from PostgreSQL in 100-row chunks as
newline-delimited JSON. The response uses `application/x-ndjson`, disables shared caching, and names files
`boring-analytics-export-v1-YYYY-MM-DD.jsonl`.

The first line is the manifest:

```json
{ "type": "boring-analytics-export", "schemaVersion": 1, "exportedAt": "2026-04-01T12:00:00.000Z" }
```

Following lines use the record types `website`, `event`, `funnel`, and `funnel-step`. IDs preserve relationships between
records. Event records contain the existing anonymous, session, distinct, identification, and `event_id` fields. The
export does not create Person or profile records. PostgreSQL timestamps use UTC with six fractional digits so batch
event ordering remains portable.

Queries join every record through `workspaces.owner_user_id`. The export excludes Users, email addresses, passwords,
sessions, authentication state, server-key prefixes and hashes, one-shot server-key secrets, Workspace owner IDs, and
records belonging to another owner. This application export is not a PostgreSQL backup and cannot restore an
installation automatically.
