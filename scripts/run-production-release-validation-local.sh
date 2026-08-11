#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/fawri-production-source"
REMOTE="github"
BRANCH="parallel/production-activation-final-release-validation"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="729cbcf7b67916b852cc6dd7618aa75ee34a237b"
EXPECTED_PRE_RUNNER_HEAD="51acc2da3bb154b3b0ad8be6df1a9288ba4011ee"
RUNNER_PATH="scripts/run-production-release-validation-local.sh"
PATCH_PATH="scripts/.tmp-production-release-finalize.py"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/production-release-$$"
TEMP_BRANCH="parallel/production-release-validation-temp-$$"
STABILIZED=""

cd "$REPO"
git fetch "$REMOTE" "$BRANCH" "$COORDINATOR"

COORD_HEAD="$(git rev-parse "$REMOTE/$COORDINATOR")"
if [[ "$COORD_HEAD" != "$GOLDEN" ]]; then
  echo "STOP: coordinator moved: $COORD_HEAD"
  exit 2
fi

BRANCH_HEAD="$(git rev-parse "$REMOTE/$BRANCH")"
MERGE_BASE="$(git merge-base "$GOLDEN" "$BRANCH_HEAD")"
if [[ "$MERGE_BASE" != "$GOLDEN" ]]; then
  echo "STOP: branch is not based on required golden: $MERGE_BASE"
  exit 3
fi

PARENT="$(git rev-parse "$BRANCH_HEAD^")"
if [[ "$PARENT" != "$EXPECTED_PRE_RUNNER_HEAD" ]]; then
  echo "STOP: unexpected branch history before finalizer: parent=$PARENT"
  exit 4
fi
RUNNER_DIFF="$(git diff --name-only "$PARENT".."$BRANCH_HEAD")"
if [[ "$RUNNER_DIFF" != "$RUNNER_PATH" ]]; then
  echo "STOP: finalizer commit contains unexpected files"
  printf '%s\n' "$RUNNER_DIFF"
  exit 5
fi

INITIAL_ALLOWED=(
  "artifacts/api-server/src/app.ts"
  "artifacts/api-server/src/index.ts"
  "artifacts/api-server/src/services/productionReleaseReadiness.ts"
  "artifacts/api-server/tests/production-release-readiness.test.ts"
  "docs/production-release-readiness.md"
  "$PATCH_PATH"
  "$RUNNER_PATH"
)
mapfile -t INITIAL_CHANGED < <(git diff --name-only "$GOLDEN".."$BRANCH_HEAD" | sort)
printf '%s\n' "${INITIAL_ALLOWED[@]}" | sort > "$CACHE_ROOT/production-release-allowed-$$.txt"
printf '%s\n' "${INITIAL_CHANGED[@]}" > "$CACHE_ROOT/production-release-changed-$$.txt"
if ! diff -u "$CACHE_ROOT/production-release-allowed-$$.txt" "$CACHE_ROOT/production-release-changed-$$.txt" >/dev/null; then
  echo "STOP: unexpected pre-finalization branch scope"
  diff -u "$CACHE_ROOT/production-release-allowed-$$.txt" "$CACHE_ROOT/production-release-changed-$$.txt" || true
  rm -f "$CACHE_ROOT/production-release-allowed-$$.txt" "$CACHE_ROOT/production-release-changed-$$.txt"
  exit 6
fi
rm -f "$CACHE_ROOT/production-release-allowed-$$.txt" "$CACHE_ROOT/production-release-changed-$$.txt"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "STOP: DATABASE_URL is required"
  exit 7
fi
DB_HOST="$(node -e 'const u=new URL(process.argv[1]); console.log(u.hostname)' "$DATABASE_URL")"
DB_NAME="$(node -e 'const u=new URL(process.argv[1]); console.log(u.pathname.replace(/^\//,""))' "$DATABASE_URL")"
if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]]; then
  echo "STOP: local PostgreSQL only; got host $DB_HOST"
  exit 8
fi
if [[ "$DB_NAME" != "fawri_ci" ]]; then
  echo "STOP: disposable database must be exactly fawri_ci; got $DB_NAME"
  exit 9
fi

