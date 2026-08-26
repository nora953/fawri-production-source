import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sanitizeCashierCatalogProduct } from '../src/services/cashierOperatorCommerceAuthority';

const routePath = new URL('../src/routes/cashier-operator-commerce.ts', import.meta.url);
const syncRoutePath = new URL('../src/routes/cashier-sync-operations.ts', import.meta.url);
const authorityPath = new URL('../src/services/cashierOperatorCommerceAuthority.ts', import.meta.url);
const schemaPath = new URL('../../../lib/db/src/schema/cashier-operation-attribution.ts', import.meta.url);
const schemaIndexPath = new URL('../../../lib/db/src/schema/index.ts', import.meta.url);
const migrationPath = new URL('../../../lib/db/drizzle/0014_cashier_operation_attribution.sql', import.meta.url);
const journalPath = new URL('../../../lib/db/drizzle/meta/_journal.json', import.meta.url);

test('operator catalog projection strips raw merchant costs unless explicitly granted', () => {
  const product = {
    id: 'p1',
    merchant_id: 'm1',
    version: 7,
    name: 'Product',
    price_iqd: 10000,
    cost_iqd: 6000,
    variant_costs_iqd: { 'size=l': 5500 },
    variants: [
      { id: 'v1', name: 'L', price_iqd: 10000, cost_iqd: 5500 },
    ],
  };
  const restricted = sanitizeCashierCatalogProduct(product, false);
  assert.equal(Object.prototype.hasOwnProperty.call(restricted, 'cost_iqd'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(restricted, 'variant_costs_iqd'), false);
  assert.equal(typeof restricted.cost_evidence, 'string');
  const restrictedVariants = restricted.variants as Array<Record<string, unknown>>;
  assert.equal(Object.prototype.hasOwnProperty.call(restrictedVariants[0], 'cost_iqd'), false);
  assert.equal(typeof restrictedVariants[0].cost_evidence, 'string');
  assert.doesNotMatch(String(restricted.cost_evidence), /6000|5500/);

  const privileged = sanitizeCashierCatalogProduct(product, true);
  assert.equal(privileged.cost_iqd, 6000);
  assert.equal((privileged.variants as Array<Record<string, unknown>>)[0].cost_iqd, 5500);
  assert.equal(typeof privileged.cost_evidence, 'string');
});

test('operator commerce routes bind sale return and void to distinct server permissions', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /catalog-snapshot[\s\S]*requireCashierOperatorSession\("sale\.create"\)/);
  assert.match(route, /sync\/sale[\s\S]*requireCashierOperatorSession\("sale\.create"\)/);
  assert.match(route, /sync\/return[\s\S]*requireCashierOperatorSession\("sale\.return"\)/);
  assert.match(route, /sync\/void[\s\S]*requireCashierOperatorSession\("sale\.void"\)/);
  assert.doesNotMatch(route, /requireMerchantSession|getMerchantIdFromSession/);
});

test('operator sync validates paired device identity and persists repairable attribution', async () => {
  const authority = await readFile(authorityPath, 'utf8');
  assert.match(authority, /identity\.cloudMerchantId !== context\.merchant_id/);
  assert.match(authority, /identity\.deviceId !== context\.device_id/);
  assert.match(authority, /cashier_operation_attribution/);
  assert.match(authority, /station_id, staff_id, shift_id, device_id/);
  assert.match(authority, /station_credential_id, operator_session_id/);
  assert.match(authority, /ON CONFLICT \(merchant_id, operation_id\) DO NOTHING/);
  assert.match(authority, /client receives no success[\s\S]*retry replays the sale and repairs the missing attribution/);
});

test('operator sale ignores raw client cost and requires encrypted cost evidence per line', async () => {
  const authority = await readFile(authorityPath, 'utf8');
  assert.match(authority, /resolveCashierCostEvidence/);
  assert.match(authority, /delete line\.unit_cost_minor/);
  assert.match(authority, /line\.cost_evidence/);
  assert.match(authority, /delete line\.cost_evidence/);
  assert.match(authority, /verifiedBody = prepareOperatorSaleBody/);
  assert.match(authority, /body: verifiedBody/);
});

test('return and void kind are checked before core compensation authority executes', async () => {
  const authority = await readFile(authorityPath, 'utf8');
  const identityIndex = authority.indexOf('cashierOperatorBundleIdentity(input.body, input.kind)');
  const syncIndex = authority.indexOf('syncCashierCompensationAuthoritative({');
  assert.ok(identityIndex >= 0 && syncIndex > identityIndex);
  assert.match(authority, /operator return endpoint requires a return operation/);
  assert.match(authority, /operator void endpoint requires a void operation/);
});

test('cashier operation attribution schema is tenant and shift scoped', async () => {
  const [schema, index, migration, journal] = await Promise.all([
    readFile(schemaPath, 'utf8'),
    readFile(schemaIndexPath, 'utf8'),
    readFile(migrationPath, 'utf8'),
    readFile(journalPath, 'utf8'),
  ]);
  assert.match(index, /cashier-operation-attribution/);
  assert.match(journal, /0014_cashier_operation_attribution/);
  assert.match(schema, /cashier_operation_attribution_merchant_operation_unique/);
  assert.match(schema, /cashier_operation_attribution_shift_identity_fk/);
  assert.match(schema, /staffOccurredIndex/);
  assert.match(schema, /stationOccurredIndex/);
  assert.match(migration, /CREATE TABLE "cashier_operation_attribution"/);
  assert.match(migration, /FOREIGN KEY \("shift_id","merchant_id","station_id","staff_id"\)/);
});

test('legacy merchant sync remains only as explicit compatibility bridge for client cutover', async () => {
  const syncRoute = await readFile(syncRoutePath, 'utf8');
  assert.match(syncRoute, /cashierOperatorCommerceRouter/);
  assert.match(syncRoute, /old sync routes[\s\S]*compatibility bridge until the cashier client finishes 3B/i);
  assert.match(syncRoute, /\/cashier\/sync\/sale[\s\S]*requireMerchantSession/);
  assert.match(syncRoute, /\/cashier\/sync\/compensation[\s\S]*requireMerchantSession/);
});
