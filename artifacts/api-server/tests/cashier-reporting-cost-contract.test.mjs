import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiRoot = new URL('../', import.meta.url);
const webRoot = new URL('../../fawri/', import.meta.url);

async function apiSource(path) {
  return readFile(new URL(path, apiRoot), 'utf8');
}

async function webSource(path) {
  return readFile(new URL(path, webRoot), 'utf8');
}

test('cashier reporting cost is a validated merchant-private sale snapshot field', async () => {
  const server = await apiSource('src/services/postgresCashierSyncAuthority.ts');
  const contracts = await webSource('src/lib/cashierLocalContracts.ts');

  assert.match(contracts, /unit_cost_minor\?: number/);
  assert.match(server, /unit_cost_minor\?: number/);
  assert.match(
    server,
    /raw\.unit_cost_minor !== undefined[\s\S]*nonNegativeInteger\(raw\.unit_cost_minor, ["']line\.unit_cost_minor["']\)/,
  );
  assert.match(server, /unit_cost_minor: line\.unit_cost_minor/);
});

test('reporting cost participates in cashier idempotency identity', async () => {
  const server = await apiSource('src/services/postgresCashierSyncAuthority.ts');

  const parser = server.indexOf('function parseSaleLine');
  const normalizedSale = server.indexOf('sale,', server.indexOf('const normalizedForHash'));
  const requestHash = server.indexOf('requestHash: sha256(normalizedForHash)');
  const replayHash = server.indexOf('String(cashierMetadata.request_hash || "") !== bundle.requestHash');

  assert.ok(parser >= 0, 'server sale-line parser must exist');
  assert.ok(normalizedSale > parser, 'parsed sale must participate in the normalized request body');
  assert.ok(requestHash > normalizedSale, 'normalized sale must be hashed');
  assert.ok(replayHash > requestHash, 'replay must compare the canonical request hash');
});

test('reporting cost is not added to customer-facing operational facts', async () => {
  const resolver = await apiSource('src/services/knowledge/postgresOperationalFactResolver.ts');

  assert.doesNotMatch(resolver, /unit_cost_minor/);
  assert.doesNotMatch(resolver, /variant_costs_iqd/);
  assert.doesNotMatch(resolver, /cost_iqd/);
});


test('central cashier reporting uses canonical location attribution alongside station compatibility', async () => {
  const financial = await apiSource('src/services/postgresCashierCentralReportAuthority.ts');
  const activity = await apiSource('src/services/postgresCashierCentralActivityAuthority.ts');
  const page = await webSource('src/pages/dashboard/CashierCentralReportsPage.tsx');

  assert.match(financial, /sale_attribution\.location_id/);
  assert.match(financial, /LEFT JOIN merchant_locations location/);
  assert.match(financial, /by_location:/);

  assert.match(activity, /attribution\.location_id/);
  assert.match(activity, /LEFT JOIN merchant_locations location/);
  assert.match(activity, /GROUP BY attribution\.location_id, location\.name/);
  assert.match(activity, /by_location:/);

  assert.match(page, /salesByLocation/);
  assert.match(page, /activityByLocation/);
  assert.match(page, /item\.location_name \|\| labels\.formerLocation/);
});
