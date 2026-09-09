export type CashierManualDiscountPolicy = {
  enabled: boolean;
  max_percentage_bps: number;
  max_amount_minor: number | null;
  can_approve_override: boolean;
};

export const DISABLED_CASHIER_MANUAL_DISCOUNT_POLICY: CashierManualDiscountPolicy = {
  enabled: false,
  max_percentage_bps: 0,
  max_amount_minor: null,
  can_approve_override: false,
};

export class CashierDiscountPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierDiscountPolicyError';
    this.code = code;
  }
}

function safeInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new CashierDiscountPolicyError(
      'CASHIER_DISCOUNT_POLICY_INVALID',
      `${field} is invalid`,
    );
  }
  return number;
}

export function normalizeCashierManualDiscountPolicy(
  value: unknown,
): CashierManualDiscountPolicy {
  if (value === undefined || value === null) {
    return { ...DISABLED_CASHIER_MANUAL_DISCOUNT_POLICY };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CashierDiscountPolicyError(
      'CASHIER_DISCOUNT_POLICY_INVALID',
      'cashier discount policy must be an object',
    );
  }
  const input = value as Record<string, unknown>;
  const enabled = input.enabled === true;
  const maxPercentageBps = safeInteger(
    input.max_percentage_bps ?? 0,
    'max_percentage_bps',
    0,
    10_000,
  );
  const maxAmountMinor =
    input.max_amount_minor === undefined || input.max_amount_minor === null || input.max_amount_minor === ''
      ? null
      : safeInteger(input.max_amount_minor, 'max_amount_minor', 0, Number.MAX_SAFE_INTEGER);
  const canApproveOverride = input.can_approve_override === true;

  if (!enabled) {
    return { ...DISABLED_CASHIER_MANUAL_DISCOUNT_POLICY };
  }
  return {
    enabled: true,
    max_percentage_bps: maxPercentageBps,
    max_amount_minor: maxAmountMinor,
    can_approve_override: canApproveOverride,
  };
}

export function cashierManualDiscountLimitMinor(input: {
  postPromotionTotalMinor: number;
  policy: CashierManualDiscountPolicy;
}): number {
  const total = safeInteger(
    input.postPromotionTotalMinor,
    'post_promotion_total_minor',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (!input.policy.enabled || total === 0) return 0;

  const percentageLimit = Math.floor(
    (total * input.policy.max_percentage_bps) / 10_000,
  );
  if (!Number.isSafeInteger(percentageLimit) || percentageLimit < 0) {
    throw new CashierDiscountPolicyError(
      'CASHIER_DISCOUNT_POLICY_INVALID',
      'cashier percentage discount limit is invalid',
    );
  }

  const amountLimit = input.policy.max_amount_minor;
  return amountLimit === null
    ? Math.min(total, percentageLimit)
    : Math.min(total, percentageLimit, amountLimit);
}

export function cashierManualDiscountWithinPolicy(input: {
  postPromotionTotalMinor: number;
  manualDiscountMinor: number;
  policy: CashierManualDiscountPolicy;
}): boolean {
  const discount = safeInteger(
    input.manualDiscountMinor,
    'manual_discount_minor',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  return discount <= cashierManualDiscountLimitMinor({
    postPromotionTotalMinor: input.postPromotionTotalMinor,
    policy: input.policy,
  });
}
