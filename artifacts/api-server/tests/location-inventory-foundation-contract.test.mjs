import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("../../../", import.meta.url);

async function repo(path) {
  return readFile(new URL(path, repoRoot), "utf8");
}

test("location inventory schema keeps one catalog and separates stock by location", async () => {
  const schema = await repo("lib/db/src/schema/locations.ts");
  const index = await repo("lib/db/src/schema/index.ts");

  assert.match(index, /export \* from "\.\/locations";/);
  assert.match(schema, /"merchant_locations"/);
  assert.match(schema, /"location_inventory_levels"/);
  assert.match(schema, /merchant_locations_default_unique/);
  assert.match(schema, /location_inventory_levels_product_unique/);
  assert.match(schema, /location_inventory_levels_variant_unique/);
  assert.match(schema, /reservedQuantity} <= \$\{table\.onHandQuantity/);
  assert.match(schema, /inventoryFreshAt/);
  assert.match(schema, /onlineFulfillmentEnabled/);
  assert.match(schema, /acceptOnlineOrdersWhenClosed/);
  assert.match(schema, /operationalStatus/);
});

test("foundation migration creates one default location and preserves existing stock without multiplying it", async () => {
  const migration = await repo("lib/db/drizzle/0017_location_inventory_foundation.sql");

  assert.match(migration, /INSERT INTO "merchant_locations"/);
  assert.match(migration, /'location_default_' \|\| md5\("id"\)/);
  assert.match(migration, /"is_default"[\s\S]*TRUE/);
  assert.match(migration, /p\."quantity"/);
  assert.match(migration, /v\."quantity"/);
  assert.match(migration, /p\."variant_stock_mode" = FALSE/);
  assert.match(migration, /p\."variant_stock_mode" = TRUE/);
  assert.match(migration, /l\."is_default" = TRUE/);
  assert.match(migration, /'fawri_catalog_v2'/);
  assert.match(migration, /'track_inventory'/);
  assert.doesNotMatch(migration, /UPDATE "products"/);
  assert.doesNotMatch(migration, /UPDATE "product_variants"/);
  assert.doesNotMatch(migration, /merchant_cashier_stations/);
});

test("foundation keeps services out of tracked location inventory", async () => {
  const migration = await repo("lib/db/drizzle/0017_location_inventory_foundation.sql");

  const trackedFilter =
    /COALESCE\(p\."metadata"->'fawri_catalog_v2'->>'item_type', 'product'\) = 'product'[\s\S]*?track_inventory/g;
  const matches = migration.match(trackedFilter) || [];
  assert.equal(matches.length, 2);
});

test("location inventory migration is additive and does not activate routing prematurely", async () => {
  const migration = await repo("lib/db/drizzle/0017_location_inventory_foundation.sql");
  const orders = await repo("lib/db/src/schema/orders.ts");
  const cashier = await repo("lib/db/src/schema/cashier-staff.ts");

  assert.doesNotMatch(migration, /DROP TABLE/);
  assert.doesNotMatch(migration, /DROP COLUMN/);
  assert.doesNotMatch(orders, /fulfillmentLocationId/);
  assert.doesNotMatch(cashier, /locationId:/);
});

test("canonical history models both reviewed 0016 and 0017 stages", async () => {
  const stage16 = JSON.parse(
    await repo("lib/db/migration-stages/0016/stage.json"),
  );
  const stage17 = JSON.parse(
    await repo("lib/db/migration-stages/0017/stage.json"),
  );
  const journal = JSON.parse(await repo("lib/db/drizzle/meta/_journal.json"));

  assert.equal(stage16.mode, "reviewed_sql");
  assert.equal(stage16.index, 16);
  assert.deepEqual(stage16.preimage_files, ["cashier-discount.ts"]);

  assert.equal(stage17.mode, "reviewed_sql");
  assert.equal(stage17.index, 17);
  assert.deepEqual(stage17.preimage_files, ["locations.ts", "index.ts"]);

  const last = journal.entries.at(-1);
  assert.equal(last?.idx, 17);
  assert.equal(last?.tag, "0017_location_inventory_foundation");
});
