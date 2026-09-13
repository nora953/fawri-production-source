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

test('enabled policy normalizes percentage, required amount and override capability', () => {
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

test('enabled policy requires explicit percentage and a positive monetary ceiling', () => {
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

test('runtime limit uses post-promotion total and the stricter percentage or amount cap', () => {
  const percentageCapped = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 2_500,
    max_amount_minor: 9_999,
  });
  assert.equal(
    cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: 10_001,
      policy: percentageCapped,
    }),
    2_500,
  );

  const amountCapped = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 5_000,
    max_amount_minor: 1_200,
  });
  assert.equal(
    cashierManualDiscountLimitMinor({
      postPromotionTotalMinor: 10_000,
      policy: amountCapped,
    }),
    1_200,
  );
});

test('policy boundary accepts the exact employee limit and rejects one minor unit above it', () => {
  const policy = normalizeCashierManualDiscountPolicy({
    enabled: true,
    max_percentage_bps: 5_000,
    max_amount_minor: 1_200,
  });

  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 1_200,
      policy,
    }),
    true,
  );
  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 1_201,
      policy,
    }),
    false,
  );
});

test('disabled policy permits no positive manual discount', () => {
  const policy = normalizeCashierManualDiscountPolicy(null);

  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 0,
      policy,
    }),
    true,
  );
  assert.equal(
    cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 10_000,
      manualDiscountMinor: 1,
      policy,
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
    }),
    () => cashierManualDiscountWithinPolicy({
      postPromotionTotalMinor: 1_000,
      manualDiscountMinor: -1,
      policy: validPolicy,
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
