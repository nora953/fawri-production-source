#!/usr/bin/env bash
set -euo pipefail

LANE="parallel/saas-billing-authority"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="ca583e8d43042c2d4c489f2bc0e3c038c451ce2e"
ROOT="$(git rev-parse --show-toplevel)"

if git remote get-url github >/dev/null 2>&1; then
  REMOTE=github
elif git remote get-url origin 2>/dev/null | grep -Eq 'github\.com[:/]nora953/fawri-production-source(?:\.git)?$'; then
  REMOTE=origin
else
  echo "No GitHub remote for nora953/fawri-production-source was found." >&2
  exit 30
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required and must point to local fawri_ci." >&2
  exit 31
fi
python3 - <<'PY'
import os
from urllib.parse import urlparse
u = urlparse(os.environ["DATABASE_URL"])
if u.hostname not in {"127.0.0.1", "localhost"} or u.path.lstrip("/") != "fawri_ci":
    raise SystemExit("Refusing non-local/non-disposable DATABASE_URL; expected localhost/127.0.0.1 database fawri_ci")
PY

cd "$ROOT"
git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"
coordinator="$(git rev-parse "refs/remotes/$REMOTE/$COORDINATOR")"
[[ "$coordinator" == "$GOLDEN" ]] || { echo "STOP: coordinator moved to $coordinator" >&2; exit 32; }
start_lane="$(git rev-parse "refs/remotes/$REMOTE/$LANE")"
[[ "$(git merge-base "$start_lane" "$coordinator")" == "$GOLDEN" ]] || {
  echo "STOP: lane merge-base is not the Golden coordinator" >&2
  exit 33
}

BASE_TMP="${TMPDIR:-$HOME/.cache/fawri-validation}"
mkdir -p "$BASE_TMP"
for stale in "$BASE_TMP"/saas-billing-authority-* "$BASE_TMP"/saas-billing-repro-*; do
  [[ -e "$stale" ]] || continue
  git worktree remove --force "$stale" >/dev/null 2>&1 || rm -rf "$stale"
done
git worktree prune >/dev/null 2>&1 || true
WORKTREE="$BASE_TMP/saas-billing-authority-$$"
REPRO="$BASE_TMP/saas-billing-repro-$$"
cleanup() {
  status=$?
  cd "$ROOT" || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$REPRO"
  git worktree prune >/dev/null 2>&1 || true
  if [[ $status -ne 0 ]]; then
    echo "Validation stopped with exit $status. Temporary validation worktree was cleaned." >&2
  fi
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$start_lane"
cd "$WORKTREE"
echo "Applying SaaS billing authority staging patches offline..."
python3 scripts/.tmp-saas-billing-authority.py
python3 scripts/.tmp-saas-billing-authority-2.py

corepack enable
pnpm install --offline --frozen-lockfile --ignore-scripts

reset_db() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL
}

apply_migrations() {
  for migration in lib/db/drizzle/[0-9][0-9][0-9][0-9]_*.sql; do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$migration"
  done
}

# Generate canonical append-only 0006.
pnpm --filter @workspace/db run schema:generate
[[ -f lib/db/drizzle/0006_saas_billing_authority.sql ]]
[[ -f lib/db/drizzle/meta/0006_snapshot.json ]]

# Historical chain must be byte-identical to the Golden coordinator.
git diff --exit-code "$GOLDEN" -- \
  lib/db/drizzle/0000_even_kulan_gath.sql \
  lib/db/drizzle/0001_military_proteus.sql \
  lib/db/drizzle/0002_cross_lane_stage.sql \
  lib/db/drizzle/0003_cross_lane_cleanup.sql \
  lib/db/drizzle/0004_product_shipping_measurements.sql \
  lib/db/drizzle/0005_delivery_fee_per_area.sql \
  lib/db/drizzle/meta/0000_snapshot.json \
  lib/db/drizzle/meta/0001_snapshot.json \
  lib/db/drizzle/meta/0002_snapshot.json \
  lib/db/drizzle/meta/0003_snapshot.json \
  lib/db/drizzle/meta/0004_snapshot.json \
  lib/db/drizzle/meta/0005_snapshot.json

# Re-generate to an isolated output and prove deterministic 0006 artifacts.
mkdir -p "$REPRO"
FAWRI_MIGRATION_OUTPUT_DIR="$REPRO" node lib/db/scripts/generate-migration.mjs
cmp lib/db/drizzle/0006_saas_billing_authority.sql "$REPRO/0006_saas_billing_authority.sql"
cmp lib/db/drizzle/meta/0006_snapshot.json "$REPRO/meta/0006_snapshot.json"
cmp lib/db/drizzle/meta/_journal.json "$REPRO/meta/_journal.json"

