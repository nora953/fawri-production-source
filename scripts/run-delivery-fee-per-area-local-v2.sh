#!/usr/bin/env bash
set -euo pipefail

LANE="parallel/delivery-fee-per-area"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="35074fb698edf436a9bfad845d4657f3e0a793ca"
ROOT="$(git rev-parse --show-toplevel)"

if git remote get-url github >/dev/null 2>&1; then REMOTE=github; else REMOTE=origin; fi

python3 - <<'PY'
import os
from urllib.parse import urlparse
value = os.environ.get("DATABASE_URL", "")
u = urlparse(value)
if u.hostname not in {"127.0.0.1", "localhost"} or u.path.lstrip("/") != "fawri_ci":
    raise SystemExit("STOP: DATABASE_URL must be the local disposable fawri_ci database")
PY

cd "$ROOT"
git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"
[[ "$(git rev-parse refs/remotes/$REMOTE/$COORDINATOR)" == "$GOLDEN" ]] || { echo "STOP: coordinator moved" >&2; exit 32; }
START_LANE="$(git rev-parse refs/remotes/$REMOTE/$LANE)"
[[ "$(git merge-base "$START_LANE" "$GOLDEN")" == "$GOLDEN" ]] || { echo "STOP: unexpected lane base" >&2; exit 33; }
[[ -d "$ROOT/node_modules/.pnpm" ]] || { echo "STOP: existing offline dependencies missing" >&2; exit 37; }

TMPBASE="${TMPDIR:-$HOME/.cache/fawri-validation}"
mkdir -p "$TMPBASE"
for stale in "$TMPBASE"/fawri-delivery-fee-per-area-*; do
  [[ -e "$stale" ]] || continue
  git worktree remove --force "$stale" >/dev/null 2>&1 || rm -rf "$stale"
done
git worktree prune
WORKTREE="$TMPBASE/fawri-delivery-fee-per-area-$$"
REPRO="$TMPBASE/fawri-delivery-fee-per-area-repro-$$"
cleanup() {
  status=$?
  cd "$ROOT" >/dev/null 2>&1 || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"
  rm -rf "$REPRO"
  git worktree prune >/dev/null 2>&1 || true
  [[ $status -eq 0 ]] || echo "Validation stopped with exit $status. Temporary validation worktree was cleaned." >&2
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$START_LANE"
while IFS= read -r source_dir; do
  relative="${source_dir#"$ROOT"/}"
  destination="$WORKTREE/$relative"
  mkdir -p "$(dirname "$destination")"
  rm -rf "$destination"
  cp -al "$source_dir" "$destination" 2>/dev/null || cp -a "$source_dir" "$destination"
done < <(find "$ROOT" -mindepth 1 -maxdepth 4 -type d -name node_modules -prune -print)
cd "$WORKTREE"
for required in node_modules/.bin/tsx node_modules/.bin/tsc artifacts/fawri/node_modules/.bin/vite lib/db/node_modules/.bin/drizzle-kit; do
  [[ -x "$required" ]] || { echo "STOP: missing offline binary $required" >&2; exit 39; }
done

echo "Applying delivery authority patches offline..."
for n in 1 2 3 4 5 6 7; do python3 "scripts/.tmp-delivery-fee-per-area-$n.py"; done

reset_db() {
  node --input-type=module <<'NODE'
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.resolve("lib/db/package.json"));
const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
} finally { await client.end(); }
NODE
}

# Offline-only substitution for drizzle-kit invocation. Restored before final diff.
python3 - <<'PY'
from pathlib import Path
path = Path("lib/db/scripts/generate-migration.mjs")
text = path.read_text(encoding="utf-8")
old = '''  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    command,
    [
      "exec",
      "drizzle-kit",
      "generate",
      "--config",
      configPath,
      "--name",
      migrationName,
    ],'''
new = '''  const command = path.join(dbRoot, "node_modules", ".bin", "drizzle-kit");
  const result = spawnSync(
    command,
    [
      "generate",
      "--config",
      configPath,
      "--name",
      migrationName,
    ],'''
if old not in text: raise SystemExit("STOP: generator command shape changed")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
PY

node lib/db/scripts/generate-migration.mjs
rm -rf "$REPRO"
FAWRI_MIGRATION_OUTPUT_DIR="$REPRO" node lib/db/scripts/generate-migration.mjs
cmp lib/db/drizzle/0005_delivery_fee_per_area.sql "$REPRO/0005_delivery_fee_per_area.sql"
cmp lib/db/drizzle/meta/0005_snapshot.json "$REPRO/meta/0005_snapshot.json"
cmp lib/db/drizzle/meta/_journal.json "$REPRO/meta/_journal.json"
git checkout "$GOLDEN" -- lib/db/scripts/generate-migration.mjs

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

