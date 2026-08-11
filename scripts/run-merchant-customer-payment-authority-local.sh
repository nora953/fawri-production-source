#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/fawri-production-source"
REMOTE="github"
BRANCH="parallel/merchant-customer-payment-confirmation-authority"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="a2ee58e4fc46123551c24f9741612780cda2ebc2"
EXPECTED_PRE_RUNNER_HEAD="bf08156d5b133a4f5f7735855b9f60383dd88cfb"
RUNNER_PATH="scripts/run-merchant-customer-payment-authority-local.sh"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/merchant-customer-payment-$$"
TEMP_BRANCH="parallel/merchant-customer-payment-authority-finalize-temp-$$"
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
  "artifacts/api-server/src/services/postgresOrderPaymentProviderAuthority.ts"
  "artifacts/api-server/tests/merchant-customer-payment-authority-postgres.integration.test.ts"
  "scripts/.tmp-merchant-customer-payment-authority.py"
  "scripts/.tmp-merchant-payment-decisionrow-fix.py"
  "scripts/.tmp-merchant-payment-enum-cast-fix.py"
  "scripts/.tmp-merchant-payment-order-mapping-fix.py"
  "scripts/.tmp-merchant-payment-provider-safety.py"
  "$RUNNER_PATH"
)
mapfile -t INITIAL_CHANGED < <(git diff --name-only "$GOLDEN".."$BRANCH_HEAD" | sort)
printf '%s\n' "${INITIAL_ALLOWED[@]}" | sort > "$CACHE_ROOT/merchant-payment-allowed-$$.txt"
printf '%s\n' "${INITIAL_CHANGED[@]}" > "$CACHE_ROOT/merchant-payment-changed-$$.txt"
if ! diff -u "$CACHE_ROOT/merchant-payment-allowed-$$.txt" "$CACHE_ROOT/merchant-payment-changed-$$.txt" >/dev/null; then
  echo "STOP: unexpected pre-finalization branch scope"
  diff -u "$CACHE_ROOT/merchant-payment-allowed-$$.txt" "$CACHE_ROOT/merchant-payment-changed-$$.txt" || true
  rm -f "$CACHE_ROOT/merchant-payment-allowed-$$.txt" "$CACHE_ROOT/merchant-payment-changed-$$.txt"
  exit 6
fi
rm -f "$CACHE_ROOT/merchant-payment-allowed-$$.txt" "$CACHE_ROOT/merchant-payment-changed-$$.txt"

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

python3 scripts/.tmp-merchant-customer-payment-authority.py
python3 scripts/.tmp-merchant-payment-decisionrow-fix.py
python3 scripts/.tmp-merchant-payment-enum-cast-fix.py
python3 scripts/.tmp-merchant-payment-order-mapping-fix.py
python3 scripts/.tmp-merchant-payment-provider-safety.py
rm -f \
  scripts/.tmp-merchant-customer-payment-authority.py \
  scripts/.tmp-merchant-payment-decisionrow-fix.py \
  scripts/.tmp-merchant-payment-enum-cast-fix.py \
  scripts/.tmp-merchant-payment-order-mapping-fix.py \
  scripts/.tmp-merchant-payment-provider-safety.py \
  "$RUNNER_PATH"

export CI=1
pnpm install --offline --frozen-lockfile --ignore-scripts

echo "Generating deterministic migration stage 0007..."
pnpm --filter @workspace/db run schema:generate

git diff --check "$GOLDEN"

echo "Running repository typecheck..."
pnpm run typecheck

printf 'Resetting disposable PostgreSQL database %s...\n' "$DB_NAME"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
SQL

echo "Running migration smoke proof..."
FAWRI_ALLOW_MIGRATION_SMOKE=1 pnpm --filter @workspace/db run schema:smoke

echo "Running existing PostgreSQL runtime authority regression proof..."
pnpm --filter @workspace/api-server exec tsx --test \
  tests/runtime-authorities-postgres.integration.test.ts

echo "Running merchant customer-payment confirmation authority proof..."
pnpm --filter @workspace/api-server exec tsx --test \
  tests/merchant-customer-payment-authority-postgres.integration.test.ts

echo "Running repository builds..."
pnpm -r --if-present run build

git diff --check "$GOLDEN"

FINAL_ALLOWED_REGEX='^(artifacts/api-server/src/routes/auth\.ts|artifacts/api-server/src/routes/order-operations\.ts|artifacts/api-server/src/services/orderOperationsRuntime\.ts|artifacts/api-server/src/services/postgresManualConversationAuthority\.ts|artifacts/api-server/src/services/postgresOperationalNotificationAuthority\.ts|artifacts/api-server/src/services/postgresOrderOperationsAuthority\.ts|artifacts/api-server/src/services/postgresOrderPaymentProviderAuthority\.ts|artifacts/api-server/tests/merchant-customer-payment-authority-postgres\.integration\.test\.ts|artifacts/fawri/src/lib/types\.ts|artifacts/fawri/src/pages/dashboard/NotificationsPage\.tsx|artifacts/fawri/src/pages/dashboard/ServerOrdersPage\.tsx|lib/db/src/schema/orders\.ts|lib/db/src/schema/tenant-security\.ts|lib/db/migration-stages/0007/stage\.json|lib/db/migration-stages/0007/preimage/orders\.ts|lib/db/migration-stages/0007/preimage/tenant-security\.ts|lib/db/drizzle/0007_.*\.sql|lib/db/drizzle/meta/0007_snapshot\.json|lib/db/drizzle/meta/_journal\.json)$'
while IFS= read -r changed; do
  [[ -z "$changed" ]] && continue
  if [[ ! "$changed" =~ $FINAL_ALLOWED_REGEX ]]; then
    echo "STOP: unexpected final diff path: $changed"
    exit 10
  fi
done < <(git diff --name-only "$GOLDEN")

if git status --porcelain | grep -E '(^| )pnpm-workspace\.yaml$|(^| )pnpm-lock\.yaml$' >/dev/null; then
  echo "STOP: package policy or lockfile changed unexpectedly"
  git status --short
  exit 11
fi

cd "$REPO"
git fetch "$REMOTE" "$BRANCH" "$COORDINATOR"
if [[ "$(git rev-parse "$REMOTE/$COORDINATOR")" != "$GOLDEN" ]]; then
  echo "STOP: coordinator moved during validation"
  exit 12
fi
if [[ "$(git rev-parse "$REMOTE/$BRANCH")" != "$BRANCH_HEAD" ]]; then
  echo "STOP: remote work branch moved during validation"
  exit 13
fi

cd "$WORKTREE"
git add -A
if [[ -z "$(git status --porcelain)" ]]; then
  echo "STOP: finalization produced no changes"
  exit 14
fi
git commit -m "feat: add merchant customer payment confirmation authority"
FINAL_SHA="$(git rev-parse HEAD)"
git push "$REMOTE" "HEAD:$BRANCH"

echo "MERCHANT_CUSTOMER_PAYMENT_AUTHORITY_READY $FINAL_SHA"
