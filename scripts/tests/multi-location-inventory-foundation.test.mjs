import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const migrationPath = path.join(
  repositoryRoot,
  "lib",
  "db",
  "drizzle",
  "0017_multi_location_inventory_foundation.sql",
);
const journalPath = path.join(
  repositoryRoot,
  "lib",
  "db",
  "drizzle",
  "meta",
  "_journal.json",
);
const stage16Path = path.join(
  repositoryRoot,
  "lib",
  "db",
  "migration-stages",
  "0016",
  "stage.json",
);
const stage17Path = path.join(
  repositoryRoot,
  "lib",
  "db",
  "migration-stages",
  "0017",
  "stage.json",
);
const catalogSchemaPath = path.join(
  repositoryRoot,
  "lib",
  "db",
  "src",
  "schema",
  "catalog.ts",
);
const locationSchemaPath = path.join(
  repositoryRoot,
  "lib",
  "db",
  "src",
  "schema",
  "merchant-locations.ts",
);
const locationInventorySchemaPath = path.join(
  repositoryRoot,
  "lib",
  "db",
  "src",
  "schema",
  "location-inventory.ts",
);

const migration = fs.readFileSync(migrationPath, "utf8");

function sqlStatements(source) {
  return source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test("multi-location foundation stays additive and fail-closed", () => {
  assert.match(
    migration,
    /"online_fulfillment_enabled" boolean DEFAULT false NOT NULL/,
  );
  assert.match(
    migration,
    /"accept_online_orders_while_closed" boolean DEFAULT false NOT NULL/,
  );
  assert.doesNotMatch(migration, /DROP COLUMN\s+"quantity"/i);
  assert.doesNotMatch(
    migration,
    /ALTER COLUMN\s+"(?:location_id|fulfillment_location_id)"\s+SET NOT NULL/i,
  );
  assert.doesNotMatch(
    migration,
    /UPDATE\s+"products"\s+SET\s+"quantity"/i,
  );
  assert.doesNotMatch(
    migration,
    /UPDATE\s+"product_variants"\s+SET\s+"quantity"/i,
  );
});

test("legacy stock is seeded only when the merchant has exactly one location", () => {
  const inventorySeedStatements = sqlStatements(migration).filter((statement) =>
    statement.includes('INSERT INTO "location_inventory_levels"'),
  );
  assert.equal(
    inventorySeedStatements.length,
    2,
    "expected one product-level and one variant-level inventory seed",
  );
  for (const statement of inventorySeedStatements) {
    assert.match(statement, /WITH single_location_merchants AS/);
    assert.match(statement, /HAVING count\(\*\) = 1/);
    assert.match(statement, /JOIN single_location_merchants s/);
    assert.doesNotMatch(statement, /HAVING count\(\*\) > 1/);
    assert.doesNotMatch(statement, /SUM\s*\(/i);
    assert.doesNotMatch(statement, /\/\s*count\s*\(/i);
  }
  assert.match(
    migration,
    /Multi-location merchants intentionally receive no location inventory rows/,
  );
});

test("station mapping is deterministic but historical operation attribution is not guessed", () => {
  assert.match(
    migration,
    /UPDATE "merchant_cashier_stations" s[\s\S]*ml\."legacy_branch_key" = s\."branch_key"/,
  );
  assert.match(
    migration,
    /ALTER TABLE "cashier_operation_attribution" ADD COLUMN "location_id" text/,
  );
  assert.doesNotMatch(
    migration,
    /UPDATE\s+"cashier_operation_attribution"/i,
  );
});

test("location tables keep tenant boundaries and named foreign keys aligned with Drizzle", () => {
  for (const table of ["merchant_locations", "location_inventory_levels"]) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`),
    );
    assert.match(
      migration,
      new RegExp(`CREATE POLICY "${table}_tenant_boundary"`),
    );
  }

  const catalogSchema = fs.readFileSync(catalogSchemaPath, "utf8");
  const locationSchema = fs.readFileSync(locationSchemaPath, "utf8");
  const locationInventorySchema = fs.readFileSync(
    locationInventorySchemaPath,
    "utf8",
  );
  assert.match(
    catalogSchema,
    /name: "inventory_mutations_location_merchant_fk"/,
  );
  assert.match(
    locationSchema,
    /name: "merchant_locations_merchant_fk"/,
  );
  assert.match(
    locationInventorySchema,
    /name: "location_inventory_levels_merchant_fk"/,
  );
  assert.match(
    locationInventorySchema,
    /name: "location_inventory_levels_location_merchant_fk"/,
  );
  assert.match(
    locationInventorySchema,
    /name: "location_inventory_levels_product_merchant_fk"/,
  );
  assert.match(
    locationInventorySchema,
    /name: "location_inventory_levels_variant_tenant_fk"/,
  );
});

test("migration ledger registers repaired 0016 and reviewed 0017 contiguously", () => {
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const entries = journal.entries;
  assert.equal(entries.at(-2)?.idx, 16);
  assert.equal(entries.at(-2)?.tag, "0016_cashier_merchant_discount_kind");
  assert.equal(entries.at(-1)?.idx, 17);
  assert.equal(
    entries.at(-1)?.tag,
    "0017_multi_location_inventory_foundation",
  );

  const stage16 = JSON.parse(fs.readFileSync(stage16Path, "utf8"));
  const stage17 = JSON.parse(fs.readFileSync(stage17Path, "utf8"));
  assert.equal(stage16.mode, "reviewed_sql");
  assert.equal(
    stage16.sql_sha256,
    "fbdb100182428b370f2271ac280cc9316bb1377971826a38b43c15cc40bf1329",
  );
  assert.equal(stage17.mode, "reviewed_sql");
  assert.equal(
    stage17.sql_sha256,
    "a79581a28cb154b5c6139f9ad7bed10de3b24997aa3651ec41597d8a25305d06",
  );
  assert.ok(stage17.preimage_files.includes("location-inventory.ts"));
  assert.ok(stage17.preimage_files.includes("merchant-locations.ts"));
});
