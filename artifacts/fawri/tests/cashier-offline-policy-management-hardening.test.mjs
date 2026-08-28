import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fawriRoot = new URL('../', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);

async function fawriSource(path) {
  return readFile(new URL(path, fawriRoot), 'utf8');
}

async function repoSource(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

test('cashier station configuration uses an independent optimistic etag', async () => {
  const authority = await repoSource('artifacts/api-server/src/services/postgresCashierStaffAuthority.ts');
  const route = await repoSource('artifacts/api-server/src/routes/cashier-staff-operations.ts');

  assert.match(authority, /configuration_etag:\s*string/);
  assert.match(authority, /cashierStationConfigurationEtag/);
  assert.match(authority, /expectedConfigurationEtag:\s*unknown/);
  assert.match(authority, /CASHIER_STATION_VERSION_CONFLICT/);
  assert.match(authority, /getStationRow\(client, merchantId, stationId, true\)/);
  assert.match(authority, /currentEtag !== expectedConfigurationEtag/);
  assert.match(route, /expectedConfigurationEtag:\s*req\.body\?\.expected_configuration_etag/);
});

test('merchant dashboard exposes safe station editing including offline inventory policy', async () => {
  const page = await fawriSource('src/pages/dashboard/CashierManagementPage.tsx');

  assert.match(page, /configuration_etag:\s*string/);
  assert.match(page, /editingStationId/);
  assert.match(page, /startStationEdit/);
  assert.match(page, /saveStationEdit/);
  assert.match(page, /expected_configuration_etag:\s*station\.configuration_etag/);
  assert.match(page, /offline_inventory_authority:\s*editOfflineAuthority/);
  assert.match(page, /CASHIER_STATION_VERSION_CONFLICT/);
  assert.match(page, /editStation/);
});

test('online operator validation refreshes station policy without replacing shift identity', async () => {
  const runtime = await fawriSource('src/lib/cashierOperatorSessionRuntime.ts');
  const entry = await fawriSource('src/cashierMain.tsx');

  const validateStart = runtime.indexOf('export async function validateCashierOperatorSession');
  const validateEnd = runtime.indexOf('\nexport function cashierOperatorCan', validateStart);
  const validateBody = runtime.slice(validateStart, validateEnd);

  assert.match(validateBody, /payload\.operator/);
  assert.match(validateBody, /offline_inventory_authority/);
  assert.match(validateBody, /writeCashierDeviceIdentity/);
  assert.match(validateBody, /sessionStorage\.setItem\(OPERATOR_STORAGE_KEY/);
  assert.match(validateBody, /operator_session_id/);
  assert.match(validateBody, /shift_id/);

  const attemptStart = entry.indexOf('const attempt = async');
  const attemptEnd = entry.indexOf('const handleOnline', attemptStart);
  const attemptBody = entry.slice(attemptStart, attemptEnd);
  assert.match(attemptBody, /validateCashierOperatorSession/);
  assert.ok(
    attemptBody.indexOf('validateCashierOperatorSession') < attemptBody.indexOf('syncCashierOperatorOutboxToCloud'),
    'online reconciliation must refresh authoritative operator context before outbox upload',
  );
});

test('offline tracked-inventory rejection has a specific cashier message', async () => {
  const copy = await fawriSource('src/lib/cashierUiCopy.ts');
  const page = await fawriSource('src/pages/CashierPosPage.tsx');

  assert.match(copy, /errorOfflineInventoryAuthorityRequired/);
  assert.match(page, /CASHIER_OFFLINE_INVENTORY_AUTHORITY_REQUIRED/);
  assert.match(page, /labels\.errorOfflineInventoryAuthorityRequired/);
});