mkdir -p "$CACHE_ROOT"
cleanup() {
  if [[ -n "$STABILIZED" ]]; then rm -rf "$STABILIZED" >/dev/null 2>&1 || true; fi
  cd "$REPO"
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  git branch -D "$TEMP_BRANCH" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add -b "$TEMP_BRANCH" "$WORKTREE" "$BRANCH_HEAD"
cd "$WORKTREE"

python3 "$PATCH_PATH"
rm -f "$PATCH_PATH" "$RUNNER_PATH"

if grep -Eq 'replit\.dev/api/meta/callback|repl\.co/api/meta/callback' artifacts/api-server/src/routes/index.ts; then
  echo "STOP: Replit Meta redirect fallback remains in production route"
  exit 10
fi

export CI=1
pnpm install --offline --frozen-lockfile --ignore-scripts

git diff --check "$GOLDEN"

echo "Running repository typecheck..."
pnpm run typecheck

echo "Running production release configuration and provider wiring proofs..."
pnpm --filter @workspace/api-server exec tsx --test \
  tests/production-release-readiness.test.ts \
  tests/production-runtime-provider-wiring.test.ts \
  tests/meta-graph-send-client.test.ts \
  tests/meta-webhook-worker-core.test.ts

reset_database() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
SQL
}

printf 'Running migration smoke proof on disposable PostgreSQL %s...\n' "$DB_NAME"
reset_database
FAWRI_ALLOW_MIGRATION_SMOKE=1 pnpm --filter @workspace/db run schema:smoke

STABILIZED="$(node --input-type=module -e 'import { createStabilizedMigrationFolder } from "./lib/db/scripts/lib/migration-sql-order.mjs"; console.log(createStabilizedMigrationFolder("./lib/db/drizzle"));')"
if [[ ! -d "$STABILIZED" ]]; then
  echo "STOP: failed to create stabilized migration folder"
  exit 11
fi

apply_migrations() {
  for migration in "$STABILIZED"/*.sql; do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done
}

printf 'Running operational PostgreSQL authority regression proof...\n'
reset_database
apply_migrations
pnpm --filter @workspace/api-server exec tsx --test \
  tests/runtime-authorities-postgres.integration.test.ts

printf 'Running merchant customer-payment authority regression proof...\n'
reset_database
apply_migrations
pnpm --filter @workspace/api-server exec tsx --test \
  tests/merchant-customer-payment-authority-postgres.integration.test.ts

printf 'Running live Meta PostgreSQL transport regression proof...\n'
reset_database
apply_migrations
pnpm --filter @workspace/api-server exec tsx --test \
  tests/meta-live-reply-postgres.integration.test.ts

echo "Running repository builds..."
pnpm -r --if-present run build

git diff --check "$GOLDEN"

FINAL_ALLOWED_REGEX='^(artifacts/api-server/src/app\.ts|artifacts/api-server/src/index\.ts|artifacts/api-server/src/routes/index\.ts|artifacts/api-server/src/services/productionReleaseReadiness\.ts|artifacts/api-server/tests/production-release-readiness\.test\.ts|docs/production-kms-hsm-readiness\.md|docs/production-release-readiness\.md)$'
while IFS= read -r changed; do
  [[ -z "$changed" ]] && continue
  if [[ ! "$changed" =~ $FINAL_ALLOWED_REGEX ]]; then
    echo "STOP: unexpected final diff path: $changed"
    exit 12
  fi
done < <(git diff --name-only "$GOLDEN")

if git status --porcelain | grep -E '(^| )pnpm-workspace\.yaml$|(^| )pnpm-lock\.yaml$' >/dev/null; then
  echo "STOP: package policy or lockfile changed unexpectedly"
  git status --short
  exit 13
fi

cd "$REPO"
git fetch "$REMOTE" "$BRANCH" "$COORDINATOR"
if [[ "$(git rev-parse "$REMOTE/$COORDINATOR")" != "$GOLDEN" ]]; then
  echo "STOP: coordinator moved during validation"
  exit 14
fi
if [[ "$(git rev-parse "$REMOTE/$BRANCH")" != "$BRANCH_HEAD" ]]; then
  echo "STOP: remote work branch moved during validation"
  exit 15
fi

cd "$WORKTREE"
git add -A
if [[ -z "$(git status --porcelain)" ]]; then
  echo "STOP: finalization produced no changes"
  exit 16
fi
git commit -m "feat: add production release activation gates"
FINAL_SHA="$(git rev-parse HEAD)"
git push "$REMOTE" "HEAD:$BRANCH"

echo "PRODUCTION_RELEASE_VALIDATION_READY $FINAL_SHA"
echo "PRODUCTION_LAUNCH_BLOCKED_EXTERNAL SAAS_BILLING_PRODUCTION_PROVIDER_UNAVAILABLE PRODUCTION_BACKUP_RESTORE_EXTERNAL_PROOF_REQUIRED"
