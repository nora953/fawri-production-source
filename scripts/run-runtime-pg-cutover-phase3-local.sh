#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/fawri-production-source"
REMOTE="github"
BRANCH="parallel/runtime-authorities-pg-cutover"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="2ee2cd17e50ef465d2f2871e2ece66623558967d"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/runtime-pg-cutover-phase3-$$"
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

export CI=1
pnpm install --offline --frozen-lockfile --ignore-scripts

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

printf 'Applying canonical migrations from temporary stabilized folder...\n'
for migration in "$STABILIZED"/*.sql; do
  echo "Applying $(basename "$migration")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

printf 'Running operational PostgreSQL authority integration proof...\n'
pnpm --filter @workspace/api-server exec tsx --test tests/runtime-authorities-postgres.integration.test.ts

echo "RUNTIME_PG_PHASE3_DATABASE_READY $BRANCH_HEAD"
