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

test('cashier station configuration uses an independent optimistic version', async () => {
  const schema = await repoSource('lib/db/src/schema/cashier-staff.ts');
  const migration = await repoSource('lib/db/drizzle/0015_cashier_station_configuration_version.sql');
  const authority = await repoSource('artifacts/api-server/src/services/postgresCashierStaffAuthority.ts');
  const route = await repoSource('artifacts/api-server/src/routes/cashier-staff-operations.ts');

  assert.match(schema, /merchantCashierStations[\s\S]*version:\s*integer\("version"\)\.notNull\(\)\.default\(1\)/);
  assert.match(migration, /ADD COLUMN "version" integer DEFAULT 1 NOT NULL/);
  assert.match(migration, /merchant_cashier_stations_version_check/);
  assert.match(authority, /type StationRow = \{[\s\S]*version:\s*number;/);
  assert.match(authority, /type CashierStationView = \{[\s\S]*version:\s*number;/);
  assert.match(authority, /expectedVersion:\s*unknown/);
  assert.match(authority, /CASHIER_STATION_VERSION_CONFLICT/);
  assert.match(authority, /version = version \+ 1/);
  assert.match(authority, /WHERE merchant_id = \$1 AND id = \$2 AND version = \$3/);
  assert.match(route, /expectedVersion:\s*req\.body\?\.expected_version/);
});

test('merchant dashboard exposes safe station editing including offline inventory policy', async () => {
  const page = await fawriSource('src/pages/dashboard/CashierManagementPage.tsx');

  assert.match(page, /type StationView = \{[\s\S]*version:\s*number;/);
  assert.match(page, /editingStationId/);
  assert.match(page, /startStationEdit/);
  assert.match(page, /saveStationEdit/);
  assert.match(page, /expected_version:\s*station\.version/);
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
