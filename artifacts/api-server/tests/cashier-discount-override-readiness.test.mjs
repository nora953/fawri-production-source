import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CASHIER_DISCOUNT_OVERRIDE_COLUMNS,
  CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS,
  CASHIER_DISCOUNT_POLICY_COLUMNS,
  evaluateCashierDiscountOverrideReadiness,
} from '../../../lib/db/scripts/lib/cashier-discount-override-readiness.mjs';

function readyFacts() {
  return {
    migration_recorded: true,
    permission_constraint_supports_discount: true,
    policy_table_present: true,
    override_table_present: true,
    policy_columns: [...CASHIER_DISCOUNT_POLICY_COLUMNS],
    override_columns: [...CASHIER_DISCOUNT_OVERRIDE_COLUMNS],
    constraint_names: [...CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS],
  };
}

test('canonical cashier discount override schema is ready only when every authority fact is present', () => {
  const result = evaluateCashierDiscountOverrideReadiness(readyFacts());
  assert.equal(result.ok, true);
  assert.equal(result.migration_recorded, true);
  assert.equal(result.staff_permission_constraint_supports_discount, true);
  assert.equal(result.required_constraints_ready, true);
});

test('manually created tables without canonical 0015 migration history fail readiness', () => {
  const result = evaluateCashierDiscountOverrideReadiness({
    ...readyFacts(),
    migration_recorded: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.migration_recorded, false);
});

test('legacy cashier permission constraint without manual discount grants fails readiness', () => {
  const result = evaluateCashierDiscountOverrideReadiness({
    ...readyFacts(),
    permission_constraint_supports_discount: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.staff_permission_constraint_supports_discount, false);
});

test('missing approval evidence column fails closed', () => {
  const facts = readyFacts();
  facts.override_columns = facts.override_columns.filter(value => value !== 'operation_id');
  const result = evaluateCashierDiscountOverrideReadiness(facts);
  assert.equal(result.ok, false);
  assert.equal(result.override_required_columns_ready, false);
});

test('missing tenant-bound approval constraint fails closed', () => {
  const facts = readyFacts();
  facts.constraint_names = facts.constraint_names.filter(
    value => value !== 'cashier_discount_override_approver_merchant_fk',
  );
  const result = evaluateCashierDiscountOverrideReadiness(facts);
  assert.equal(result.ok, false);
  assert.equal(result.required_constraints_ready, false);
});
