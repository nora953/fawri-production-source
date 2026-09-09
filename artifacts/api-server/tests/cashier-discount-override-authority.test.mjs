import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('override approval schema is sale-bound, one-operation-only, expiring and auditable', async () => {
  const schema = await source('scripts/apply-cashier-discount-policy-schema.ts');
  assert.match(schema, /merchant_cashier_discount_override_approvals/);
  assert.match(schema, /operator_staff_id text NOT NULL/);
  assert.match(schema, /approver_staff_id text NOT NULL/);
  assert.match(schema, /operation_id text NOT NULL/);
  assert.match(schema, /manual_discount_minor bigint NOT NULL/);
  assert.match(schema, /manual_discount_reason text NOT NULL/);
  assert.match(schema, /expires_at timestamptz NOT NULL/);
  assert.match(schema, /consumed_at timestamptz NULL/);
  assert.match(schema, /CHECK \(operator_staff_id <> approver_staff_id\)/);
  assert.match(schema, /UNIQUE \(merchant_id, operation_id\)/);
});

test('override issuance requires another active manager, explicit permission, policy and PIN', async () => {
  const authority = await source('src/services/cashierDiscountOverrideAuthority.ts');
  assert.match(authority, /approverStaffId === input\.context\.staff_id/);
  assert.match(authority, /approver\.status !== 'active'/);
  assert.match(authority, /approver\.role !== 'manager'/);
  assert.match(authority, /permission = 'sale\.discount_override'/);
  assert.match(authority, /policy\.can_approve_override/);
  assert.match(authority, /verifyPassword\(enteredPin, approver\.pin_hash\)/);
  assert.match(authority, /PIN_FAILURE_LIMIT = 5/);
  assert.match(authority, /PIN_LOCK_MS = 15 \* 60 \* 1000/);
});

test('approval is bound to tenant, station, operator, operation, amount and normalized reason', async () => {
  const authority = await source('src/services/cashierDiscountOverrideAuthority.ts');
  assert.match(authority, /approval\.station_id !== input\.stationId/);
  assert.match(authority, /approval\.operator_staff_id !== input\.operatorStaffId/);
  assert.match(authority, /approval\.manual_discount_reason !== input\.reason/);
  assert.match(authority, /Number\(approval\.manual_discount_minor\) !== input\.manualDiscountMinor/);
  assert.match(authority, /merchant_id = \$1 AND id = \$2 AND operation_id = \$3/);
  assert.match(authority, /FOR UPDATE/);
  assert.match(authority, /consumed_at = now\(\)/);
});

test('consumed approval remains retry-safe only for its exact operation', async () => {
  const authority = await source('src/services/cashierDiscountOverrideAuthority.ts');
  assert.match(authority, /if \(approval\.consumed_at\) return/);
  assert.match(authority, /approval has been consumed it remains valid only for this exact/);
});

test('operator routes expose eligible approvers and PIN-backed approval issuance', async () => {
  const routes = await source('src/routes/cashier-operator-commerce.ts');
  assert.match(routes, /\/cashier\/operator\/discount-override\/approvers/);
  assert.match(routes, /\/cashier\/operator\/discount-override/);
  assert.match(routes, /requireCashierOperatorSession\("sale\.discount"\)/);
  assert.match(routes, /approverStaffId: req\.body\?\.approver_staff_id/);
  assert.match(routes, /operationId: req\.body\?\.operation_id/);
  assert.match(routes, /manualDiscountMinor: req\.body\?\.manual_discount_minor/);
});

test('sale sync accepts manager proof only when employee limit is exceeded', async () => {
  const authority = await source('src/services/cashierOperatorDiscountAuthority.ts');
  assert.match(authority, /if \(manualDiscount <= limit\) return/);
  assert.match(authority, /manual_discount_override_approval_id/);
  assert.match(authority, /CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED/);
  assert.match(authority, /consumeCashierDiscountOverrideApproval/);
  assert.match(authority, /operationId: sale\.operationId/);
});
