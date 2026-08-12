#!/usr/bin/env bash
set -euo pipefail

BRANCH="parallel/frontend-translation-structure-hardening"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="33bd13d412bb10c67c6d3769e16474387f18e110"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/auth-structure-$$"
AUDIT_LOG="$CACHE_ROOT/auth-structure-audit-$$.log"
ORIGINAL_AUTH="$CACHE_ROOT/auth-original-$$.ts"

cleanup() {
  cd "$HOME/fawri-production-source" 2>/dev/null || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
  rm -f "$AUDIT_LOG" "$ORIGINAL_AUTH" >/dev/null 2>&1 || true
}
trap cleanup EXIT

require_disposable_postgres() {
  [[ -n "${DATABASE_URL:-}" ]] || {
    echo "STOP: DATABASE_URL is required for the disposable local PostgreSQL proof"
    exit 30
  }

  local host db
  host="$(node -e 'const u=new URL(process.argv[1]); console.log(u.hostname)' "$DATABASE_URL")"
  db="$(node -e 'const u=new URL(process.argv[1]); console.log(u.pathname.replace(/^\//, ""))' "$DATABASE_URL")"
  if [[ "$host" != "127.0.0.1" && "$host" != "localhost" ]]; then
    echo "STOP: auth structure validation permits local PostgreSQL only; got $host"
    exit 31
  fi
  [[ "$db" == "fawri_ci" ]] || {
    echo "STOP: disposable database must be exactly fawri_ci; got $db"
    exit 32
  }

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()' | grep -qx 'fawri_ci' || {
    echo "STOP: local fawri_ci PostgreSQL is not reachable"
    exit 33
  }
  echo "LOCAL_POSTGRES_READY database=fawri_ci host=$host"
}

reset_schema() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
CREATE SCHEMA public;
SQL
  FAWRI_ALLOW_MIGRATION_SMOKE=1 pnpm --filter @workspace/db run schema:smoke >/dev/null
}

run_auth_regression_tests() {
  printf '%s\n' '--- current Auth unit/cutover contracts ---'
  pnpm --filter @workspace/api-server exec tsx --test \
    ./tests/auth-account-repository.test.ts \
    ./tests/auth-password-service.test.ts \
    ./tests/auth-policy.test.ts \
    ./tests/auth-security-store.test.ts \
    ./tests/auth-cutover-contract.test.mjs \
    ./tests/auth-otp-contract-continuity.test.mjs \
    ./tests/landing-plan-intent-continuity.test.ts

  printf '%s\n' '--- current merchant access/session contracts ---'
  node --test \
    artifacts/api-server/tests/merchant-session.integration.test.mjs \
    artifacts/api-server/tests/merchant-status-access.integration.test.mjs \
    artifacts/api-server/tests/meta-webhook-security.integration.test.mjs

  printf '%s\n' '--- PostgreSQL Auth HTTP concurrency proof ---'
  FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY=required \
  FAWRI_AUTH_SECURITY_SECRET='auth-structure-proof-secret-with-more-than-thirty-two-characters' \
  FAWRI_PASSWORD_SALT='auth-structure-proof-password-salt' \
    pnpm --filter @workspace/api-server exec tsx --test \
      ./tests/auth-postgres-concurrency.integration.test.mjs
}

mkdir -p "$CACHE_ROOT"
cd "$HOME/fawri-production-source"
git fetch github "$BRANCH" "$COORDINATOR"

