#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/fawri-production-source"
REMOTE="github"
BRANCH="parallel/runtime-authorities-pg-cutover"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="2ee2cd17e50ef465d2f2871e2ece66623558967d"
TEMP_BRANCH="parallel/runtime-authorities-pg-cutover-finalize-temp"
TEMP_BRANCH_EXPECTED="779f807ee8ca2ecc6986c1b00f829df9114ba70e"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/runtime-pg-cutover-final-$$"
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

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "STOP: DATABASE_URL is required"
  exit 4
fi
DB_HOST="$(node -e 'const u=new URL(process.argv[1]); console.log(u.hostname)' "$DATABASE_URL")"
DB_NAME="$(node -e 'const u=new URL(process.argv[1]); console.log(u.pathname.replace(/^\//,""))' "$DATABASE_URL")"
if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]]; then
  echo "STOP: local PostgreSQL only; got host $DB_HOST"
  exit 5
fi
if [[ "$DB_NAME" != "fawri_ci" ]]; then
  echo "STOP: disposable database must be exactly fawri_ci; got $DB_NAME"
  exit 6
fi

mkdir -p "$CACHE_ROOT"
cleanup() {
  if [[ -n "$STABILIZED" ]]; then rm -rf "$STABILIZED" >/dev/null 2>&1 || true; fi
  cd "$REPO"
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$BRANCH_HEAD"
cd "$WORKTREE"

for patch in \
  scripts/.tmp-runtime-pg-phase1-types-fix.py \
  scripts/.tmp-runtime-pg-worker-core.py \
  scripts/.tmp-runtime-pg-webhook-security.py \
  scripts/.tmp-runtime-pg-auth-public.py \
  scripts/.tmp-runtime-pg-auth-login.py \
  scripts/.tmp-runtime-pg-legacy-router.py
do
  python3 "$patch"
done

git rm \
  scripts/.tmp-runtime-pg-phase1-types-fix.py \
  scripts/.tmp-runtime-pg-worker-core.py \
  scripts/.tmp-runtime-pg-webhook-security.py \
  scripts/.tmp-runtime-pg-auth-public.py \
  scripts/.tmp-runtime-pg-auth-login.py \
  scripts/.tmp-runtime-pg-legacy-router.py \
  scripts/run-runtime-pg-cutover-phase1-local.sh \
  scripts/run-runtime-pg-cutover-phase2-local.sh \
  scripts/run-runtime-pg-cutover-phase3-local.sh \
  scripts/run-runtime-pg-cutover-final-local.sh

git diff --check

unexpected=0
while IFS= read -r file; do
  case "$file" in
    artifacts/api-server/src/middleware/authSession.ts|\
    artifacts/api-server/src/middleware/manualConversationWebhookAccess.ts|\
    artifacts/api-server/src/middleware/metaWebhookQueueIngress.ts|\
    artifacts/api-server/src/routes/auth-login-route-support.ts|\
    artifacts/api-server/src/routes/auth-password-route-support.ts|\
    artifacts/api-server/src/routes/auth-public-routes.ts|\
    artifacts/api-server/src/routes/auth-route-common.ts|\
    artifacts/api-server/src/routes/auth-session-routes.ts|\
    artifacts/api-server/src/routes/catalog-operations.ts|\
    artifacts/api-server/src/routes/channel-durable-job-admin.ts|\
    artifacts/api-server/src/routes/channel-operations.ts|\
    artifacts/api-server/src/routes/conversation-operations.ts|\
    artifacts/api-server/src/routes/merchant-settings.ts|\
    artifacts/api-server/src/routes/order-operations.ts|\
    artifacts/api-server/src/services/catalogProductNormalization.ts|\
    artifacts/api-server/src/services/merchantOperationalAccess.ts|\
    artifacts/api-server/src/services/metaChannelJobs.ts|\
    artifacts/api-server/src/services/metaPageDirectory.ts|\
    artifacts/api-server/src/services/metaWebhookWorker.ts|\
    artifacts/api-server/src/services/operationalPostgresAuthority.ts|\
    artifacts/api-server/src/services/postgresCatalogAuthority.ts|\
    artifacts/api-server/src/services/postgresDurableJobQueue.ts|\
    artifacts/api-server/src/services/postgresManualConversationAuthority.ts|\
    artifacts/api-server/src/services/postgresMerchantAccountAuthority.ts|\
    artifacts/api-server/src/services/postgresMerchantAuthSecurityAuthority.ts|\
    artifacts/api-server/src/services/postgresMerchantSettingsAuthority.ts|\
    artifacts/api-server/src/services/postgresMetaChannelAuthority.ts|\
    artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts|\
    artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts|\
    artifacts/api-server/src/services/runtimeProviderBootstrap.ts|\
    artifacts/api-server/tests/runtime-authorities-postgres.integration.test.ts)
      ;;
    *)
      echo "STOP: unexpected final diff path: $file"
      unexpected=1
      ;;
  esac
