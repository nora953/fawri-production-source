#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/fawri-production-source"
REMOTE="github"
BRANCH="parallel/live-meta-reply-transport-v2"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="235f038588fee81d2c63a7fee76b92eec431fd62"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/live-meta-reply-$$"
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
git diff --check "$GOLDEN"..HEAD

export CI=1
pnpm install --offline --frozen-lockfile --ignore-scripts

echo "Running repository typecheck..."
pnpm run typecheck

echo "Running Meta send client and existing reply-race regressions..."
pnpm --filter @workspace/api-server exec tsx --test \
  tests/meta-graph-send-client.test.ts \
  tests/meta-webhook-worker-core.test.ts

printf 'Resetting disposable PostgreSQL database %s...\n' "$DB_NAME"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL

STABILIZED="$(node --input-type=module -e 'import { createStabilizedMigrationFolder } from "./lib/db/scripts/lib/migration-sql-order.mjs"; console.log(createStabilizedMigrationFolder("./lib/db/drizzle"));')"
if [[ ! -d "$STABILIZED" ]]; then
  echo "STOP: failed to create stabilized migration folder"
  exit 7
fi
for migration in "$STABILIZED"/*.sql; do
  echo "Applying $(basename "$migration")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

echo "Running live Meta PostgreSQL transport proof..."
pnpm --filter @workspace/api-server exec tsx --test \
  tests/meta-live-reply-postgres.integration.test.ts

echo "Running production provider wiring regressions..."
pnpm --filter @workspace/api-server exec tsx --test \
  tests/production-runtime-provider-wiring.test.ts

echo "Running repository builds..."
pnpm -r --if-present run build

git diff --check "$GOLDEN"..HEAD
if [[ -n "$(git status --porcelain)" ]]; then
  echo "STOP: validation changed the detached worktree"
  git status --short
  exit 8
fi

echo "LIVE_META_REPLY_TRANSPORT_READY $BRANCH_HEAD"
