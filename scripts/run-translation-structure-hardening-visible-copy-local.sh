#!/usr/bin/env bash
set -euo pipefail

BRANCH="parallel/frontend-translation-structure-hardening"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="33bd13d412bb10c67c6d3769e16474387f18e110"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/translation-visible-copy-$$"
AUDIT_LOG="$CACHE_ROOT/translation-visible-copy-audit-$$.log"

cleanup() {
  cd "$HOME/fawri-production-source" 2>/dev/null || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
  rm -f "$AUDIT_LOG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! git remote get-url github >/dev/null 2>&1; then
  echo "STOP: github remote is required"
  exit 20
fi

mkdir -p "$CACHE_ROOT"
git fetch github "$BRANCH" "$COORDINATOR"

COORD_HEAD="$(git rev-parse "github/$COORDINATOR")"
[[ "$COORD_HEAD" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved: $COORD_HEAD"
  exit 21
}

# Capture the exact remote branch head at validation start. The same SHA must
# remain remote until the final push; this protects against concurrent writes
# without hard-coding the runner's own commit SHA.
BRANCH_HEAD="$(git rev-parse "github/$BRANCH")"
MERGE_BASE="$(git merge-base "$GOLDEN" "$BRANCH_HEAD")"
[[ "$MERGE_BASE" == "$GOLDEN" ]] || {
  echo "STOP: branch merge-base changed: $MERGE_BASE"
  exit 22
}

git worktree add --detach "$WORKTREE" "$BRANCH_HEAD" >/dev/null
cd "$WORKTREE"
export PYTHONDONTWRITEBYTECODE=1

printf '=== APPLY CENTRALIZED VISIBLE COPY ===\n'
node scripts/harden-visible-copy-centralization.mjs
node scripts/harden-auth-shell-copy.mjs

printf '\n=== DEPENDENCIES ===\n'
pnpm install --offline --frozen-lockfile --ignore-scripts >/dev/null

printf '\n=== STRUCTURE AUDIT ===\n'
set +e
python3 scripts/audit-translation-structure.py | tee "$AUDIT_LOG"
AUDIT_STATUS=${PIPESTATUS[0]}
set -e

VISIBLE_COUNT="$(awk '/=== VISIBLE HARDCODED COPY CANDIDATES ===/{getline; sub(/^count=/, ""); print; exit}' "$AUDIT_LOG")"
VISIBLE_COUNT="${VISIBLE_COUNT:-999}"

if [[ "$VISIBLE_COUNT" != "0" ]]; then
  printf '\n=== RESIDUAL VISIBLE COPY ===\n'
  sed -n '/=== VISIBLE HARDCODED COPY CANDIDATES ===/,/=== LONG EXECUTABLE SOURCE FILES ===/p' "$AUDIT_LOG"
  printf '\nTRANSLATION_VISIBLE_COPY_NEEDS_WORK count=%s head=%s\n' "$VISIBLE_COUNT" "$BRANCH_HEAD"
  exit 0
fi

# The structure audit is still expected to report the three large-file blockers
# until the next phase. Visible copy and localized-copy/parity blockers must be gone.
if grep '^BLOCKER ' "$AUDIT_LOG" | grep -v '^BLOCKER critical executable files=' >/dev/null; then
  echo "STOP: unexpected non-structure blocker remains"
  grep '^BLOCKER ' "$AUDIT_LOG"
  exit 23
fi

printf '\n=== DIFF CHECK ===\n'
git diff --check

printf '\n=== TYPECHECK + BUILD ===\n'
pnpm run build

find scripts -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find scripts -type f -name '*.py[co]' -delete 2>/dev/null || true

git add artifacts/fawri/src
if git diff --cached --quiet; then
  echo "STOP: centralization produced no source changes"
  exit 24
fi

git -c user.name="nora953" -c user.email="45720986+nora953@users.noreply.github.com" \
  commit -m "i18n: centralize remaining visible UI vocabulary"
NEW_HEAD="$(git rev-parse HEAD)"

printf '\n=== REMOTE SAFETY RECHECK ===\n'
git fetch github "$BRANCH" "$COORDINATOR"
[[ "$(git rev-parse "github/$COORDINATOR")" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved during validation"
  exit 25
}
[[ "$(git rev-parse "github/$BRANCH")" == "$BRANCH_HEAD" ]] || {
  echo "STOP: branch moved during validation"
  exit 26
}

git push github "HEAD:refs/heads/$BRANCH"

printf '\nTRANSLATION_VISIBLE_COPY_READY head=%s audit_status=%s\n' "$NEW_HEAD" "$AUDIT_STATUS"
