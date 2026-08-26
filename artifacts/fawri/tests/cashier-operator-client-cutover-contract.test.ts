import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const aggregatePath = new URL('../src/lib/cashierOperatorClientRuntime.ts', import.meta.url);
const sessionPath = new URL('../src/lib/cashierOperatorSessionClient.ts', import.meta.url);
const localPath = new URL('../src/lib/cashierOperatorLocalSecurity.ts', import.meta.url);
const cloudPath = new URL('../src/lib/cashierOperatorCloudSync.ts', import.meta.url);
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

test('operator client runtime is split into session local-security and cloud-sync authorities', async () => {
  const aggregate = await readFile(aggregatePath, 'utf8');
  assert.match(aggregate, /cashierOperatorLocalSecurity/);
  assert.match(aggregate, /cashierOperatorSessionClient/);
  assert.match(aggregate, /cashierOperatorCloudSync/);
});

test('station credential is device persistent while operator token is session scoped', async () => {
  const session = await readFile(sessionPath, 'utf8');
  assert.match(session, /station_token\?: string/);
  assert.match(session, /sessionStorage\.setItem\(OPERATOR_STORAGE_KEY/);
  assert.match(session, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY/);
  assert.doesNotMatch(session, /localStorage/);
  assert.match(session, /station_token: binding\.station_token/);
});

test('pairing fails closed with pending legacy operations and scrubs raw local costs after pairing', async () => {
  const [session, local] = await Promise.all([
    readFile(sessionPath, 'utf8'),
    readFile(localPath, 'utf8'),
  ]);
  const pendingIndex = session.indexOf('CASHIER_PAIRING_PENDING_OPERATIONS');
  const redeemIndex = session.indexOf("fetch('/api/cashier/station/pair'");
  assert.ok(pendingIndex >= 0 && redeemIndex > pendingIndex);
  assert.match(session, /scrubCashierRawCostsForIdentity\(next\)/);
  assert.match(local, /delete record\.unit_cost_minor/);
  assert.match(local, /delete line\.unit_cost_minor/);
});

test('operator logout cannot close a shift with pending outbox or while offline', async () => {
  const session = await readFile(sessionPath, 'utf8');
  assert.match(session, /CASHIER_OPERATOR_PENDING_SYNC/);
  assert.match(session, /CASHIER_OPERATOR_LOGOUT_OFFLINE/);
  assert.match(session, /getCashierPendingEnvelopeCountForIdentity\(identity\)/);
});

test('operator catalog refresh cannot rotate cost evidence while pending operations exist', async () => {
  const cloud = await readFile(cloudPath, 'utf8');
  const pendingIndex = cloud.indexOf('CASHIER_OPERATOR_PENDING_SYNC');
  const catalogFetchIndex = cloud.indexOf("fetch('/api/cashier/operator/catalog-snapshot'");
  assert.ok(pendingIndex >= 0 && catalogFetchIndex > pendingIndex);
  assert.match(cloud, /Never rotate protected cost evidence/);
});

test('operator client stores opaque cost evidence separately and never persists raw catalog cost', async () => {
  const [local, cloud] = await Promise.all([
    readFile(localPath, 'utf8'),
    readFile(cloudPath, 'utf8'),
  ]);
  assert.match(local, /COST_EVIDENCE_STORE = 'cost_evidence'/);
  assert.match(cloud, /Protected cashier cost evidence is unavailable for this sale line/);
  assert.match(cloud, /delete line\.unit_cost_minor;[\s\S]*line\.cost_evidence = token/);
  assert.doesNotMatch(cloud, /unit_cost_minor: product\.cost_iqd|unit_cost_minor: variant\.cost_iqd/);
});

test('every pending operator operation must match the current staff station shift and device binding', async () => {
  const cloud = await readFile(cloudPath, 'utf8');
  assert.match(cloud, /binding\.station_id !== session\.context\.station_id/);
  assert.match(cloud, /binding\.staff_id !== session\.context\.staff_id/);
  assert.match(cloud, /binding\.shift_id !== session\.context\.shift_id/);
  assert.match(cloud, /binding\.device_id !== session\.context\.device_id/);
  assert.match(cloud, /CASHIER_OPERATION_BINDING_REQUIRED/);
});

test('operator client commerce uses only station and operator APIs, never merchant catalog or legacy sync routes', async () => {
  const [session, cloud] = await Promise.all([
    readFile(sessionPath, 'utf8'),
    readFile(cloudPath, 'utf8'),
  ]);
  const combined = `${session}\n${cloud}`;
  assert.match(combined, /\/api\/cashier\/operator\/catalog-snapshot/);
  assert.match(combined, /\/api\/cashier\/operator\/sync\/sale/);
  assert.match(combined, /\/api\/cashier\/operator\/sync\/return/);
  assert.match(combined, /\/api\/cashier\/operator\/sync\/void/);
  assert.doesNotMatch(combined, /\/api\/catalog\/products|\/api\/catalog\/promotions|\/api\/cashier\/sync\/sale|\/api\/cashier\/sync\/compensation/);
  assert.doesNotMatch(combined, /credentials:\s*['"]include['"]/);
});
