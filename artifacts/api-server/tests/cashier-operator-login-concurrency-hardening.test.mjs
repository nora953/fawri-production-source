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

test('concurrent operator login unique conflicts map to stable cashier 409 errors', async () => {
  const source = await apiSource('src/services/postgresCashierStaffAuthority.ts');

  assert.match(source, /constraint\.includes\("cashier_shifts_open_station_unique"\)/);
  assert.match(source, /"CASHIER_STATION_SHIFT_OCCUPIED"/);
  assert.match(source, /constraint\.includes\("cashier_shifts_open_staff_unique"\)/);
  assert.match(source, /"CASHIER_OPERATOR_SHIFT_OCCUPIED"/);
  assert.match(source, /constraint\.includes\("cashier_operator_sessions_live_station_unique"\)/);
  assert.match(source, /"CASHIER_STATION_IN_USE"/);

  const loginStart = source.indexOf('export async function loginCashierOperatorAuthoritative');
  const transaction = source.indexOf('withMerchantOperationalTransaction(', loginStart);
  const translatedCatch = source.indexOf(').catch(translateDatabaseError)', transaction);
  const decisionCheck = source.indexOf('if (!decision.ok) throw decision.error', transaction);

  assert.ok(loginStart >= 0, 'operator login authority must exist');
  assert.ok(transaction > loginStart, 'operator login must use the merchant transaction');
  assert.ok(translatedCatch > transaction, 'operator login transaction conflicts must use database error translation');
  assert.ok(decisionCheck > translatedCatch, 'PIN decision handling must occur after transaction error translation');
});
