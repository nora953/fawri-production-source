import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiRoot = new URL('../', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);

async function apiSource(path) {
  return readFile(new URL(path, apiRoot), 'utf8');
}

async function repoSource(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

test('cashier schema enforces one open shift per station and staff plus one live operator per station', async () => {
  const migration = await repoSource('lib/db/drizzle/0013_cashier_staff_station_authority.sql');

  assert.match(migration, /cashier_shifts_open_station_unique/);
  assert.match(migration, /\("merchant_id", "station_id"\) WHERE "status" = 'open'/);
  assert.match(migration, /cashier_shifts_open_staff_unique/);
  assert.match(migration, /\("merchant_id", "staff_id"\) WHERE "status" = 'open'/);
  assert.match(migration, /cashier_operator_sessions_live_station_unique/);
  assert.match(migration, /\("merchant_id", "station_id"\) WHERE "status" = 'active'/);
});

test('concurrent operator login unique conflicts map to stable cashier 409 errors at the API boundary', async () => {
  const route = await apiSource('src/routes/cashier-staff-operations.ts');
  const authority = await apiSource('src/services/postgresCashierStaffAuthority.ts');

  assert.match(route, /candidate\?\.code/);
  assert.match(route, /23505/);
  assert.match(route, /cashier_shifts_open_station_unique/);
  assert.match(route, /CASHIER_STATION_SHIFT_OCCUPIED/);
  assert.match(route, /cashier_shifts_open_staff_unique/);
  assert.match(route, /CASHIER_OPERATOR_SHIFT_OCCUPIED/);
  assert.match(route, /cashier_operator_sessions_live_station_unique/);
  assert.match(route, /CASHIER_STATION_IN_USE/);
  assert.match(route, /res\.status\(mapped\.status\)/);

  const loginStart = authority.indexOf('export async function loginCashierOperatorAuthoritative');
  const transaction = authority.indexOf('withMerchantOperationalTransaction(', loginStart);
  const shiftInsert = authority.indexOf('INSERT INTO cashier_shifts', transaction);
  const sessionInsert = authority.indexOf('INSERT INTO cashier_operator_sessions', shiftInsert);

  assert.ok(loginStart >= 0, 'operator login authority must exist');
  assert.ok(transaction > loginStart, 'operator login must use one merchant transaction');
  assert.ok(shiftInsert > transaction, 'open shift creation must stay inside the login transaction');
  assert.ok(sessionInsert > shiftInsert, 'operator session creation must follow shift creation');
});
