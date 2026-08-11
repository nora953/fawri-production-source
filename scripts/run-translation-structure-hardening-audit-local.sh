#!/usr/bin/env bash
set -euo pipefail

BRANCH="parallel/frontend-translation-structure-hardening"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="33bd13d412bb10c67c6d3769e16474387f18e110"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/translation-structure-hardening-audit-$$"
AUDIT_LOG="$CACHE_ROOT/translation-structure-hardening-audit-$$.log"

cleanup() {
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
if [[ "$COORD_HEAD" != "$GOLDEN" ]]; then
  echo "STOP: coordinator moved: $COORD_HEAD"
  exit 21
fi

BRANCH_HEAD="$(git rev-parse "github/$BRANCH")"
MERGE_BASE="$(git merge-base "$GOLDEN" "$BRANCH_HEAD")"
if [[ "$MERGE_BASE" != "$GOLDEN" ]]; then
  echo "STOP: branch is not based on golden: merge-base=$MERGE_BASE"
  exit 22
fi

git worktree add --detach "$WORKTREE" "$BRANCH_HEAD" >/dev/null
cd "$WORKTREE"
export PYTHONDONTWRITEBYTECODE=1

set +e
python3 scripts/audit-translation-structure.py | tee "$AUDIT_LOG"
AUDIT_STATUS=${PIPESTATUS[0]}
set -e

printf '\n=== COMPACT HARDENING TARGETS ===\n'
printf '%s\n' '-- dictionary parity --'
awk '/=== GENERAL I18N PARITY ===/{flag=1} /=== LOCALIZED COPY OUTSIDE/{flag=0} flag' "$AUDIT_LOG" | sed '/^$/d'

printf '%s\n' '-- localized copy authorities --'
awk '/=== LOCALIZED COPY OUTSIDE TRANSLATION AUTHORITY ===/{flag=1;next} /=== VISIBLE HARDCODED COPY CANDIDATES ===/{flag=0} flag' "$AUDIT_LOG" | sed '/^$/d'

printf '%s\n' '-- visible hardcoded copy files --'
awk -F: '/^artifacts\/fawri\/src\/.*:[0-9]+:/{print $1}' "$AUDIT_LOG" | sort | uniq -c | sort -nr | head -40 || true

printf '%s\n' '-- executable structure targets --'
awk '/=== LONG EXECUTABLE SOURCE FILES ===/{flag=1;next} /=== KNOWN STRUCTURE TARGETS ===/{flag=0} flag' "$AUDIT_LOG" | sed '/^$/d'

printf '%s\n' '-- blockers --'
grep '^BLOCKER ' "$AUDIT_LOG" || true

find scripts -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find scripts -type f -name '*.py[co]' -delete 2>/dev/null || true

if [[ -n "$(git status --porcelain)" ]]; then
  echo "STOP: audit dirtied isolated worktree"
  git status --short
  exit 23
fi

printf '\nTRANSLATION_STRUCTURE_HARDENING_AUDIT_READY status=%s head=%s\n' "$AUDIT_STATUS" "$BRANCH_HEAD"
exit 0