done < <(git diff --name-only "$GOLDEN")
if [[ "$unexpected" -ne 0 ]]; then
  exit 7
fi

export CI=1
pnpm install --offline --frozen-lockfile --ignore-scripts

echo "Running final repository typecheck/build on cleaned product tree..."
pnpm run typecheck
pnpm -r --if-present run build

printf 'Resetting disposable PostgreSQL database %s for final exact-state proof...\n' "$DB_NAME"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL

STABILIZED="$(node --input-type=module -e 'import { createStabilizedMigrationFolder } from "./lib/db/scripts/lib/migration-sql-order.mjs"; console.log(createStabilizedMigrationFolder("./lib/db/drizzle"));')"
if [[ ! -d "$STABILIZED" ]]; then
  echo "STOP: failed to create stabilized migration folder"
  exit 8
fi
for migration in "$STABILIZED"/*.sql; do
  echo "Applying $(basename "$migration")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

pnpm --filter @workspace/api-server exec tsx --test tests/runtime-authorities-postgres.integration.test.ts

git diff --check
if git status --porcelain | grep -E 'scripts/(\.tmp-runtime-pg|run-runtime-pg-cutover)' >/dev/null; then
  echo "STOP: temporary runtime validation files remain"
  git status --short
  exit 9
fi

# Ensure the remote branch did not move while validation was running.
git fetch "$REMOTE" "$BRANCH" "$COORDINATOR"
if [[ "$(git rev-parse "$REMOTE/$COORDINATOR")" != "$GOLDEN" ]]; then
  echo "STOP: coordinator moved during validation"
  exit 10
fi
if [[ "$(git rev-parse "$REMOTE/$BRANCH")" != "$BRANCH_HEAD" ]]; then
  echo "STOP: runtime branch moved during validation"
  exit 11
fi

git add -A
git commit -m "feat: cut operational runtime authorities to PostgreSQL"
FINAL_SHA="$(git rev-parse HEAD)"
git push "$REMOTE" HEAD:"refs/heads/$BRANCH"

# Remove the assistant-created temporary safety ref only if it is still exactly
# the staging SHA it was created from; never delete an unexpectedly moved ref.
TEMP_REMOTE_SHA="$(git ls-remote "$REMOTE" "refs/heads/$TEMP_BRANCH" | awk '{print $1}')"
if [[ -n "$TEMP_REMOTE_SHA" ]]; then
  if [[ "$TEMP_REMOTE_SHA" == "$TEMP_BRANCH_EXPECTED" ]]; then
    git push "$REMOTE" --delete "$TEMP_BRANCH"
  else
    echo "NOTICE: temporary ref moved unexpectedly; left untouched at $TEMP_REMOTE_SHA"
  fi
fi

echo "RUNTIME_PG_CUTOVER_READY $FINAL_SHA"
