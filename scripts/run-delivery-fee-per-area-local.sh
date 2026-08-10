#!/usr/bin/env bash
set -euo pipefail

REPO="nora953/fawri-production-source"
LANE="parallel/delivery-fee-per-area"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="35074fb698edf436a9bfad845d4657f3e0a793ca"
ROOT="$(git rev-parse --show-toplevel)"

if git remote get-url github >/dev/null 2>&1; then
  REMOTE=github
elif git remote get-url origin 2>/dev/null | grep -Eq 'github\.com[:/]nora953/fawri-production-source(?:\.git)?$'; then
  REMOTE=origin
else
  echo "No GitHub remote for $REPO was found." >&2
  exit 30
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required and must point only to the local disposable fawri_ci database." >&2
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
[[ "$coordinator" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved to $coordinator" >&2
  exit 32
}

start_lane="$(git rev-parse "refs/remotes/$REMOTE/$LANE")"
merge_base="$(git merge-base "$start_lane" "$coordinator")"
[[ "$merge_base" == "$GOLDEN" ]] || {
  echo "STOP: lane merge-base is $merge_base, expected $GOLDEN" >&2
  exit 33
}

WORKTREE="${TMPDIR:-/tmp}/fawri-delivery-fee-per-area-$$"
REPRO="${TMPDIR:-/tmp}/fawri-delivery-fee-per-area-repro-$$"
cleanup() {
  status=$?
  if [[ $status -eq 0 ]]; then
    cd "$ROOT"
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
    rm -rf "$REPRO"
  else
    echo "Validation stopped with exit $status. Worktree kept for inspection: $WORKTREE" >&2
  fi
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$start_lane"
cd "$WORKTREE"

python3 scripts/.tmp-delivery-fee-per-area-1.py
python3 scripts/.tmp-delivery-fee-per-area-2.py
python3 scripts/.tmp-delivery-fee-per-area-3.py
python3 scripts/.tmp-delivery-fee-per-area-4.py
python3 scripts/.tmp-delivery-fee-per-area-5.py

corepack enable
pnpm install --frozen-lockfile --ignore-scripts

pnpm --filter @workspace/db run schema:generate
rm -rf "$REPRO"
FAWRI_MIGRATION_OUTPUT_DIR="$REPRO" pnpm --filter @workspace/db run schema:generate
cmp lib/db/drizzle/0005_delivery_fee_per_area.sql "$REPRO/0005_delivery_fee_per_area.sql"
cmp lib/db/drizzle/meta/0005_snapshot.json "$REPRO/meta/0005_snapshot.json"
cmp lib/db/drizzle/meta/_journal.json "$REPRO/meta/_journal.json"

git diff --exit-code "$GOLDEN" -- \
  lib/db/drizzle/0000_even_kulan_gath.sql \
  lib/db/drizzle/0001_military_proteus.sql \
  lib/db/drizzle/0002_cross_lane_stage.sql \
  lib/db/drizzle/0003_cross_lane_cleanup.sql \
  lib/db/drizzle/0004_product_shipping_measurements.sql \
  lib/db/drizzle/meta/0000_snapshot.json \
  lib/db/drizzle/meta/0001_snapshot.json \
  lib/db/drizzle/meta/0002_snapshot.json \
  lib/db/drizzle/meta/0003_snapshot.json \
  lib/db/drizzle/meta/0004_snapshot.json

pnpm run migration:test
FAWRI_ALLOW_MIGRATION_SMOKE=1 pnpm --filter @workspace/db run schema:smoke
FAWRI_ALLOW_PRODUCT_MEASUREMENT_MIGRATION_TEST=1 node ./lib/db/scripts/test-product-shipping-measurements-upgrade.mjs

pnpm --filter @workspace/api-server exec tsx --test \
  ./tests/delivery-fee-per-area.test.ts \
  ./tests/knowledge-delivery-area-rates.test.ts \
  ./tests/knowledge-postgres-operational-facts.test.ts \
  ./tests/orders-settings-runtime.test.ts
node --test artifacts/api-server/tests/delivery-order-authority-static.test.mjs
node --test scripts/tests/delivery-fee-per-area-audit.test.mjs
node --test scripts/tests/delivery-fee-per-area-migration-history.test.mjs

pnpm --filter @workspace/db run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
node --test artifacts/api-server/tests/merchant-settings.integration.test.mjs
pnpm --filter @workspace/fawri exec tsx --test ./tests/delivery-fee-per-area-ui.test.ts
pnpm --filter @workspace/fawri run typecheck
pnpm --filter @workspace/fawri run build

# Return all shared/temporary CI machinery to the Golden tree before the final commit.
git checkout "$GOLDEN" -- .github/workflows/product-shipping-measurements.yml
rm -f \
  .github/workflows/delivery-fee-per-area.yml \
  .ci/delivery-fee-per-area-run.json \
  scripts/.tmp-delivery-fee-per-area-1.py \
  scripts/.tmp-delivery-fee-per-area-2.py \
  scripts/.tmp-delivery-fee-per-area-3.py \
  scripts/.tmp-delivery-fee-per-area-4.py \
  scripts/.tmp-delivery-fee-per-area-5.py \
  scripts/run-delivery-fee-per-area-local.sh

git diff --check "$GOLDEN"

allowed='^(artifacts/api-server/src/routes/index\.ts|artifacts/api-server/src/services/deliveryPricing\.ts|artifacts/api-server/src/services/merchantSettingsRuntime\.ts|artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver\.ts|artifacts/api-server/tests/delivery-fee-per-area\.test\.ts|artifacts/api-server/tests/knowledge-delivery-area-rates\.test\.ts|artifacts/api-server/tests/delivery-order-authority-static\.test\.mjs|artifacts/fawri/src/pages/dashboard/ServerSettingsPage\.tsx|artifacts/fawri/src/pages/dashboard/MerchantSettingsPage\.tsx|artifacts/fawri/tests/delivery-fee-per-area-ui\.test\.ts|lib/db/src/schema/merchant-settings\.ts|lib/db/src/schema/tenant-security\.ts|lib/db/migration-stages/0005/stage\.json|lib/db/migration-stages/0005/preimage/merchant-settings\.ts|lib/db/migration-stages/0005/preimage/tenant-security\.ts|lib/db/drizzle/0005_delivery_fee_per_area\.sql|lib/db/drizzle/meta/0005_snapshot\.json|lib/db/drizzle/meta/_journal\.json|scripts/audit-merchant-settings\.mjs|scripts/lib/postgresql-migration-plan-complete\.mjs|scripts/lib/postgresql-cross-lane-reconciliation\.mjs|scripts/tests/delivery-fee-per-area-audit\.test\.mjs|scripts/tests/delivery-fee-per-area-migration-history\.test\.mjs|scripts/tests/product-shipping-migration-history\.test\.mjs|scripts/tests/cross-lane-migration-generator\.test\.mjs|scripts/tests/cross-lane-postgresql-edge-gates\.test\.mjs|scripts/tests/postgresql-disposable-acceptance\.test\.mjs|scripts/tests/run-postgresql-migration-plan\.test\.mjs)$'
bad="$(git diff --name-only "$GOLDEN" | grep -Ev "$allowed" || true)"
if [[ -n "$bad" ]]; then
  echo "STOP: unexpected files in final net diff:" >&2
  echo "$bad" >&2
  exit 34
fi

# Re-read both refs immediately before commit/push.
git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"
[[ "$(git rev-parse "refs/remotes/$REMOTE/$COORDINATOR")" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved during validation" >&2
  exit 35
}
[[ "$(git rev-parse "refs/remotes/$REMOTE/$LANE")" == "$start_lane" ]] || {
  echo "STOP: remote lane moved during validation" >&2
  exit 36
}

git config user.name "nora953"
git config user.email "45720986+nora953@users.noreply.github.com"
git add -A
git commit -m "feat: add per-area delivery pricing authority"
final_sha="$(git rev-parse HEAD)"
git push "$REMOTE" HEAD:"$LANE"

echo "DELIVERY_FEE_PER_AREA_READY $final_sha"
