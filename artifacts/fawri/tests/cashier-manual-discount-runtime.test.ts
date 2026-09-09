import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CashierManualDiscountError,
  resolveCashierManualDiscount,
} from '../src/lib/cashierManualDiscount.ts';
import type { CashierOperatorDiscountPolicy } from '../src/lib/cashierDiscountPolicyClient.ts';

function policy(
  overrides: Partial<CashierOperatorDiscountPolicy> = {},
): CashierOperatorDiscountPolicy {
  return {
    enabled: true,
    max_percentage_bps: 2_000,
    max_amount_minor: null,
    can_approve_override: false,
    version: 1,
    ...overrides,
  };
}

function expectDiscountError(
  operation: () => unknown,
  code: 'CASHIER_MANUAL_DISCOUNT_INVALID' | 'CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED',
): void {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof CashierManualDiscountError);
    assert.equal(error.code, code);
    return true;
  });
}

test('amount discount is applied after promotion and preserves exact accounting totals', () => {
  const result = resolveCashierManualDiscount({
    subtotalMinor: 10_000,
    promotionDiscountMinor: 1_000,
    draft: {
      kind: 'amount',
      value: 1_500,
      reason: 'Loyal customer',
    },
    policy: policy(),
  });

  assert.deepEqual(result, {
    promotion_discount_minor: 1_000,
    post_promotion_total_minor: 9_000,
    manual_discount_minor: 1_500,
    manual_discount_percentage_bps: 1_666,
    total_discount_minor: 2_500,
    final_total_minor: 7_500,
    allowed_without_override: true,
    employee_limit_minor: 1_800,
  });
});

test('percentage discount uses the post-promotion total and floors fractional minor units', () => {
  const result = resolveCashierManualDiscount({
    subtotalMinor: 12_001,
    promotionDiscountMinor: 2_000,
    draft: {
      kind: 'percentage',
      value: 2_500,
      reason: 'Campaign adjustment',
    },
    policy: policy({ max_percentage_bps: 3_000 }),
  });

  assert.equal(result.post_promotion_total_minor, 10_001);
  assert.equal(result.manual_discount_minor, 2_500);
  assert.equal(result.manual_discount_percentage_bps, 2_500);
  assert.equal(result.total_discount_minor, 4_500);
  assert.equal(result.final_total_minor, 7_501);
  assert.equal(result.employee_limit_minor, 3_000);
  assert.equal(result.allowed_without_override, true);
});

test('employee authority uses the stricter percentage and fixed amount cap at the exact boundary', () => {
  const cappedPolicy = policy({
    max_percentage_bps: 5_000,
    max_amount_minor: 1_200,
  });

  const atLimit = resolveCashierManualDiscount({
    subtotalMinor: 10_000,
    promotionDiscountMinor: 0,
    draft: { kind: 'amount', value: 1_200, reason: 'Approved staff discount' },
    policy: cappedPolicy,
  });
  assert.equal(atLimit.employee_limit_minor, 1_200);
  assert.equal(atLimit.allowed_without_override, true);

  const overLimit = resolveCashierManualDiscount({
    subtotalMinor: 10_000,
    promotionDiscountMinor: 0,
    draft: { kind: 'amount', value: 1_201, reason: 'Needs manager approval' },
    policy: cappedPolicy,
  });
  assert.equal(overLimit.employee_limit_minor, 1_200);
  assert.equal(overLimit.allowed_without_override, false);
});

test('disabled policy fails closed for any non-zero manual discount', () => {
  const result = resolveCashierManualDiscount({
    subtotalMinor: 5_000,
    promotionDiscountMinor: 500,
    draft: { kind: 'amount', value: 1, reason: 'Test discount' },
    policy: policy({
      enabled: false,
      max_percentage_bps: 10_000,
      max_amount_minor: null,
      can_approve_override: true,
    }),
  });

  assert.equal(result.employee_limit_minor, 0);
  assert.equal(result.allowed_without_override, false);
  assert.equal(result.final_total_minor, 4_499);
});

test('no manual discount remains valid even when discount authority is disabled', () => {
  const result = resolveCashierManualDiscount({
    subtotalMinor: 5_000,
    promotionDiscountMinor: 500,
    draft: null,
    policy: policy({ enabled: false }),
  });

  assert.equal(result.manual_discount_minor, 0);
  assert.equal(result.total_discount_minor, 500);
  assert.equal(result.final_total_minor, 4_500);
  assert.equal(result.allowed_without_override, true);
});

test('invalid totals, percentages and reasons fail closed with stable error codes', () => {
  expectDiscountError(
    () => resolveCashierManualDiscount({
      subtotalMinor: 1_000,
      promotionDiscountMinor: 1_001,
      draft: null,
      policy: policy(),
    }),
    'CASHIER_MANUAL_DISCOUNT_INVALID',
  );

  expectDiscountError(
    () => resolveCashierManualDiscount({
      subtotalMinor: 1_000,
      promotionDiscountMinor: 100,
      draft: { kind: 'amount', value: 901, reason: 'Too large' },
      policy: policy({ max_percentage_bps: 10_000 }),
    }),
    'CASHIER_MANUAL_DISCOUNT_INVALID',
  );

  expectDiscountError(
    () => resolveCashierManualDiscount({
      subtotalMinor: 1_000,
      promotionDiscountMinor: 0,
      draft: { kind: 'percentage', value: 10_001, reason: 'Too high' },
      policy: policy({ max_percentage_bps: 10_000 }),
    }),
    'CASHIER_MANUAL_DISCOUNT_INVALID',
  );

  for (const reason of ['', '   ', 'bad\u0000reason', 'x'.repeat(201)]) {
    expectDiscountError(
      () => resolveCashierManualDiscount({
        subtotalMinor: 1_000,
        promotionDiscountMinor: 0,
        draft: { kind: 'amount', value: 1, reason },
        policy: policy(),
      }),
      'CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED',
    );
  }

  expectDiscountError(
    () => resolveCashierManualDiscount({
      subtotalMinor: -1,
      promotionDiscountMinor: 0,
      draft: null,
      policy: policy(),
    }),
    'CASHIER_MANUAL_DISCOUNT_INVALID',
  );
});
