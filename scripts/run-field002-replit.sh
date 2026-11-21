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
node --test scripts/tests/field002-isolated-acceptance-plan.test.mjs
pnpm install --frozen-lockfile --ignore-scripts
if [[ -z "${FAWRI_FIELD002_CLONE_ADMIN_URL:-}" ]]; then
  IFS= read -rs -p 'FIELD002 clone neondb_owner PASSWORD only (hidden): ' clone_password </dev/tty
  echo >/dev/tty
  if [[ -z "$clone_password" || "$clone_password" == *://* ]]; then
    echo 'FIELD002_PASSWORD_ONLY_REQUIRED' >&2
    exit 1
  fi
  # Encode the private input on stdin, never in process arguments or terminal output.
  encoded=$(printf '%s' "$clone_password" | node -e "process.stdout.write(encodeURIComponent(require('node:fs').readFileSync(0,'utf8')))")
  unset clone_password
  FAWRI_FIELD002_CLONE_ADMIN_URL="postgresql://neondb_owner:${encoded}@ep-soft-wildflower-b1i4j4xu.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full"
  unset encoded
fi
export FAWRI_FIELD002_CLONE_ADMIN_URL
export FAWRI_FIELD002_EXPECTED_SOURCE="$source_sha"
pnpm exec tsx artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs --execute
