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
  const policyRefresh = await repo(
    "artifacts/fawri/src/lib/cashierOperatorPolicyRefresh.ts",
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
  assert.match(
    policyRefresh,
    /location_id: text\(operator\.location_id\)/,
  );
  assert.match(
    policyRefresh,
    /context\.location_id === session\.context\.location_id/,
  );
  assert.match(
    policyRefresh,
    /identity\.location_id !== context\.location_id/,
  );
  assert.match(
    policyRefresh,
    /location_id: context\.location_id/,
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

test("merchant catalog inventory is location authoritative and legacy writes are safe", async () => {
  const catalog = await api("src/services/postgresCatalogAuthority.ts");
  const authority = await api(
    "src/services/postgresMerchantLocationInventoryAuthority.ts",
  );
  const routes = await api("src/routes/catalog-operations.ts");
  const client = await repo("artifacts/fawri/src/lib/catalogUiApi.ts");
  const page = await repo(
    "artifacts/fawri/src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx",
  );

  assert.match(
    catalog,
    /preserveExistingInventoryOnCatalogEdit/,
  );
  assert.match(
    catalog,
    /resolveSingleInventoryLocationForCompatibilityAuthoritative/,
  );
  assert.match(
    catalog,
    /setMerchantLocationInventoryAuthoritative/,
  );
  assert.match(
    catalog,
    /adjustMerchantLocationInventoryAuthoritative/,
  );

  assert.match(
    authority,
    /location_inventory_levels/,
  );
  assert.match(
    authority,
    /location_inventory_mutations/,
  );
  assert.match(
    authority,
    /allowInactiveLocation: true/,
  );
  assert.match(
    authority,
    /CATALOG_LOCATION_REQUIRED/,
  );
  assert.match(
    authority,
    /Number\(level\.version\) !== input\.expectedVersion/,
  );
  assert.match(
    authority,
    /expectedLocationVersion: input\.expectedVersion/,
  );
  assert.doesNotMatch(
    authority,
    /product\.version !== input\.expectedVersion/,
  );
  assert.doesNotMatch(
    authority,
    /WHERE merchant_id = \$1\s+AND status = 'active'/,
  );

  assert.match(
    routes,
    /"\/inventory\/products\/:productId\/locations"/,
  );
  assert.match(
    routes,
    /"\/inventory\/products\/:productId\/locations\/:locationId\/set"/,
  );
  assert.match(
    routes,
    /"\/inventory\/products\/:productId\/locations\/:locationId\/adjust"/,
  );

  assert.match(
    client,
    /getCatalogProductLocationInventory/,
  );
  assert.match(
    client,
    /setCatalogLocationInventory/,
  );
  assert.match(
    client,
    /adjustCatalogLocationInventory/,
  );

  assert.match(page, /inventoryByLocation/);
  assert.match(page, /locationInventoryKey/);
  assert.match(page, /inventoryLevelVersion/);
  assert.match(page, /expectedVersion,/);
  assert.doesNotMatch(page, /expectedVersion: product\.version/);
  assert.match(page, /currentQuantity=\{currentQuantity\}/);
  assert.match(page, /disabledLocation/);
});

test("cloud-bound offline inventory edits bind operator context before local commit", async () => {
  const indexedDb = await repo(
    "artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts",
  );
  const localSecurity = await repo(
    "artifacts/fawri/src/lib/cashierOperatorLocalSecurity.ts",
  );

  assert.match(
    indexedDb,
    /if \(this\.cloudMerchantId\)[\s\S]*getCashierOperatorSession\(\)/,
  );
  assert.match(
    indexedDb,
    /cashierOperatorCan\(session, 'inventory\.adjust'\)/,
  );
  assert.match(
    indexedDb,
    /bindCashierOperationToCurrentOperator\([\s\S]*'inventory_adjustment'/,
  );

  const bindPosition = indexedDb.indexOf(
    "bindCashierOperationToCurrentOperator(",
  );
  const transactionPosition = indexedDb.indexOf(
    "const transaction = database.transaction(",
    indexedDb.indexOf("async adjustInventory("),
  );
  assert.ok(bindPosition > 0);
  assert.ok(transactionPosition > bindPosition);

  assert.match(
    localSecurity,
    /import type \{[\s\S]*IndexedDbCashierAuthority[\s\S]*\} from '\.\/cashierIndexedDbAuthority'/,
  );
  assert.match(
    localSecurity,
    /await import\('\.\/cashierIndexedDbAuthority'\)/,
  );
});
