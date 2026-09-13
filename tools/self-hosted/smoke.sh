#!/usr/bin/env bash
set -euo pipefail

command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'openssl is required' >&2; exit 1; }
docker compose version >/dev/null

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
run_id="${SMOKE_TEST_RUN_ID:-$$_$RANDOM}"
[[ "$run_id" =~ ^[a-z0-9_]+$ ]] || { echo 'SMOKE_TEST_RUN_ID must contain lowercase letters, digits, or underscores' >&2; exit 1; }
project="boring_analytics_smoke_$run_id"
workdir="$(mktemp -d)"
cookies="$workdir/cookies"
backup="$workdir/boring-analytics.dump"
port="${SMOKE_PORT:-$((40000 + RANDOM % 20000))}"

export POSTGRES_PASSWORD="smoke-$(openssl rand -hex 16)"
export APP_KEY="$(openssl rand -base64 32)"
export ANONYMOUS_ID_SECRET="$(openssl rand -hex 32)"
export APP_URL="http://127.0.0.1:$port"
export APP_PORT="$port"

compose() {
	docker compose --project-name "$project" --file "$repo/compose.yml" --env-file /dev/null "$@"
}

cleanup() {
	compose down --volumes --remove-orphans --rmi local >/dev/null 2>&1 || true
	rm -rf "$workdir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo 'Starting a fresh Compose project'
compose up -d --build --wait
curl --fail --silent --show-error "$APP_URL/health/live" >/dev/null
curl --fail --silent --show-error "$APP_URL/health/ready" >/dev/null

echo 'Checking the liveness and readiness boundary'
compose stop database >/dev/null
curl --fail --silent --show-error "$APP_URL/health/live" >/dev/null
readiness_status="$(curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$APP_URL/health/ready")"
[[ "$readiness_status" == '503' ]] || { echo "Readiness returned HTTP $readiness_status without PostgreSQL" >&2; exit 1; }
compose up -d --wait database
curl --fail --silent --show-error "$APP_URL/health/ready" >/dev/null

if [[ "${SMOKE_FAIL_AFTER_START:-0}" == '1' ]]; then
	echo 'Stopping at the cleanup test hook' >&2
	exit 97
fi

xsrf_token() {
	awk '$6 == "XSRF-TOKEN" { token = $7 } END { print token }' "$cookies" | sed 's/%3A/:/g'
}

echo 'Creating an owner and Website through HTTP'
curl --fail --silent --show-error --cookie-jar "$cookies" "$APP_URL/signup" >/dev/null
curl --fail --silent --show-error \
	--cookie "$cookies" \
	--cookie-jar "$cookies" \
	--header "x-xsrf-token: $(xsrf_token)" \
	--header 'Content-Type: application/x-www-form-urlencoded' \
	--data 'name=Smoke+Owner&email=smoke%40example.com&password=a-secure-password&passwordConfirmation=a-secure-password' \
	--output /dev/null \
	"$APP_URL/signup"

curl --fail --silent --show-error --cookie "$cookies" --cookie-jar "$cookies" "$APP_URL/websites/new" >/dev/null
website_headers="$workdir/website-headers"
curl --fail --silent --show-error \
	--cookie "$cookies" \
	--cookie-jar "$cookies" \
	--header "x-xsrf-token: $(xsrf_token)" \
	--header 'Content-Type: application/x-www-form-urlencoded' \
	--data 'name=Smoke+Website&allowedDomain=example.com' \
	--dump-header "$website_headers" \
	--output /dev/null \
	"$APP_URL/websites"

website_path="$(awk 'tolower($1) == "location:" { gsub("\r", "", $2); print $2 }' "$website_headers")"
[[ "$website_path" =~ ^/websites/[0-9a-f-]{36}$ ]] || { echo 'Website creation did not redirect to its owner page' >&2; exit 1; }
owner_page="$workdir/owner-page"
curl --fail --silent --show-error --cookie "$cookies" "$APP_URL$website_path" > "$owner_page"
tracking_id="$(grep -o 'trackingId[^,]*' "$owner_page" | head -1 | awk -F '\\\"' '{ print $3 }')"
[[ "$tracking_id" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Owner page did not expose a tracking ID' >&2; exit 1; }

echo 'Ingesting a pageview through the public collector'
occurred_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
event_status="$(curl --silent --show-error \
	--header 'Content-Type: application/json' \
	--header 'Origin: http://example.com' \
	--data "{\"trackingId\":\"$tracking_id\",\"name\":\"\u0024pageview\",\"occurredAt\":\"$occurred_at\",\"path\":\"/smoke-restored\",\"referrer\":null,\"utmSource\":null,\"utmMedium\":null,\"utmCampaign\":null}" \
	--output /dev/null \
	--write-out '%{http_code}' \
	"$APP_URL/api/events")"
[[ "$event_status" == '202' ]] || { echo "Collector returned HTTP $event_status" >&2; exit 1; }

curl --fail --silent --show-error --cookie "$cookies" "$APP_URL$website_path" > "$owner_page"
grep -Fq '"metrics":{"pageviews":1,"visitors":1,"sessions":1}' "$owner_page" || {
	echo 'The owner-scoped dashboard did not report the ingested pageview' >&2
	exit 1
}

echo 'Backing up PostgreSQL'
compose exec -T database pg_dump \
	--format=custom \
	--no-owner \
	--no-privileges \
	--username=app \
	--dbname=app > "$backup"
compose exec -T database pg_restore --list < "$backup" >/dev/null

echo 'Restoring into a freshly created database'
compose stop app >/dev/null
compose exec -T database dropdb --force --username=app app
compose exec -T database createdb --username=app --owner=app app
compose exec -T database pg_restore \
	--exit-on-error \
	--no-owner \
	--no-privileges \
	--username=app \
	--dbname=app < "$backup"
compose run --rm migrate
compose up -d --wait app

curl --fail --silent --show-error "$APP_URL/health/ready" >/dev/null
curl --fail --silent --show-error --cookie "$cookies" "$APP_URL$website_path" > "$owner_page"
grep -Fq '"metrics":{"pageviews":1,"visitors":1,"sessions":1}' "$owner_page" || {
	echo 'The restored owner-scoped dashboard lost the pageview' >&2
	exit 1
}
grep -Fq '/smoke-restored' "$owner_page" || { echo 'The restored page path is missing' >&2; exit 1; }

echo 'Smoke test and PostgreSQL restore passed'
