#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/fawri-production-source"
REMOTE="github"
BRANCH="parallel/runtime-authorities-pg-cutover"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="2ee2cd17e50ef465d2f2871e2ece66623558967d"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/runtime-pg-cutover-phase1-$$"

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

mkdir -p "$CACHE_ROOT"
cleanup() {
  cd "$REPO"
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$BRANCH_HEAD"
cd "$WORKTREE"

export CI=1
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm run typecheck

echo "RUNTIME_PG_PHASE1_TYPECHECK_READY $BRANCH_HEAD"
