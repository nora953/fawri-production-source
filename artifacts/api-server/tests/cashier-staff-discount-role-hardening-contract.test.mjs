import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiRoot = new URL('../', import.meta.url);

async function api(path) {
  return readFile(new URL(path, apiRoot), 'utf8');
}

test('discount override role hardening trusts the stored staff role and locks the row', async () => {
  const service = await api('src/services/cashierStaffDiscountRoleHardening.ts');

  assert.match(service, /SELECT id, role/);
  assert.match(service, /FROM merchant_cashier_staff/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /staff\.role === 'manager'/);
});

test('non-manager cleanup removes only override authority and clears the stored policy flag', async () => {
  const service = await api('src/services/cashierStaffDiscountRoleHardening.ts');

  assert.match(service, /DELETE FROM merchant_cashier_staff_permissions/);
  assert.match(service, /permission = 'sale\.discount_override'/);
  assert.doesNotMatch(service, /permission IN \('sale\.discount', 'sale\.discount_override'\)/);
  assert.match(service, /UPDATE merchant_cashier_staff_discount_policies/);
  assert.match(service, /SET can_approve_override = FALSE/);
  assert.match(service, /version = version \+ 1/);
});

test('non-manager cleanup also scrubs override permission from active session snapshots', async () => {
  const service = await api('src/services/cashierStaffDiscountRoleHardening.ts');

  assert.match(service, /UPDATE cashier_operator_sessions/);
  assert.match(service, /permission_snapshot = COALESCE\(permission_snapshot, '\[\]'::jsonb\)/);
  assert.match(service, /- 'sale\.discount_override'/);
  assert.match(service, /status = 'active'/);
  assert.match(service, /\? 'sale\.discount_override'/);
});

test('optional discount policy table compatibility uses a savepoint and catches only undefined-table', async () => {
  const service = await api('src/services/cashierStaffDiscountRoleHardening.ts');

  assert.match(service, /SAVEPOINT cashier_discount_role_hardening_policy/);
  assert.match(service, /ROLLBACK TO SAVEPOINT cashier_discount_role_hardening_policy/);
  assert.match(service, /RELEASE SAVEPOINT cashier_discount_role_hardening_policy/);
  assert.match(service, /=== '42P01'/);
});

test('both staff creation and update enforce the discount override role invariant', async () => {
  const route = await api('src/routes/cashier-staff-operations.ts');

  assert.match(route, /enforceCashierDiscountOverrideRoleInvariant/);
  assert.match(route, /async function hardenDiscountOverrideRole/);
  assert.match(route, /if \(staff\.role === "manager"\) return staff/);
  assert.match(route, /permission !== "sale\.discount_override"/);

  const createAt = route.indexOf('const created = await createCashierStaffAuthoritative');
  const createHardenAt = route.indexOf('hardenDiscountOverrideRole(merchant, created)', createAt);
  const updateAt = route.indexOf('const updated = await updateCashierStaffAuthoritative');
  const updateHardenAt = route.indexOf('hardenDiscountOverrideRole(merchant, updated)', updateAt);

  assert.ok(createAt >= 0 && createHardenAt > createAt);
  assert.ok(updateAt >= 0 && updateHardenAt > updateAt);
});
