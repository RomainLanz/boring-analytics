#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

export POSTGRES_PASSWORD=test-password
export APP_KEY=test-app-key
export APP_URL=http://127.0.0.1:3333
export ANONYMOUS_ID_SECRET=test-anonymous-id-secret

compose_config() {
	docker compose --project-name boring_analytics_config_test --file "$repo/compose.yml" --env-file /dev/null config
}

compose_config >/dev/null
for variable in POSTGRES_PASSWORD APP_KEY APP_URL ANONYMOUS_ID_SECRET; do
	if (unset "$variable"; compose_config >/dev/null 2> "$workdir/config-error"); then
		echo "Compose accepted missing $variable" >&2
		exit 1
	fi
	grep -Fq "$variable" "$workdir/config-error" || { echo "Compose failed for the wrong reason without $variable" >&2; exit 1; }
done

run_id="cleanup_$$"
project="boring_analytics_smoke_$run_id"
if COMPOSE_PROJECT_NAME=production \
	COMPOSE_FILE=/does/not/exist \
	SMOKE_TEST_RUN_ID="$run_id" \
	SMOKE_FAIL_AFTER_START=1 \
	"$repo/tools/self-hosted/smoke.sh"; then
	echo 'The smoke cleanup hook did not fail' >&2
	exit 1
else
	status=$?
	[[ "$status" == '97' ]] || { echo "The cleanup test failed unexpectedly with status $status" >&2; exit 1; }
fi

[[ -z "$(docker ps --all --quiet --filter "label=com.docker.compose.project=$project")" ]] || {
	echo 'Smoke failure left containers behind' >&2
	exit 1
}
[[ -z "$(docker volume ls --quiet --filter "label=com.docker.compose.project=$project")" ]] || {
	echo 'Smoke failure left volumes behind' >&2
	exit 1
}
[[ -z "$(docker image ls --quiet "$project-app:latest")" ]] || {
	echo 'Smoke failure left the application image behind' >&2
	exit 1
}
[[ -z "$(docker image ls --quiet "$project-migrate:latest")" ]] || {
	echo 'Smoke failure left the migration image behind' >&2
	exit 1
}

echo 'Required-secret and failure-cleanup tests passed'
