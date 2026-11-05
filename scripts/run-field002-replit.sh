#!/usr/bin/env bash
# Run from the existing Replit checkout, with this script read using git show.
set -euo pipefail
set +x
source_sha=${1:?Expected immutable commit SHA}
[[ "$source_sha" =~ ^[a-f0-9]{40}$ ]]
checkout=$(mktemp -d)
git worktree add --detach "$checkout" "$source_sha"
cleanup() {
  cd "$original_dir"
  git worktree remove --force "$checkout"
}
original_dir=$PWD
trap cleanup EXIT
cd "$checkout"
pnpm install --frozen-lockfile --ignore-scripts
if [[ -z "${FAWRI_FIELD002_CLONE_ADMIN_URL:-}" ]]; then
  IFS= read -rs -p 'Direct FIELD002 clone neondb_owner URL (hidden): ' FAWRI_FIELD002_CLONE_ADMIN_URL </dev/tty
  echo >/dev/tty
fi
export FAWRI_FIELD002_CLONE_ADMIN_URL
export FAWRI_FIELD002_EXPECTED_SOURCE="$source_sha"
pnpm exec tsx artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs --execute
