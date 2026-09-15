#!/usr/bin/env bash
set -euo pipefail

BRANCH="parallel/frontend-translation-structure-hardening"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="33bd13d412bb10c67c6d3769e16474387f18e110"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/admin-page-structure-$$"
AUDIT_LOG="$CACHE_ROOT/admin-page-structure-audit-$$.log"

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

printf '\n=== ADMIN PAGE REFACTOR ===\n'
node scripts/refactor-admin-page-structure.mjs

printf '\n=== ADMIN PAGE LINE COUNTS ===\n'
wc -l \
  artifacts/fawri/src/pages/AdminPage.tsx \
  artifacts/fawri/src/pages/admin/AdminPageSections.tsx \
  artifacts/fawri/src/pages/admin/AdminPageDialogs.tsx \
  artifacts/fawri/src/pages/admin/AdminPageParts.ts \
  artifacts/fawri/src/pages/admin/useAdminPageController.tsx \
  artifacts/fawri/src/pages/admin/AdminPageView.tsx

if find artifacts/fawri/src/pages/admin -maxdepth 1 -type f \( -name 'AdminPage*.ts' -o -name 'AdminPage*.tsx' -o -name 'useAdminPageController.tsx' \) -print0 \
  | xargs -0 wc -l \
  | awk '$2 != "total" && $1 >= 1800 { bad=1 } END { exit bad ? 1 : 0 }'; then
  :
else
  echo "STOP: AdminPage split still contains a critical file"
  exit 23
fi

printf '\n=== DIFF CHECK ===\n'
git diff --check

printf '\n=== TYPECHECK + BUILD ===\n'
pnpm run build

printf '\n=== STRUCTURE AUDIT ===\n'
set +e
python3 scripts/audit-translation-structure.py | tee "$AUDIT_LOG"
AUDIT_STATUS=${PIPESTATUS[0]}
set -e

if grep '^BLOCKER ' "$AUDIT_LOG" | grep -v '^BLOCKER critical executable files=2$' >/dev/null; then
  echo "STOP: unexpected blocker after AdminPage split"
  grep '^BLOCKER ' "$AUDIT_LOG"
  exit 24
fi

grep -q '^BLOCKER critical executable files=2$' "$AUDIT_LOG" || {
  echo "STOP: expected exactly two remaining critical files"
  grep '^BLOCKER ' "$AUDIT_LOG" || true
  exit 25
}

git add artifacts/fawri/src/pages/AdminPage.tsx artifacts/fawri/src/pages/admin
if git diff --cached --quiet; then
  echo "STOP: AdminPage refactor produced no source changes"
  exit 26
fi

git -c user.name="nora953" -c user.email="45720986+nora953@users.noreply.github.com" \
  commit -m "refactor: split admin page controller and view"
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

printf '\nADMIN_PAGE_STRUCTURE_READY head=%s audit_status=%s\n' "$NEW_HEAD" "$AUDIT_STATUS"
