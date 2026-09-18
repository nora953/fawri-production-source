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

test("0019 models location inventory audit and historical cashier location attribution", async () => {
  const locations = await repo("lib/db/src/schema/locations.ts");
  const attribution = await repo(
    "lib/db/src/schema/cashier-operation-attribution.ts",
  );
  const security = await repo("lib/db/src/schema/tenant-security.ts");
  const migration = await repo(
    "lib/db/drizzle/0019_cashier_location_inventory_cutover.sql",
  );
  const stage = JSON.parse(
    await repo("lib/db/migration-stages/0019/stage.json"),
  );
  const journal = JSON.parse(await repo("lib/db/drizzle/meta/_journal.json"));

  assert.match(locations, /locationInventoryMutations = pgTable\(/);
  assert.match(locations, /"location_inventory_mutations"/);
  assert.match(
    locations,
    /location_inventory_mutations_merchant_idempotency_unique/,
  );
  assert.match(
    security,
    /locationInventoryMutationsTenantPolicy[\s\S]*location_inventory_mutations_tenant_boundary/,
  );

  assert.match(attribution, /locationId: text\("location_id"\)\.notNull\(\)/);
  assert.match(attribution, /saleId: text\("sale_id"\)/);
  assert.match(
    attribution,
    /operationKind} IN \('sale', 'return', 'void'\)[\s\S]*inventory_adjustment/,
  );
  assert.match(
    attribution,
    /cashier_operation_attribution_location_merchant_fk/,
  );

  assert.match(
    migration,
    /UPDATE "cashier_operation_attribution" AS attribution[\s\S]*station\."location_id"/,
  );
  assert.match(
    migration,
    /ALTER COLUMN "location_id" SET NOT NULL/,
  );
  assert.match(
    migration,
    /ALTER COLUMN "sale_id" DROP NOT NULL/,
  );
  assert.match(
    migration,
    /"operation_kind" = 'inventory_adjustment' AND "sale_id" IS NULL/,
  );
  assert.match(
    migration,
    /CREATE TABLE "location_inventory_mutations"/,
  );
  assert.match(
    migration,
    /ALTER TABLE "location_inventory_mutations" ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /CREATE POLICY "location_inventory_mutations_tenant_boundary"/,
  );
  assert.doesNotMatch(migration, /DROP TABLE "location_inventory_levels"/);
  assert.doesNotMatch(migration, /DROP COLUMN "quantity"/);

  assert.equal(stage.index, 19);
  assert.equal(stage.name, "cashier_location_inventory_cutover");
  assert.equal(
    stage.sql_sha256,
    "239ba935fb6857f13ad6975cc770305af8bf8d87707963b38dec918760f1e3ed",
  );
  assert.ok(
    journal.entries.some(
      (entry) =>
        entry.idx === 19 &&
        entry.tag === "0019_cashier_location_inventory_cutover",
    ),
  );
});

test("operator catalog and sale lifecycle are location scoped while legacy bridge remains available", async () => {
  const operator = await api(
    "src/services/cashierOperatorCommerceAuthority.ts",
  );
  const sale = await api("src/services/postgresCashierSyncAuthority.ts");
  const compensation = await api(
    "src/services/postgresCashierCompensationSyncAuthority.ts",
  );

  assert.match(
    operator,
    /projectCashierCatalogForLocationAuthoritative\(\{[\s\S]*locationId: context\.location_id/,
  );
  assert.match(operator, /location_id: context\.location_id/);
  assert.match(
    operator,
    /syncCashierSaleAuthoritative\(\{[\s\S]*locationId: input\.context\.location_id/,
  );
  assert.match(
    operator,
    /syncCashierCompensationAuthoritative\(\{[\s\S]*locationId: input\.context\.location_id/,
  );

  assert.match(
    sale,
    /mutateCashierLocationInventoryInTransaction\(target,[\s\S]*locationId/,
  );
  assert.match(
    sale,
    /\.\.\.\(locationId \? \{ location_id: locationId \} : \{\}\)/,
  );
  assert.match(sale, /params\.locationId === undefined/);
  assert.match(
    sale,
    /CASHIER_LOCATION_CONTEXT_REQUIRED/,
  );

  assert.match(
    compensation,
    /CASHIER_COMPENSATION_LOCATION_MISMATCH/,
  );
  assert.match(
    compensation,
    /originalSaleAttributedLocation/,
  );
  assert.match(
    compensation,
    /location_inventory_mutations/,
  );
  assert.match(
    compensation,
    /mutateCashierLocationInventoryInTransaction/,
  );
});

test("standalone cashier inventory adjustment is permission bound and location attributed", async () => {
  const operator = await api(
    "src/services/cashierOperatorCommerceAuthority.ts",
  );
  const routes = await api("src/routes/cashier-operator-commerce.ts");
  const localSecurity = await repo(
    "artifacts/fawri/src/lib/cashierOperatorLocalSecurity.ts",
  );
  const cloudSync = await repo(
    "artifacts/fawri/src/lib/cashierOperatorCloudSync.ts",
  );

  assert.match(
    routes,
    /"\/cashier\/operator\/sync\/inventory-adjustment"[\s\S]*requireCashierOperatorSession\("inventory\.adjust"\)/,
  );
  assert.match(
    operator,
    /syncCashierOperatorInventoryAdjustmentAuthoritative/,
  );
  assert.match(
    operator,
    /reason !== "restock" && reason !== "manual_adjustment"/,
  );
  assert.match(
    operator,
    /kind: "inventory_adjustment"/,
  );
  assert.match(
    operator,
    /saleId \|\| null/,
  );

  assert.match(
    localSecurity,
    /operation_kind: 'sale' \| 'return' \| 'void' \| 'inventory_adjustment'/,
  );
  assert.match(localSecurity, /location_id: string/);

  assert.match(
    cloudSync,
    /'inventory_adjustment'/,
  );
  assert.match(
    cloudSync,
    /inventory-adjustment/,
  );
  assert.match(
    cloudSync,
    /cashierOperatorCan\(session, 'inventory\.adjust'\)/,
  );
  assert.match(
    cloudSync,
    /binding\.location_id === session\.context\.location_id/,
  );
});

test("device, session, and operation bindings persist stable location identity", async () => {
  const session = await repo(
    "artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts",
  );
  const localSecurity = await repo(
    "artifacts/fawri/src/lib/cashierOperatorLocalSecurity.ts",
  );
  const cloudSync = await repo(
    "artifacts/fawri/src/lib/cashierOperatorCloudSync.ts",
  );

  assert.match(session, /location_id\?: string/);
  assert.match(
    session,
    /export type CashierStationBinding = \{[\s\S]*location_id: string/,
  );
  assert.match(
    session,
    /fetch\('\/api\/cashier\/station\/me'/,
  );
  assert.match(
    session,
    /location_id: binding\.location_id/,
  );
  assert.match(
    localSecurity,
    /existing\.location_id === binding\.location_id/,
  );
  assert.match(
    cloudSync,
    /text\(payload\.location_id\) !== session\.context\.location_id/,
  );
});

test("sales activity report deliberately excludes inventory adjustments until reports phase", async () => {
  const activity = await api(
    "src/services/postgresCashierCentralActivityAuthority.ts",
  );
  const filters =
    activity.match(
      /attribution\.operation_kind IN \('sale', 'return', 'void'\)/g,
    ) || [];
  assert.equal(filters.length, 3);
});
