#!/usr/bin/env bash
set -euo pipefail

REPO="nora953/fawri-production-source"
BRANCH="parallel/frontend-translation-code-structure-finalization"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="7ff11c1fb4a84a3bdc2891f0c365dc74263e1301"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/translation-centralization-$$"
BEFORE_OUT="$CACHE_ROOT/translation-centralization-before-$$.log"
AFTER_OUT="$CACHE_ROOT/translation-centralization-after-$$.log"

cleanup() {
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
  rm -f "$BEFORE_OUT" "$AFTER_OUT" >/dev/null 2>&1 || true
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

git worktree add --detach "$WORKTREE" "$BRANCH_HEAD"
cd "$WORKTREE"

# Python helper imports must never leave bytecode artifacts that contaminate the
# guarded worktree diff/scope checks.
export PYTHONDONTWRITEBYTECODE=1

# Apply the validation-only refinement that distinguishes real local copy from
# runtime maps whose values already come from `t` / adminText. Those maps are not
# independent translation authorities and must stay beside their runtime owner.
python3 scripts/.tmp-translation-runtime-map-filter.py

echo "=== BEFORE CENTRALIZATION ==="
python3 scripts/audit-translation-inventory.py | tee "$BEFORE_OUT"

echo "=== APPLY CENTRALIZATION ==="
python3 scripts/centralize-localized-copy.py

echo "=== AFTER CENTRALIZATION ==="
python3 scripts/audit-translation-inventory.py | tee "$AFTER_OUT"

grep -qx 'TOTAL_LOCALIZED_COPY_FILES=0' "$AFTER_OUT" || {
  echo "STOP: localized copy files remain outside translation authority"
  exit 23
}
grep -qx 'TOTAL_LOCALIZED_COPY_OBJECTS=0' "$AFTER_OUT" || {
  echo "STOP: localized copy objects remain outside translation authority"
  exit 24
}

# The filter only adjusts validation helpers inside this detached worktree. Restore
# those helpers before scope/typecheck/commit so only product-source changes remain.
git checkout -- \
  scripts/audit-translation-inventory.py \
  scripts/audit-translation-structure.py \
  scripts/centralize-localized-copy.py

# Defensive cleanup for Python versions/environments that may still emit cache files.
find scripts -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find scripts -type f -name '*.py[co]' -delete 2>/dev/null || true

git diff --check

CHANGED_OUTSIDE_FRONTEND="$(git status --short | awk '{print $2}' | grep -v '^artifacts/fawri/src/' || true)"
if [[ -n "$CHANGED_OUTSIDE_FRONTEND" ]]; then
  echo "STOP: centralizer changed files outside artifacts/fawri/src"
  printf '%s\n' "$CHANGED_OUTSIDE_FRONTEND"
  exit 25
fi

echo "=== FRONTEND TYPECHECK ==="
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm --filter @workspace/fawri run typecheck

# Re-read remote refs immediately before committing/pushing. No remote movement is accepted.
git fetch github "$BRANCH" "$COORDINATOR"
LATEST_COORD="$(git rev-parse "github/$COORDINATOR")"
LATEST_BRANCH="$(git rev-parse "github/$BRANCH")"
if [[ "$LATEST_COORD" != "$GOLDEN" ]]; then
  echo "STOP: coordinator moved during validation: $LATEST_COORD"
  exit 26
fi
if [[ "$LATEST_BRANCH" != "$BRANCH_HEAD" ]]; then
  echo "STOP: target branch moved during validation: $LATEST_BRANCH"
  exit 27
fi

if git diff --quiet && git diff --cached --quiet; then
  echo "TRANSLATION_CENTRALIZATION_ALREADY_READY $BRANCH_HEAD"
  exit 0
fi

git add artifacts/fawri/src
git commit -m "refactor: centralize frontend localized copy"
FINAL_SHA="$(git rev-parse HEAD)"
git push github "HEAD:refs/heads/$BRANCH"

echo "TRANSLATION_CENTRALIZATION_READY $FINAL_SHA"