echo "Running migration and PostgreSQL gates..."
pnpm run migration:test
reset_db
FAWRI_ALLOW_MIGRATION_SMOKE=1 pnpm --filter @workspace/db run schema:smoke
reset_db
apply_migrations
node --test scripts/tests/saas-billing-migration-history.test.mjs

echo "Running SaaS billing, entitlement, guarantee and UI gates..."
node --test artifacts/api-server/tests/saas-billing-authority-static.test.mjs
pnpm --filter @workspace/api-server exec tsx --test \
  ./tests/saas-billing-authority.integration.test.ts \
  ./tests/subscription-entitlement-postgres.integration.test.ts

mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -print | sort)
if [[ ${#guarantee_tests[@]} -gt 0 ]]; then
  pnpm --filter @workspace/api-server exec tsx --test "${guarantee_tests[@]}"
fi
pnpm --filter @workspace/fawri exec tsx --test ./tests/saas-billing-ui.test.ts

pnpm --filter @workspace/db run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/fawri run typecheck
pnpm --filter @workspace/fawri run build

git diff --check "$GOLDEN"

# Validation helpers are staging-only and must never enter the final product diff.
rm -f scripts/.tmp-saas-billing-authority.py \
  scripts/.tmp-saas-billing-authority-2.py \
  scripts/run-saas-billing-authority-local.sh

python3 - <<'PY'
import subprocess
allowed = {
  "artifacts/api-server/src/routes/auth-security.ts",
  "artifacts/api-server/src/routes/saas-billing.ts",
  "artifacts/api-server/src/services/postgresSubscriptionEntitlement.ts",
  "artifacts/api-server/src/services/saasBillingAuthority.ts",
  "artifacts/api-server/src/services/saasPlanCatalog.ts",
  "artifacts/api-server/src/services/subscriptionPlanCycleAuthority.ts",
  "artifacts/api-server/src/services/subscriptionServiceGuarantee.ts",
  "artifacts/api-server/tests/saas-billing-authority-static.test.mjs",
  "artifacts/api-server/tests/saas-billing-authority.integration.test.ts",
  "artifacts/fawri/src/components/SaasBillingPanel.tsx",
  "artifacts/fawri/src/pages/dashboard/SubscriptionPage.tsx",
  "artifacts/fawri/tests/saas-billing-ui.test.ts",
  "lib/db/src/schema/index.ts",
  "lib/db/src/schema/saas-billing.ts",
  "lib/db/src/schema/tenant-security.ts",
  "lib/db/migration-stages/0006/stage.json",
  "lib/db/migration-stages/0006/preimage/index.ts",
  "lib/db/migration-stages/0006/preimage/saas-billing.ts",
  "lib/db/migration-stages/0006/preimage/tenant-security.ts",
  "lib/db/drizzle/0006_saas_billing_authority.sql",
  "lib/db/drizzle/meta/0006_snapshot.json",
  "lib/db/drizzle/meta/_journal.json",
  "scripts/tests/saas-billing-migration-history.test.mjs",
}
changed = set(subprocess.check_output(
  ["git", "diff", "--name-only", "ca583e8d43042c2d4c489f2bc0e3c038c451ce2e"],
  text=True,
).splitlines())
unexpected = sorted(changed - allowed)
missing = sorted({
  "lib/db/drizzle/0006_saas_billing_authority.sql",
  "lib/db/drizzle/meta/0006_snapshot.json",
  "lib/db/migration-stages/0006/preimage/saas-billing.ts",
  "artifacts/api-server/src/services/saasBillingAuthority.ts",
  "artifacts/api-server/tests/saas-billing-authority.integration.test.ts",
} - changed)
if unexpected:
    raise SystemExit("Unexpected final diff files: " + ", ".join(unexpected))
if missing:
    raise SystemExit("Missing required final files: " + ", ".join(missing))
PY

# Abort instead of overwriting concurrent lane/coordinator movement.
git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"
latest_coordinator="$(git rev-parse "refs/remotes/$REMOTE/$COORDINATOR")"
latest_lane="$(git rev-parse "refs/remotes/$REMOTE/$LANE")"
[[ "$latest_coordinator" == "$GOLDEN" ]] || { echo "STOP: coordinator moved during validation" >&2; exit 35; }
[[ "$latest_lane" == "$start_lane" ]] || { echo "STOP: lane moved during validation" >&2; exit 36; }

git config user.name "nora953"
git config user.email "45720986+nora953@users.noreply.github.com"
git add -A
git commit -m "feat: add SaaS billing authority"
final_sha="$(git rev-parse HEAD)"
git push "$REMOTE" "HEAD:refs/heads/$LANE"
echo "SAAS_BILLING_AUTHORITY_READY $final_sha"
