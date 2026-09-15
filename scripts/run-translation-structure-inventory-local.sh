#!/usr/bin/env bash
set -euo pipefail

BRANCH="parallel/frontend-translation-code-structure-finalization"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="7ff11c1fb4a84a3bdc2891f0c365dc74263e1301"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/translation-structure-inventory-$$"

cleanup() {
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

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
mkdir -p "$CACHE_ROOT"
git worktree add --detach "$WORKTREE" "$BRANCH_HEAD" >/dev/null
cd "$WORKTREE"
python3 scripts/audit-translation-inventory.py
printf 'TRANSLATION_STRUCTURE_INVENTORY_HEAD %s\n' "$BRANCH_HEAD"