COORD_HEAD="$(git rev-parse "github/$COORDINATOR")"
[[ "$COORD_HEAD" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved: $COORD_HEAD"
  exit 21
}

BRANCH_HEAD="$(git rev-parse "github/$BRANCH")"
MERGE_BASE="$(git merge-base "$GOLDEN" "$BRANCH_HEAD")"
[[ "$MERGE_BASE" == "$GOLDEN" ]] || {
  echo "STOP: branch merge-base changed: $MERGE_BASE"
  exit 22
}

require_disposable_postgres

git worktree add --detach "$WORKTREE" "$BRANCH_HEAD" >/dev/null
cd "$WORKTREE"
export PYTHONDONTWRITEBYTECODE=1

printf '=== DEPENDENCIES ===\n'
pnpm install --offline --frozen-lockfile --ignore-scripts >/dev/null

cp artifacts/api-server/src/routes/auth.ts "$ORIGINAL_AUTH"
printf 'AUTH_BASELINE_SOURCE_CAPTURED\n'

printf '\n=== BASELINE DATABASE RESET + SCHEMA ===\n'
reset_schema
printf 'AUTH_BASELINE_SCHEMA_READY\n'

printf '\n=== BASELINE TYPECHECK + BUILD ===\n'
pnpm run build

printf '\n=== BASELINE AUTH REGRESSION ===\n'
run_auth_regression_tests
printf 'AUTH_BASELINE_REGRESSION_READY\n'

printf '\n=== AUTH REFACTOR TOOLING FIX ===\n'
python3 - <<'PY'
from pathlib import Path
path = Path('scripts/refactor-auth-structure.mjs')
source = path.read_text(encoding='utf-8')
old = "  const localNames = new Set(byName.keys());"
new = "  const localNames = new Set([...byName.keys(), ...externalNames]);"
if old in source:
    path.write_text(source.replace(old, new, 1), encoding='utf-8')
elif new not in source:
    raise SystemExit('STOP: auth refactor dependency matcher changed unexpectedly')
print('AUTH_RUNTIME_EXTERNAL_REFS_ENABLED')
PY

printf '\n=== AUTH ROUTE REFACTOR ===\n'
node scripts/refactor-auth-structure.mjs

printf '\n=== AUTH SOURCE PARITY ===\n'
node scripts/assert-auth-structure-parity.mjs "$ORIGINAL_AUTH"

printf '\n=== AUTH MODULE LINE COUNTS ===\n'
wc -l artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/routes/authRuntime*.ts artifacts/api-server/src/routes/authRoutesPart*.ts

if wc -l artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/routes/authRuntime*.ts artifacts/api-server/src/routes/authRoutesPart*.ts | awk '$2 != "total" && $1 >= 1800 { bad=1 } END { exit bad ? 1 : 0 }'; then
  :
else
  echo "STOP: auth split still contains a critical file"
  exit 23
fi

printf '\n=== DIFF CHECK ===\n'
git diff --check

printf '\n=== POST-REFACTOR TYPECHECK + BUILD ===\n'
pnpm run build

printf '\n=== POST-REFACTOR DATABASE RESET + SCHEMA ===\n'
reset_schema
printf 'AUTH_POST_REFACTOR_SCHEMA_READY\n'

printf '\n=== POST-REFACTOR AUTH REGRESSION ===\n'
run_auth_regression_tests
printf 'AUTH_POST_REFACTOR_REGRESSION_READY\n'

printf '\n=== STRUCTURE AUDIT ===\n'
set +e
python3 scripts/audit-translation-structure.py | tee "$AUDIT_LOG"
AUDIT_STATUS=${PIPESTATUS[0]}
set -e

if grep '^BLOCKER ' "$AUDIT_LOG" | grep -v '^BLOCKER critical executable files=1$' >/dev/null; then
  echo "STOP: unexpected blocker after auth split"
  grep '^BLOCKER ' "$AUDIT_LOG"
  exit 24
fi

grep -q '^BLOCKER critical executable files=1$' "$AUDIT_LOG" || {
  echo "STOP: expected exactly one remaining critical file"
  grep '^BLOCKER ' "$AUDIT_LOG" || true
  exit 25
}

git add scripts/refactor-auth-structure.mjs artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/routes/authRuntime.ts artifacts/api-server/src/routes/authRuntimePart*.ts artifacts/api-server/src/routes/authRoutesPart*.ts
if git diff --cached --quiet; then
  echo "STOP: auth refactor produced no source changes"
  exit 26
fi

git -c user.name="nora953" -c user.email="45720986+nora953@users.noreply.github.com" \
  commit -m "refactor: split auth runtime and route registrations"
NEW_HEAD="$(git rev-parse HEAD)"

printf '\n=== REMOTE SAFETY RECHECK ===\n'
git fetch github "$BRANCH" "$COORDINATOR"
[[ "$(git rev-parse "github/$COORDINATOR")" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved during validation"
  exit 27
}
[[ "$(git rev-parse "github/$BRANCH")" == "$BRANCH_HEAD" ]] || {
  echo "STOP: branch moved during validation"
  exit 28
}

git push github "HEAD:refs/heads/$BRANCH"

printf '\nAUTH_STRUCTURE_READY head=%s audit_status=%s\n' "$NEW_HEAD" "$AUDIT_STATUS"
