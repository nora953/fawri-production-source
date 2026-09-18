import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiRoot = new URL("../", import.meta.url);
const repoRoot = new URL("../../../", import.meta.url);

async function api(path) {
  return readFile(new URL(path, apiRoot), "utf8");
}

async function repo(path) {
  return readFile(new URL(path, repoRoot), "utf8");
}

test("cashier station authority carries stable location identity through views and credentials", async () => {
  const authority = await api("src/services/postgresCashierStaffAuthority.ts");

  assert.match(authority, /type StationRow = \{[\s\S]*location_id: string;/);
  assert.match(authority, /export type CashierStationView = \{[\s\S]*location_id: string;/);
  assert.match(authority, /export type CashierStationContext = \{[\s\S]*location_id: string;/);
  assert.match(authority, /location_id: row\.location_id/);
  assert.match(authority, /s\.name AS station_name, s\.location_id, s\.branch_key/);
  assert.match(authority, /st\.location_id, st\.branch_key, st\.branch_label/);
  assert.match(authority, /location_id: station\.location_id/);
  const contextMappings = authority.match(/location_id: row\.location_id/g) || [];
  assert.ok(contextMappings.length >= 2);
});

test("station creation and branch changes resolve a stable location before persistence", async () => {
  const authority = await api("src/services/postgresCashierStaffAuthority.ts");
  const configuration = await api(
    "src/services/cashierStationConfigurationAuthority.ts",
  );

  assert.match(authority, /resolveCashierLocationForBranch\(client/);
  assert.match(
    authority,
    /INSERT INTO merchant_cashier_stations \([\s\S]*location_id[\s\S]*branch_key/,
  );
  assert.match(
    authority,
    /branchKey !== undefined && targetLocation[\s\S]*add\("location_id", targetLocation\.id\)/,
  );

  assert.match(configuration, /location_id: string/);
  assert.match(
    configuration,
    /JSON\.stringify\(\[[\s\S]*input\.location_id[\s\S]*input\.branch_key/,
  );
  assert.match(configuration, /resolveCashierLocationForBranch\(client/);
  assert.match(
    configuration,
    /add\("location_id", targetLocation\.id\)/,
  );
});

test("moving a station to another location invalidates the old paired runtime", async () => {
  const authority = await api("src/services/postgresCashierStaffAuthority.ts");
  const configuration = await api(
    "src/services/cashierStationConfigurationAuthority.ts",
  );

  for (const source of [authority, configuration]) {
    assert.match(
      source,
      /targetLocation !== null && targetLocation\.id !== current\.location_id/,
    );
    assert.match(source, /paired_device_id = NULL/);
    assert.match(source, /paired_at = NULL/);
    assert.match(source, /credential_version = credential_version \+ 1/);
    assert.match(source, /station_location_changed/);
  }

  assert.match(
    configuration,
    /UPDATE cashier_station_pairing_challenges[\s\S]*status = 'revoked'/,
  );
  assert.match(
    configuration,
    /UPDATE cashier_station_credentials[\s\S]*status = 'revoked'/,
  );
  assert.match(
    configuration,
    /UPDATE cashier_operator_sessions[\s\S]*status = 'revoked'/,
  );
});

test("offline inventory authority uniqueness is location-scoped while API error compatibility remains stable", async () => {
  const schema = await repo("lib/db/src/schema/cashier-staff.ts");
  const authority = await api("src/services/postgresCashierStaffAuthority.ts");
  const configuration = await api(
    "src/services/cashierStationConfigurationAuthority.ts",
  );

  assert.match(schema, /merchant_cashier_stations_offline_location_unique/);
  assert.match(
    schema,
    /\.on\(table\.merchantId, table\.locationId\)[\s\S]*offlineInventoryAuthority/,
  );
  assert.doesNotMatch(schema, /merchant_cashier_stations_offline_branch_unique/);

  assert.match(authority, /merchant_cashier_stations_offline_location_unique/);
  assert.match(configuration, /merchant_cashier_stations_offline_location_unique/);
  assert.match(authority, /CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS/);
  assert.match(configuration, /CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS/);
});

test("0018 keeps secondary branch locations out of online fulfillment and does not invent inventory", async () => {
  const migration = await repo("lib/db/drizzle/0018_cashier_location_binding.sql");

  assert.match(
    migration,
    /WHERE NOT EXISTS \([\s\S]*existing\."is_default" = TRUE/,
  );
  assert.match(migration, /"online_fulfillment_enabled"[\s\S]*FALSE/);
  assert.match(
    migration,
    /UPDATE "merchant_cashier_stations" AS station[\s\S]*SET "location_id" = location\."id"/,
  );
  assert.match(
    migration,
    /ALTER COLUMN "location_id" SET NOT NULL/,
  );
  assert.doesNotMatch(
    migration,
    /INSERT INTO "location_inventory_levels"/,
  );
  assert.doesNotMatch(migration, /UPDATE "location_inventory_levels"/);
});

test("location inventory tables are protected by tenant RLS before cashier binding becomes authoritative", async () => {
  const security = await repo("lib/db/src/schema/tenant-security.ts");
  const migration = await repo("lib/db/drizzle/0018_cashier_location_binding.sql");

  assert.match(
    security,
    /merchantLocationsTenantPolicy[\s\S]*merchant_locations_tenant_boundary/,
  );
  assert.match(
    security,
    /locationInventoryLevelsTenantPolicy[\s\S]*location_inventory_levels_tenant_boundary/,
  );
  assert.match(migration, /ALTER TABLE "merchant_locations" ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /ALTER TABLE "location_inventory_levels" ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(migration, /CREATE POLICY "merchant_locations_tenant_boundary"/);
  assert.match(
    migration,
    /CREATE POLICY "location_inventory_levels_tenant_boundary"/,
  );
});

test("binding phase deliberately leaves cashier inventory projection on legacy merchant-wide catalog", async () => {
  const commerce = await api("src/services/cashierOperatorCommerceAuthority.ts");

  assert.match(
    commerce,
    /listCatalogProductsAuthoritative\(context\.merchant_id\)/,
  );
  assert.doesNotMatch(commerce, /location_inventory_levels/);
});
