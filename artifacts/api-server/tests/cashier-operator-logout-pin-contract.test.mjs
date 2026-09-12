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

test('cashier logout route requires PIN and binds verification to authenticated operator identity', async () => {
  const route = await apiSource('src/routes/cashier-staff-operations.ts');
  const authority = await apiSource('src/services/cashierOperatorShiftCloseAuthority.ts');

  assert.match(route, /logoutCashierOperatorWithPinAuthoritative\(\{/);
  assert.match(route, /context: operator/);
  assert.match(route, /pin: req\.body\?\.pin/);

  assert.match(authority, /getCashierPinValidationError\(value\)/);
  assert.match(authority, /context\.staff_id/);
  assert.match(authority, /verifyPassword\(pin, staff\.pin_hash\)/);
  assert.match(authority, /CASHIER_PIN_LOCKED/);
  assert.match(authority, /failed_pin_attempts/);

  const pinVerification = authority.indexOf('verifyPassword(pin, staff.pin_hash)');
  const sessionClose = authority.indexOf("SET status = 'revoked', revoked_at = now()", pinVerification);
  const shiftClose = authority.indexOf("SET status = 'closed', ended_at = now(), close_reason = 'operator_logout'", sessionClose);

  assert.ok(pinVerification >= 0, 'PIN verification must exist');
  assert.ok(sessionClose > pinVerification, 'operator session must close only after PIN verification');
  assert.ok(shiftClose > sessionClose, 'shift must close only after the authenticated session is revoked');
});

test('cashier UI sends only PIN after explicit end-shift confirmation', async () => {
  const runtime = await repoSource('artifacts/fawri/src/lib/cashierEndShiftRuntime.ts');
  const dialog = await repoSource('artifacts/fawri/src/components/cashier/CashierEndShiftButton.tsx');
  const gate = await repoSource('artifacts/fawri/src/components/cashier/CashierOperatorGate.tsx');

  assert.match(runtime, /body: JSON\.stringify\(\{ pin \}\)/);
  assert.doesNotMatch(runtime, /staff_id/);
  assert.match(runtime, /invalidateCashierOperatorSession\(\)/);

  assert.match(dialog, /تأكيد إنهاء المناوبة/);
  assert.match(dialog, /type="password"/);
  assert.match(dialog, /inputMode="numeric"/);
  assert.match(dialog, /endCashierOperatorShiftWithPin\(pin\)/);
  assert.match(dialog, /CASHIER_OPERATOR_INVALID/);
  assert.match(dialog, /createPortal\(/);
  assert.match(dialog, /document\.body/);

  assert.match(gate, /<CashierEndShiftButton/);
  assert.doesNotMatch(gate, /logoutCashierOperator\(/);
});
