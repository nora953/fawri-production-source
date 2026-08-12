#!/usr/bin/env bash
set -euo pipefail

BRANCH="parallel/frontend-translation-structure-hardening"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="33bd13d412bb10c67c6d3769e16474387f18e110"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/auth-structure-$$"
AUDIT_LOG="$CACHE_ROOT/auth-structure-audit-$$.log"

cleanup() {
  cd "$HOME/fawri-production-source" 2>/dev/null || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
  rm -f "$AUDIT_LOG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$CACHE_ROOT"
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

git worktree add --detach "$WORKTREE" "$BRANCH_HEAD" >/dev/null
cd "$WORKTREE"
export PYTHONDONTWRITEBYTECODE=1

printf '=== DEPENDENCIES ===\n'
pnpm install --offline --frozen-lockfile --ignore-scripts >/dev/null

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

printf '\n=== TYPECHECK + BUILD ===\n'
pnpm run build

printf '\n=== AUTH SOURCE IMPORT SMOKE ===\n'
(
  cd artifacts/api-server
  NODE_ENV=test \
  LOG_LEVEL=error \
  FAWRI_PASSWORD_SALT=test-password-salt \
  FAWRI_ADMIN_SESSION_SECRET=test-admin-session-secret \
  FAWRI_MERCHANT_SESSION_SECRET=test-merchant-session-secret \
  META_APP_ID=test-meta-app \
  META_CONFIG_ID=test-meta-config \
  META_REDIRECT_URI=http://127.0.0.1/api/meta/callback \
  pnpm exec tsx -e "import('./src/app.ts').then(() => { console.log('AUTH_SOURCE_IMPORT_READY'); process.exit(0); }).catch((error) => { console.error(error?.stack || error); process.exit(1); })"
)

printf '\n=== AUTH REGRESSION TESTS ===\n'
(
  cd artifacts/api-server
  node --test \
    tests/merchant-session.integration.test.mjs \
    tests/merchant-status-access.integration.test.mjs \
    tests/admin-permissions.integration.test.mjs \
    tests/admin-work-monitor.integration.test.mjs \
    tests/subscription-lifecycle.integration.test.mjs \
    tests/support-preview.integration.test.mjs
)

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
