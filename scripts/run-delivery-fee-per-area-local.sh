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

if [[ ! -d "$ROOT/node_modules/.pnpm" ]]; then
  echo "STOP: existing pnpm dependency tree is missing; refusing network installation." >&2
  exit 37
fi

TMPBASE="${TMPDIR:-/tmp}"
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
  if [[ $status -ne 0 ]]; then
    echo "Validation stopped with exit $status. Temporary validation worktree was cleaned." >&2
  fi
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$start_lane"

node_modules_count=0
while IFS= read -r source_dir; do
  relative="${source_dir#"$ROOT"/}"
  destination="$WORKTREE/$relative"
  mkdir -p "$(dirname "$destination")"
  rm -rf "$destination"
  if ! cp -al "$source_dir" "$destination" 2>/dev/null; then
    cp -a "$source_dir" "$destination"
  fi
  node_modules_count=$((node_modules_count + 1))
done < <(find "$ROOT" -mindepth 1 -maxdepth 4 -type d -name node_modules -prune -print)

if [[ "$node_modules_count" -lt 1 || ! -d "$WORKTREE/node_modules/.pnpm" ]]; then
  echo "STOP: copied dependency tree is incomplete; no network fallback attempted." >&2
  exit 38
fi

cd "$WORKTREE"
echo "Reused $node_modules_count existing node_modules tree(s). Running fully offline without pnpm install/run/exec."

for required in \
  node_modules/.bin/tsx \
  node_modules/.bin/tsc \
  artifacts/fawri/node_modules/.bin/vite \
  lib/db/node_modules/.bin/drizzle-kit; do
  [[ -x "$required" ]] || {
    echo "STOP: required existing local binary is missing: $required" >&2
    exit 39
  }
done

reset_disposable_database() {
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
} finally {
  await client.end();
}
NODE
}

# Historical proof belongs to the committed 0004 boundary. Run it before this
# lane creates 0005, on an explicitly empty disposable database.
reset_disposable_database
FAWRI_ALLOW_PRODUCT_MEASUREMENT_MIGRATION_TEST=1 \
  node ./lib/db/scripts/test-product-shipping-measurements-upgrade.mjs
reset_disposable_database

python3 scripts/.tmp-delivery-fee-per-area-1.py
python3 scripts/.tmp-delivery-fee-per-area-2.py
python3 scripts/.tmp-delivery-fee-per-area-3.py
python3 scripts/.tmp-delivery-fee-per-area-4.py
python3 scripts/.tmp-delivery-fee-per-area-5.py
python3 scripts/.tmp-delivery-fee-per-area-6.py

# The canonical generator normally shells through pnpm exec drizzle-kit. For
# this offline validation only, invoke the already-installed binary directly;
# restore the canonical generator before any final diff/commit.
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
if old not in text:
    raise SystemExit("STOP: canonical generator command shape changed unexpectedly")
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

# The full migration suite assumes fawri_ci is initially empty. Do not inherit
# database state from any earlier validation attempt.
reset_disposable_database
node --test --test-concurrency=1 ./scripts/tests/*.test.mjs

# Run the final 0005 chain smoke independently, then remove its database state
# before non-migration tests.
reset_disposable_database
FAWRI_ALLOW_MIGRATION_SMOKE=1 node lib/db/scripts/smoke-migration.mjs
reset_disposable_database

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
(
  cd artifacts/api-server
  node ./build.mjs
)
node --test artifacts/api-server/tests/merchant-settings.integration.test.mjs
node_modules/.bin/tsx --test artifacts/fawri/tests/delivery-fee-per-area-ui.test.ts
node_modules/.bin/tsc -p artifacts/fawri/tsconfig.json --noEmit
(
  cd artifacts/fawri
  ./node_modules/.bin/vite build --config vite.config.ts
)

# Return every temporary/staging artifact to the Golden tree before commit.
git checkout "$GOLDEN" -- .github/workflows/product-shipping-measurements.yml
rm -f \
  .github/workflows/delivery-fee-per-area.yml \
  .ci/delivery-fee-per-area-run.json \
  scripts/.tmp-delivery-fee-per-area-1.py \
  scripts/.tmp-delivery-fee-per-area-2.py \
  scripts/.tmp-delivery-fee-per-area-3.py \
  scripts/.tmp-delivery-fee-per-area-4.py \
  scripts/.tmp-delivery-fee-per-area-5.py \
  scripts/.tmp-delivery-fee-per-area-6.py \
  scripts/run-delivery-fee-per-area-local.sh

git diff --check "$GOLDEN"

allowed='^(artifacts/api-server/src/routes/index\.ts|artifacts/api-server/src/services/deliveryPricing\.ts|artifacts/api-server/src/services/merchantSettingsRuntime\.ts|artifacts/api-server/src/services/knowledge/postgresOperationalFactResolver\.ts|artifacts/api-server/tests/delivery-fee-per-area\.test\.ts|artifacts/api-server/tests/knowledge-delivery-area-rates\.test\.ts|artifacts/api-server/tests/delivery-order-authority-static\.test\.mjs|artifacts/fawri/src/pages/dashboard/ServerSettingsPage\.tsx|artifacts/fawri/src/pages/dashboard/MerchantSettingsPage\.tsx|artifacts/fawri/tests/delivery-fee-per-area-ui\.test\.ts|lib/db/src/schema/merchant-settings\.ts|lib/db/src/schema/tenant-security\.ts|lib/db/migration-stages/0005/stage\.json|lib/db/migration-stages/0005/preimage/merchant-settings\.ts|lib/db/migration-stages/0005/preimage/tenant-security\.ts|lib/db/drizzle/0005_delivery_fee_per_area\.sql|lib/db/drizzle/meta/0005_snapshot\.json|lib/db/drizzle/meta/_journal\.json|scripts/audit-merchant-settings\.mjs|scripts/lib/postgresql-migration-plan-complete\.mjs|scripts/lib/postgresql-cross-lane-reconciliation\.mjs|scripts/tests/delivery-fee-per-area-audit\.test\.mjs|scripts/tests/delivery-fee-per-area-migration-history\.test\.mjs|scripts/tests/product-shipping-migration-history\.test\.mjs|scripts/tests/cross-lane-migration-generator\.test\.mjs|scripts/tests/cross-lane-postgresql-edge-gates\.test\.mjs|scripts/tests/postgresql-disposable-acceptance\.test\.mjs|scripts/tests/run-postgresql-migration-plan\.test\.mjs|scripts/tests/server-authoritative-settings-contract\.test\.mjs)$'
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
