#!/usr/bin/env bash
set -euo pipefail

REMOTE="github"
COORDINATOR="parallel/integration-coordinator"
LANE="parallel/superqi-sandbox-provider"
GOLDEN="6390d0c29df13e042a537e33e7174db7eb8741fe"
ROOT="$(git rev-parse --show-toplevel)"

: "${DATABASE_URL:?DATABASE_URL is required for the disposable local PostgreSQL integration gate}"

python3 - "$DATABASE_URL" <<'PY'
from urllib.parse import urlparse
import sys
u = urlparse(sys.argv[1])
if u.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("STOP: DATABASE_URL must be PostgreSQL")
if u.hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("STOP: validation DATABASE_URL must point to localhost")
if (u.path or "").lstrip("/") != "fawri_ci":
    raise SystemExit("STOP: validation database must be exactly fawri_ci")
PY

git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"

coordinator_sha="$(git rev-parse "refs/remotes/$REMOTE/$COORDINATOR")"
start_lane="$(git rev-parse "refs/remotes/$REMOTE/$LANE")"
merge_base="$(git merge-base "$GOLDEN" "$start_lane")"

[[ "$coordinator_sha" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved: expected $GOLDEN got $coordinator_sha" >&2
  exit 31
}
[[ "$merge_base" == "$GOLDEN" ]] || {
  echo "STOP: lane merge-base is not the Golden coordinator" >&2
  exit 32
}

WORKTREE="${TMPDIR:-/tmp}/fawri-superqi-sandbox-$$"
cleanup() {
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$start_lane" >/dev/null
cd "$WORKTREE"

# Reuse already-installed local dependencies without mutating the user's source checkout.
for rel in node_modules artifacts/api-server/node_modules artifacts/fawri/node_modules lib/db/node_modules; do
  if [[ -d "$ROOT/$rel" && ! -e "$WORKTREE/$rel" ]]; then
    mkdir -p "$(dirname "$WORKTREE/$rel")"
    ln -s "$ROOT/$rel" "$WORKTREE/$rel"
  fi
done

python3 scripts/.tmp-superqi-sandbox-provider.py

echo "Running SuperQi sandbox transport/static gates..."
pnpm --filter @workspace/api-server exec tsx --test ./tests/superqi-sandbox-transport.test.ts
node --test artifacts/api-server/tests/superqi-sandbox-provider-static.test.mjs

reset_db() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL
}

apply_migrations() {
  local stabilized rc
  stabilized="$(node --input-type=module - <<'NODE'
import { createStabilizedMigrationFolder } from "./lib/db/scripts/lib/migration-sql-order.mjs";
process.stdout.write(createStabilizedMigrationFolder("./lib/db/drizzle"));
NODE
)"
  rc=0
  for migration in "$stabilized"/[0-9][0-9][0-9][0-9]_*.sql; do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$migration" || { rc=$?; break; }
  done
  rm -rf "$stabilized"
  return "$rc"
}

echo "Running disposable PostgreSQL billing gates..."
reset_db
apply_migrations
pnpm --filter @workspace/api-server exec tsx --test ./tests/saas-billing-authority.integration.test.ts
pnpm --filter @workspace/api-server exec tsx --test ./tests/superqi-sandbox-billing.integration.test.ts

mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -printf './tests/%f\n' | sort)
if (( ${#guarantee_tests[@]} > 0 )); then
  pnpm --filter @workspace/api-server exec tsx --test "${guarantee_tests[@]}"
fi

pnpm --filter @workspace/fawri exec tsx --test ./tests/saas-billing-ui.test.ts

echo "Running typecheck/build gates..."
pnpm --filter @workspace/db run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/fawri run typecheck
pnpm --filter @workspace/fawri run build

git diff --check "$GOLDEN"

# Validation helpers are staging-only and must not enter the final product diff.
rm -f scripts/.tmp-superqi-sandbox-provider.py \
  scripts/run-superqi-sandbox-provider-local.sh

python3 - <<'PY'
import subprocess
allowed = {
  "artifacts/api-server/src/routes/saas-billing.ts",
  "artifacts/api-server/src/services/saasBillingAuthority.ts",
  "artifacts/api-server/src/services/superQiSandboxTransport.ts",
  "artifacts/api-server/src/services/superQiSandboxWebhook.ts",
  "artifacts/api-server/tests/superqi-sandbox-transport.test.ts",
  "artifacts/api-server/tests/superqi-sandbox-billing.integration.test.ts",
  "artifacts/api-server/tests/superqi-sandbox-provider-static.test.mjs",
  "artifacts/fawri/src/components/SaasBillingPanel.tsx",
  "artifacts/fawri/tests/saas-billing-ui.test.ts",
}
tracked = set(subprocess.check_output(
  ["git", "diff", "--name-only", "6390d0c29df13e042a537e33e7174db7eb8741fe"],
  text=True,
).splitlines())
untracked = set(subprocess.check_output(
  ["git", "ls-files", "--others", "--exclude-standard"],
  text=True,
).splitlines())
changed = tracked | untracked
unexpected = sorted(changed - allowed)
required = {
  "artifacts/api-server/src/services/superQiSandboxTransport.ts",
  "artifacts/api-server/src/services/superQiSandboxWebhook.ts",
  "artifacts/api-server/tests/superqi-sandbox-billing.integration.test.ts",
  "artifacts/fawri/src/components/SaasBillingPanel.tsx",
}
missing = sorted(required - changed)
if unexpected:
    raise SystemExit("Unexpected final diff files: " + ", ".join(unexpected))
if missing:
    raise SystemExit("Missing required final files: " + ", ".join(missing))
PY

# Abort instead of overwriting concurrent coordinator/lane movement.
git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"
latest_coordinator="$(git rev-parse "refs/remotes/$REMOTE/$COORDINATOR")"
latest_lane="$(git rev-parse "refs/remotes/$REMOTE/$LANE")"
[[ "$latest_coordinator" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved during validation" >&2
  exit 35
}
[[ "$latest_lane" == "$start_lane" ]] || {
  echo "STOP: lane moved during validation" >&2
  exit 36
}

git config user.name "nora953"
git config user.email "45720986+nora953@users.noreply.github.com"
git add -A
git commit -m "feat: add SuperQi sandbox billing provider"
final_sha="$(git rev-parse HEAD)"
git push "$REMOTE" "HEAD:refs/heads/$LANE"
echo "SUPERQI_SANDBOX_PROVIDER_READY $final_sha"
