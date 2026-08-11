#!/usr/bin/env bash
set -euo pipefail

REMOTE="github"
COORDINATOR="parallel/integration-coordinator"
LANE="parallel/saas-billing-multi-provider-readiness"
GOLDEN="a396409b1faac9afff4c9c334869e07dee9301c8"
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

WORKTREE="${TMPDIR:-/tmp}/fawri-saas-multi-provider-$$"
WORKSPACE_CONFIG_BACKUP=""
cleanup() {
  if [[ -n "$WORKSPACE_CONFIG_BACKUP" ]]; then
    rm -f "$WORKSPACE_CONFIG_BACKUP" >/dev/null 2>&1 || true
  fi
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$start_lane" >/dev/null
cd "$WORKTREE"

echo "Installing isolated dependencies from the local pnpm store..."
WORKSPACE_CONFIG_BACKUP="${TMPDIR:-/tmp}/fawri-saas-multi-provider-pnpm-$$.yaml"
cp pnpm-workspace.yaml "$WORKSPACE_CONFIG_BACKUP"
python3 - <<'PYCFG'
from pathlib import Path
p = Path("pnpm-workspace.yaml")
text = p.read_text(encoding="utf-8")
old = """onlyBuiltDependencies:
  - '@swc/core'
  - esbuild
  - msw
  - unrs-resolver
"""
new = """allowBuilds:
  '@swc/core': true
  esbuild: true
  msw: true
  unrs-resolver: true
"""
if text.count(old) != 1:
    raise SystemExit("STOP: expected legacy pnpm build trust block exactly once")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
PYCFG
pnpm install --offline --frozen-lockfile
cp "$WORKSPACE_CONFIG_BACKUP" pnpm-workspace.yaml
rm -f "$WORKSPACE_CONFIG_BACKUP"
WORKSPACE_CONFIG_BACKUP=""

python3 scripts/.tmp-saas-billing-multi-provider.py

echo "Running multi-provider/static gates..."
pnpm --filter @workspace/api-server exec tsx --test ./tests/saas-billing-multi-provider.test.ts
node --test artifacts/api-server/tests/saas-billing-authority-static.test.mjs
node --test artifacts/api-server/tests/superqi-sandbox-provider-static.test.mjs
pnpm --filter @workspace/api-server exec tsx --test ./tests/superqi-sandbox-transport.test.ts
pnpm --filter @workspace/fawri exec tsx --test ./tests/saas-billing-ui.test.ts

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

echo "Running disposable PostgreSQL billing regressions..."
reset_db
apply_migrations
pnpm --filter @workspace/api-server exec tsx --test ./tests/saas-billing-authority.integration.test.ts
pnpm --filter @workspace/api-server exec tsx --test ./tests/superqi-sandbox-billing.integration.test.ts
mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -printf './tests/%f\n' | sort)
if (( ${#guarantee_tests[@]} > 0 )); then
  pnpm --filter @workspace/api-server exec tsx --test "${guarantee_tests[@]}"
fi

echo "Running typecheck/build gates..."
pnpm --filter @workspace/db run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/fawri run typecheck
pnpm --filter @workspace/fawri run build

git diff --check "$GOLDEN"

rm -f scripts/.tmp-saas-billing-multi-provider.py \
  scripts/run-saas-billing-multi-provider-local.sh

python3 - <<'PY'
import subprocess
allowed = {
  "artifacts/api-server/src/routes/saas-billing.ts",
  "artifacts/api-server/src/services/saasBillingAuthority.ts",
  "artifacts/api-server/tests/saas-billing-authority-static.test.mjs",
  "artifacts/api-server/tests/saas-billing-multi-provider.test.ts",
  "artifacts/fawri/src/components/SaasBillingPanel.tsx",
  "artifacts/fawri/tests/saas-billing-ui.test.ts",
}
tracked = set(subprocess.check_output(
  ["git", "diff", "--name-only", "a396409b1faac9afff4c9c334869e07dee9301c8"],
  text=True,
).splitlines())
untracked = set(subprocess.check_output(
  ["git", "ls-files", "--others", "--exclude-standard"],
  text=True,
).splitlines())
changed = tracked | untracked
unexpected = sorted(changed - allowed)
required = {
  "artifacts/api-server/src/routes/saas-billing.ts",
  "artifacts/api-server/src/services/saasBillingAuthority.ts",
  "artifacts/api-server/tests/saas-billing-multi-provider.test.ts",
  "artifacts/fawri/src/components/SaasBillingPanel.tsx",
}
missing = sorted(required - changed)
if unexpected:
    raise SystemExit("Unexpected final diff files: " + ", ".join(unexpected))
if missing:
    raise SystemExit("Missing required final files: " + ", ".join(missing))
PY

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
git commit -m "feat: prepare SaaS billing for multiple providers"
final_sha="$(git rev-parse HEAD)"
git push "$REMOTE" "HEAD:refs/heads/$LANE"
echo "SAAS_BILLING_MULTI_PROVIDER_READY $final_sha"
