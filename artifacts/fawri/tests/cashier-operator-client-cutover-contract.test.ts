import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clientPath = new URL('../src/lib/cashierOperatorClientRuntime.ts', import.meta.url);
const routePath = new URL('../../api-server/src/routes/cashier-staff-operations.ts', import.meta.url);

test('paired station exposes only minimal active staff identities for PIN selection', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /\/cashier\/station\/staff[\s\S]*requireCashierStationCredential/);
  assert.match(route, /filter\(\(member\) => member\.status === "active"\)/);
  assert.match(route, /display_name: member\.display_name/);
  assert.doesNotMatch(
    route.slice(route.indexOf('"/cashier/station/staff"'), route.indexOf('"/cashier/operator/login"')),
    /permissions: member\.permissions|pin_hash|locked_until/,
  );
});

test('station credential is device persistent while operator token is session scoped', async () => {
  const client = await readFile(clientPath, 'utf8');
  assert.match(client, /station_token\?: string/);
  assert.match(client, /sessionStorage\.setItem\(OPERATOR_STORAGE_KEY/);
  assert.match(client, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY/);
  assert.doesNotMatch(client, /localStorage/);
});

test('pairing fails closed with pending legacy operations and scrubs raw local costs after pairing', async () => {
  const client = await readFile(clientPath, 'utf8');
  const pendingIndex = client.indexOf('CASHIER_PAIRING_PENDING_OPERATIONS');
  const redeemIndex = client.indexOf("fetch('/api/cashier/station/pair'");
  assert.ok(pendingIndex >= 0 && redeemIndex > pendingIndex);
  assert.match(client, /scrubLegacyLocalCosts\(next\)/);
  assert.match(client, /delete record\.unit_cost_minor/);
  assert.match(client, /delete line\.unit_cost_minor/);
});

test('operator logout cannot close a shift with pending outbox or while offline', async () => {
  const client = await readFile(clientPath, 'utf8');
  assert.match(client, /CASHIER_OPERATOR_PENDING_SYNC/);
  assert.match(client, /CASHIER_OPERATOR_LOGOUT_OFFLINE/);
  assert.match(client, /getCashierPendingEnvelopeCount\(\)/);
});

test('operator client stores opaque cost evidence separately and never persists raw catalog cost', async () => {
  const client = await readFile(clientPath, 'utf8');
  assert.match(client, /COST_EVIDENCE_STORE = 'cost_evidence'/);
  assert.match(client, /Protected cashier cost evidence is unavailable for this sale line/);
  assert.match(client, /delete line\.unit_cost_minor;[\s\S]*line\.cost_evidence = token/);
  assert.doesNotMatch(client, /unit_cost_minor: product\.cost_iqd|unit_cost_minor: variant\.cost_iqd/);
});

test('every pending operator operation must match the current staff station shift and device binding', async () => {
  const client = await readFile(clientPath, 'utf8');
  assert.match(client, /OPERATION_BINDING_STORE = 'operation_bindings'/);
  assert.match(client, /binding\.station_id !== session\.context\.station_id/);
  assert.match(client, /binding\.staff_id !== session\.context\.staff_id/);
  assert.match(client, /binding\.shift_id !== session\.context\.shift_id/);
  assert.match(client, /binding\.device_id !== session\.context\.device_id/);
  assert.match(client, /CASHIER_OPERATION_BINDING_REQUIRED/);
});

test('operator client commerce uses only station and operator APIs, never merchant catalog or legacy sync routes', async () => {
  const client = await readFile(clientPath, 'utf8');
  assert.match(client, /\/api\/cashier\/operator\/catalog-snapshot/);
  assert.match(client, /\/api\/cashier\/operator\/sync\/sale/);
  assert.match(client, /\/api\/cashier\/operator\/sync\/return/);
  assert.match(client, /\/api\/cashier\/operator\/sync\/void/);
  assert.doesNotMatch(client, /\/api\/catalog\/products|\/api\/catalog\/promotions|\/api\/cashier\/sync\/sale|\/api\/cashier\/sync\/compensation/);
  assert.doesNotMatch(client, /credentials:\s*['"]include['"]/);
});
