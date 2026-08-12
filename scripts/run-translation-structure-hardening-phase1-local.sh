#!/usr/bin/env bash
set -euo pipefail

BRANCH="parallel/frontend-translation-structure-hardening"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="33bd13d412bb10c67c6d3769e16474387f18e110"
CACHE_ROOT="${TMPDIR:-$HOME/.cache/fawri-validation}"
WORKTREE="$CACHE_ROOT/translation-structure-hardening-phase1-$$"
AUDIT_LOG="$CACHE_ROOT/translation-structure-hardening-phase1-audit-$$.log"

cleanup() {
  cd "$HOME/fawri-production-source" >/dev/null 2>&1 || true
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

BASE_BRANCH_HEAD="$(git rev-parse "github/$BRANCH")"
MERGE_BASE="$(git merge-base "$GOLDEN" "$BASE_BRANCH_HEAD")"
if [[ "$MERGE_BASE" != "$GOLDEN" ]]; then
  echo "STOP: branch is not based on golden: merge-base=$MERGE_BASE"
  exit 22
fi

printf '=== PHASE 1 BASE ===\n%s\n' "$BASE_BRANCH_HEAD"

git worktree add --detach "$WORKTREE" "$BASE_BRANCH_HEAD" >/dev/null
cd "$WORKTREE"
export PYTHONDONTWRITEBYTECODE=1

printf '\n=== NORMALIZE ADMIN TRANSLATION AUTHORITY ===\n'
python3 scripts/normalize-admin-translation-authority.py

printf '\n=== CENTRALIZE REMAINING LOCALIZED COPY ===\n'
python3 scripts/centralize-localized-copy-hardening.py

printf '\n=== STRUCTURE AUDIT ===\n'
set +e
python3 scripts/audit-translation-structure.py | tee "$AUDIT_LOG"
AUDIT_STATUS=${PIPESTATUS[0]}
set -e

if grep -q '^BLOCKER === admin i18n parity' "$AUDIT_LOG"; then
  echo "STOP: admin dictionary parity is still blocked"
  exit 23
fi
if grep -q '^BLOCKER localized copy files=' "$AUDIT_LOG"; then
  echo "STOP: localized copy authorities remain"
  exit 24
fi
if ! grep -q '^localized_objects=0$' "$AUDIT_LOG"; then
  echo "STOP: localized object zero-proof missing"
  exit 25
fi

printf '\n=== DIFF CHECK ===\n'
git diff --check

printf '\n=== DEPENDENCIES ===\n'
pnpm install --offline --frozen-lockfile --ignore-scripts

printf '\n=== FULL TYPECHECK + BUILD ===\n'
pnpm run build

find scripts -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find scripts -type f -name '*.py[co]' -delete 2>/dev/null || true

if [[ -z "$(git status --porcelain)" ]]; then
  echo "PHASE1_NO_CHANGES_NEEDED"
  FINAL_HEAD="$BASE_BRANCH_HEAD"
else
  git add artifacts/fawri/src scripts
  git commit -m "i18n: centralize remaining localized copy authorities"
  FINAL_HEAD="$(git rev-parse HEAD)"

  printf '\n=== REMOTE SAFETY RECHECK ===\n'
  git fetch github "$BRANCH" "$COORDINATOR"
  REMOTE_BRANCH_HEAD="$(git rev-parse "github/$BRANCH")"
  REMOTE_COORD_HEAD="$(git rev-parse "github/$COORDINATOR")"
  if [[ "$REMOTE_COORD_HEAD" != "$GOLDEN" ]]; then
    echo "STOP: coordinator moved before push: $REMOTE_COORD_HEAD"
    exit 26
  fi
  if [[ "$REMOTE_BRANCH_HEAD" != "$BASE_BRANCH_HEAD" ]]; then
    echo "STOP: branch moved before push: $REMOTE_BRANCH_HEAD"
    exit 27
  fi

  git push github "HEAD:$BRANCH"
fi

printf '\n=== PHASE 1 RESIDUAL BLOCKERS ===\n'
grep '^BLOCKER ' "$AUDIT_LOG" | grep -v '^BLOCKER === admin i18n parity' | grep -v '^BLOCKER localized copy files=' || true

printf '\nTRANSLATION_STRUCTURE_HARDENING_PHASE1_READY audit_status=%s head=%s\n' "$AUDIT_STATUS" "$FINAL_HEAD"
