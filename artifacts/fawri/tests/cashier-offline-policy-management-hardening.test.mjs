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

test('cashier station configuration uses a heartbeat-independent optimistic etag', async () => {
  const authority = await repoSource('artifacts/api-server/src/services/cashierStationConfigurationAuthority.ts');
  const route = await repoSource('artifacts/api-server/src/routes/cashier-staff-operations.ts');

  assert.match(authority, /configuration_etag:\s*string/);
  assert.match(authority, /cashierStationConfigurationEtag/);
  assert.match(authority, /expectedConfigurationEtag:\s*unknown/);
  assert.match(authority, /CASHIER_STATION_VERSION_CONFLICT/);
  assert.match(authority, /FOR UPDATE/);
  assert.match(authority, /currentEtag !== expectedConfigurationEtag/);
  assert.doesNotMatch(
    authority,
    /updated_at[^\n]*configuration_etag|last_seen_at[^\n]*configuration_etag/,
    'configuration etag must not depend on heartbeat timestamps',
  );
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

test('online policy refresh preserves operator and shift identity before outbox upload', async () => {
  const policy = await fawriSource('src/lib/cashierOperatorPolicyRefresh.ts');
  const entry = await fawriSource('src/cashierMain.tsx');

  assert.match(policy, /\/api\/cashier\/operator\/me/);
  assert.match(policy, /offline_inventory_authority/);
  assert.match(policy, /writeCashierDeviceIdentity/);
  assert.match(policy, /sessionStorage\.setItem\(OPERATOR_STORAGE_KEY/);
  assert.match(policy, /operator_session_id/);
  assert.match(policy, /shift_id/);
  assert.match(policy, /sameImmutableContext/);
  assert.doesNotMatch(policy, /logoutCashierOperator|\/operator\/login/);

  const attemptStart = entry.indexOf('const attempt = async');
  const attemptEnd = entry.indexOf('const handleOnline', attemptStart);
  const attemptBody = entry.slice(attemptStart, attemptEnd);
  assert.match(attemptBody, /refreshCashierOperatorPolicyFromCloud/);
  assert.ok(
    attemptBody.indexOf('refreshCashierOperatorPolicyFromCloud') < attemptBody.indexOf('syncCashierOperatorOutboxToCloud'),
    'online reconciliation must refresh authoritative station policy before outbox upload',
  );
});

test('offline tracked-inventory rejection has a specific cashier message', async () => {
  const copy = await fawriSource('src/lib/cashierUiCopy.ts');
  const page = await fawriSource('src/pages/CashierPosPage.tsx');

  assert.match(copy, /errorOfflineInventoryAuthorityRequired/);
  assert.match(page, /CASHIER_OFFLINE_INVENTORY_AUTHORITY_REQUIRED/);
  assert.match(page, /labels\.errorOfflineInventoryAuthorityRequired/);
});
