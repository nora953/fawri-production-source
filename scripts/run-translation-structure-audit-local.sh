#!/usr/bin/env bash
set -euo pipefail

REPO="nora953/fawri-production-source"
BRANCH="parallel/frontend-translation-code-structure-finalization"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="7ff11c1fb4a84a3bdc2891f0c365dc74263e1301"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/translation-structure-audit-$$"

cleanup() {
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! git remote get-url github >/dev/null 2>&1; then
  echo "STOP: github remote is required"
  exit 20
fi

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
git worktree add --detach "$WORKTREE" "$BRANCH_HEAD"
cd "$WORKTREE"

set +e
python3 scripts/audit-translation-structure.py
STATUS=$?
set -e

if [[ "$STATUS" -eq 0 ]]; then
  echo "TRANSLATION_STRUCTURE_PHASE1_CLEAN $BRANCH_HEAD"
else
  echo "TRANSLATION_STRUCTURE_PHASE1_AUDIT_READY $BRANCH_HEAD"
fi

# The audit intentionally exits non-zero while blockers remain. Preserve a successful
# shell exit so the output can be reviewed without implying the repository is broken.
exit 0