echo "Running migration suite on real local PostgreSQL..."
reset_db
node --test --test-concurrency=1 ./scripts/tests/*.test.mjs
reset_db
FAWRI_ALLOW_PRODUCT_MEASUREMENT_MIGRATION_TEST=1 node ./lib/db/scripts/test-product-shipping-measurements-upgrade.mjs
reset_db
FAWRI_ALLOW_MIGRATION_SMOKE=1 node lib/db/scripts/smoke-migration.mjs
reset_db

echo "Running delivery runtime, Knowledge, UI, typecheck and build gates..."
node_modules/.bin/tsx --test \
  artifacts/api-server/tests/delivery-fee-per-area.test.ts \
  artifacts/api-server/tests/knowledge-delivery-area-rates.test.ts \
  artifacts/api-server/tests/knowledge-postgres-operational-facts.test.ts \
  artifacts/api-server/tests/orders-settings-runtime.test.ts
node --test artifacts/api-server/tests/delivery-order-authority-static.test.mjs
node --test scripts/tests/delivery-fee-per-area-audit.test.mjs
node --test scripts/tests/delivery-fee-per-area-migration-history.test.mjs
node --test scripts/tests/server-authoritative-settings-contract.test.mjs
node_modules/.bin/tsc -p lib/db/tsconfig.json --noEmit
node_modules/.bin/tsc -p artifacts/api-server/tsconfig.json --noEmit
(cd artifacts/api-server && node ./build.mjs)
node --test artifacts/api-server/tests/merchant-settings.integration.test.mjs
node_modules/.bin/tsx --test artifacts/fawri/tests/delivery-fee-per-area-ui.test.ts
node_modules/.bin/tsc -p artifacts/fawri/tsconfig.json --noEmit
(cd artifacts/fawri && ./node_modules/.bin/vite build --config vite.config.ts)

# Remove all validation/staging machinery from final product diff.
git checkout "$GOLDEN" -- .github/workflows/product-shipping-measurements.yml
rm -f \
  .github/workflows/delivery-fee-per-area.yml \
  .ci/delivery-fee-per-area-run.json \
  scripts/.tmp-delivery-fee-per-area-{1,2,3,4,5,6,7}.py \
  scripts/run-delivery-fee-per-area-local.sh \
  scripts/run-delivery-fee-per-area-local-v2.sh

git diff --check "$GOLDEN"
allowed='^(artifacts/api-server/src/routes/index\.ts|artifacts/api-server/src/services/deliveryPricing\.ts|artifacts/api-server/src/services/merchantSettingsRuntime\.ts|artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver\.ts|artifacts/api-server/tests/delivery-fee-per-area\.test\.ts|artifacts/api-server/tests/knowledge-delivery-area-rates\.test\.ts|artifacts/api-server/tests/delivery-order-authority-static\.test\.mjs|artifacts/fawri/src/pages/dashboard/ServerSettingsPage\.tsx|artifacts/fawri/src/pages/dashboard/MerchantSettingsPage\.tsx|artifacts/fawri/tests/delivery-fee-per-area-ui\.test\.ts|lib/db/src/schema/merchant-settings\.ts|lib/db/src/schema/tenant-security\.ts|lib/db/src/schema/catalog\.ts|lib/db/migration-stages/0005/stage\.json|lib/db/migration-stages/0005/preimage/merchant-settings\.ts|lib/db/migration-stages/0005/preimage/tenant-security\.ts|lib/db/migration-stages/0005/preimage/catalog\.ts|lib/db/drizzle/0005_delivery_fee_per_area\.sql|lib/db/drizzle/meta/0005_snapshot\.json|lib/db/drizzle/meta/_journal\.json|lib/db/scripts/test-product-shipping-measurements-upgrade\.mjs|scripts/audit-merchant-settings\.mjs|scripts/lib/postgresql-migration-plan-complete\.mjs|scripts/lib/postgresql-cross-lane-reconciliation\.mjs|scripts/tests/delivery-fee-per-area-audit\.test\.mjs|scripts/tests/delivery-fee-per-area-migration-history\.test\.mjs|scripts/tests/product-shipping-migration-history\.test\.mjs|scripts/tests/cross-lane-migration-generator\.test\.mjs|scripts/tests/cross-lane-postgresql-edge-gates\.test\.mjs|scripts/tests/postgresql-disposable-acceptance\.test\.mjs|scripts/tests/run-postgresql-migration-plan\.test\.mjs|scripts/tests/server-authoritative-settings-contract\.test\.mjs)$'
bad="$(git diff --name-only "$GOLDEN" | grep -Ev "$allowed" || true)"
[[ -z "$bad" ]] || { echo "STOP: unexpected final files:" >&2; echo "$bad" >&2; exit 34; }

git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"
[[ "$(git rev-parse refs/remotes/$REMOTE/$COORDINATOR)" == "$GOLDEN" ]] || { echo "STOP: coordinator moved during validation" >&2; exit 35; }
[[ "$(git rev-parse refs/remotes/$REMOTE/$LANE)" == "$START_LANE" ]] || { echo "STOP: lane moved during validation" >&2; exit 36; }

git config user.name "nora953"
git config user.email "45720986+nora953@users.noreply.github.com"
git add -A
git commit -m "feat: add per-area delivery pricing authority"
FINAL_SHA="$(git rev-parse HEAD)"
git push "$REMOTE" HEAD:"$LANE"
echo "DELIVERY_FEE_PER_AREA_READY $FINAL_SHA"
