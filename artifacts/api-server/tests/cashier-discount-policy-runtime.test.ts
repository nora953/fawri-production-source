import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CashierDiscountPolicyError,
  cashierManualDiscountLimitMinor,
  cashierManualDiscountWithinPolicy,
  normalizeCashierManualDiscountPolicy,
  restrictCashierManualDiscountPolicyForRole,
} from '../src/services/cashierDiscountPolicy.ts';

test('disabled or missing policy normalizes to a fail-closed authority', () => {
  assert.deepEqual(normalizeCashierManualDiscountPolicy(undefined), {
    enabled: false,
    max_percentage_bps: 0,
    max_amount_minor: null,
    can_approve_override: false,
  });

  assert.deepEqual(
    normalizeCashierManualDiscountPolicy({
      enabled: false,
      max_percentage_bps: 10_000,
      max_amount_minor: 50_000,
      can_approve_override: true,
    }),
    {
      enabled: false,
      max_percentage_bps: 0,
      max_amount_minor: null,
      can_approve_override: false,
    },
  );
});

test('enabled policy normalizes independent percentage and amount authority', () => {
  assert.deepEqual(
    normalizeCashierManualDiscountPolicy({
      enabled: true,
      max_percentage_bps: 2_500,
      max_amount_minor: 1_500,
      can_approve_override: true,
    }),
    {
      enabled: true,
      max_percentage_bps: 2_500,
      max_amount_minor: 1_500,
      can_approve_override: true,
    },
  );
});

test('enabled policy requires explicit percentage and a positive monetary limit', () => {
  for (const maxPercentageBps of [undefined, null, '', '   ']) {
    assert.throws(
      () => normalizeCashierManualDiscountPolicy({
        enabled: true,
        max_percentage_bps: maxPercentageBps,
        max_amount_minor: 1_000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CashierDiscountPolicyError);
        assert.equal(error.code, 'CASHIER_DISCOUNT_POLICY_INVALID');
        return true;
      },
    );
  }

  for (const maxAmountMinor of [undefined, null, '', '   ', 0]) {
    assert.throws(
      () => normalizeCashierManualDiscountPolicy({
        enabled: true,
        max_percentage_bps: 1_000,
        max_amount_minor: maxAmountMinor,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CashierDiscountPolicyError);
        assert.equal(error.code, 'CASHIER_DISCOUNT_POLICY_INVALID');
        return true;
      },
    );
  }

  assert.deepEqual(
    normalizeCashierManualDiscountPolicy({
      enabled: true,
      max_percentage_bps: 0,
      max_amount_minor: 1_000,
    }),
    {
      enabled: true,
      max_percentage_bps: 0,
      max_amount_minor: 1_000,
      can_approve_override: false,
    },
  );
});

test('override approval capability is preserved only for managers', () => {
  const policy = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 1_000,
    max_amount_minor: 4_000,
    can_approve_override: true,
  });

  assert.equal(
    restrictCashierManualDiscountPolicyForRole(policy, 'manager').can_approve_override,
    true,
  );
  assert.equal(
    restrictCashierManualDiscountPolicyForRole(policy, 'cashier').can_approve_override,
    false,
  );
  assert.equal(
    restrictCashierManualDiscountPolicyForRole(policy, 'unexpected-role').can_approve_override,
    false,
  );
});

test('runtime applies only the selected discount type limit', () => {
  const policy = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 500,
    max_amount_minor: 2_000,
  });

  assert.equal(
    cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: 10_000,
      policy,
      kind: 'amount',
    }),
    2_000,
    'a 2,000 fixed discount is valid even though it equals 20% of this small sale',
  );
  assert.equal(
    cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: 10_000,
      policy,
      kind: 'percentage',
    }),
    500,
    'a percentage discount remains capped at 5% independently of the fixed amount limit',
  );

  assert.equal(
    cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: 300_000,
      policy,
      kind: 'percentage',
    }),
    15_000,
    '5% of a large sale is allowed even when it exceeds the fixed 2,000 amount limit',
  );
  assert.equal(
    cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: 300_000,
      policy,
      kind: 'amount',
    }),
    2_000,
  );
});

test('policy boundaries are independent for amount and percentage discounts', () => {
  const policy = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 500,
    max_amount_minor: 2_000,
  });

  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 2_000,
      policy,
      kind: 'amount',
    }),
    true,
  );
  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 2_001,
      policy,
      kind: 'amount',
    }),
    false,
  );
  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 500,
      policy,
      kind: 'percentage',
    }),
    true,
  );
  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 501,
      policy,
      kind: 'percentage',
    }),
    false,
  );
});

test('legacy kind-less durable evidence stays conservative', () => {
  const policy = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 500,
    max_amount_minor: 2_000,
  });
  assert.equal(
    cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: 10_000,
      policy,
    }),
    500,
  );
});

test('disabled policy permits no positive manual discount', () => {
  const policy = normalizeCashierManualDiscountPolicy(null);

  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 0,
      policy,
      kind: 'amount',
    }),
    true,
  );
  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 1,
      policy,
      kind: 'amount',
    }),
    false,
  );
});

test('invalid policy and money inputs fail closed with stable policy error code', () => {
  const validPolicy = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 1_000,
    max_amount_minor: 1_000,
  });
  const invalidInputs = [
    () => normalizeCashierManualDiscountPolicy({
      enabled: true,
      max_percentage_bps: 10_001,
      max_amount_minor: 1_000,
    }),
    () => normalizeCashierManualDiscountPolicy({
      enabled: true,
      max_percentage_bps: 1_000,
      max_amount_minor: -1,
    }),
    () => cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: -1,
      policy: validPolicy,
      kind: 'amount' as const,
    }),
    () => cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 1_000,
      manualDiscountMinor: -1,
      policy: validPolicy,
      kind: 'percentage' as const,
    }),
  ];

  for (const operation of invalidInputs) {
    assert.throws(operation, (error: unknown) => {
      assert.ok(error instanceof CashierDiscountPolicyError);
      assert.equal(error.code, 'CASHIER_DISCOUNT_POLICY_INVALID');
      return true;
    });
  }
});
