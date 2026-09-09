import type { CashierOperatorDiscountPolicy } from './cashierDiscountPolicyClient';
import { cashierDiscountLimitMinor } from './cashierDiscountPolicyClient';

export type CashierManualDiscountDraft = {
  kind: 'amount' | 'percentage';
  value: number;
  reason: string;
};

export type CashierManualDiscountResolution = {
  promotion_discount_minor: number;
  post_promotion_total_minor: number;
  manual_discount_minor: number;
  manual_discount_percentage_bps: number;
  total_discount_minor: number;
  final_total_minor: number;
  allowed_without_override: boolean;
  employee_limit_minor: number;
};

export class CashierManualDiscountError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierManualDiscountError';
    this.code = code;
  }
}

function money(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierManualDiscountError(
      'CASHIER_MANUAL_DISCOUNT_INVALID',
      `${field} is invalid`,
    );
  }
  return parsed;
}

function normalizedReason(value: unknown): string {
  const reason = String(value ?? '').normalize('NFKC').trim();
  if (!reason || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason)) {
    throw new CashierManualDiscountError(
      'CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED',
      'A manual discount reason is required',
    );
  }
  return reason;
}

export function resolveCashierManualDiscount(input: {
  subtotalMinor: number;
  promotionDiscountMinor: number;
  draft: CashierManualDiscountDraft | null;
  policy: CashierOperatorDiscountPolicy;
}): CashierManualDiscountResolution {
  const subtotal = money(input.subtotalMinor, 'subtotal_minor');
  const promotionDiscount = money(
    input.promotionDiscountMinor,
    'promotion_discount_minor',
  );
  if (promotionDiscount > subtotal) {
    throw new CashierManualDiscountError(
      'CASHIER_MANUAL_DISCOUNT_INVALID',
      'Promotion discount exceeds subtotal',
    );
  }
  const postPromotionTotal = subtotal - promotionDiscount;
  const employeeLimit = cashierDiscountLimitMinor({
    postPromotionTotalMinor: postPromotionTotal,
    policy: input.policy,
  });

  if (!input.draft) {
    return {
      promotion_discount_minor: promotionDiscount,
      post_promotion_total_minor: postPromotionTotal,
      manual_discount_minor: 0,
      manual_discount_percentage_bps: 0,
      total_discount_minor: promotionDiscount,
      final_total_minor: postPromotionTotal,
      allowed_without_override: true,
      employee_limit_minor: employeeLimit,
    };
  }

  normalizedReason(input.draft.reason);
  const rawValue = money(input.draft.value, 'manual_discount_value');
  let manualDiscount: number;
  let percentageBps: number;
  if (input.draft.kind === 'percentage') {
    if (rawValue > 10_000) {
      throw new CashierManualDiscountError(
        'CASHIER_MANUAL_DISCOUNT_INVALID',
        'Manual discount percentage exceeds 100%',
      );
    }
    percentageBps = rawValue;
    manualDiscount = Math.floor((postPromotionTotal * percentageBps) / 10_000);
  } else {
    manualDiscount = rawValue;
    percentageBps = postPromotionTotal === 0
      ? 0
      : Math.floor((manualDiscount * 10_000) / postPromotionTotal);
  }

  if (
    !Number.isSafeInteger(manualDiscount) ||
    manualDiscount < 0 ||
    manualDiscount > postPromotionTotal
  ) {
    throw new CashierManualDiscountError(
      'CASHIER_MANUAL_DISCOUNT_INVALID',
      'Manual discount exceeds the post-promotion total',
    );
  }
  const totalDiscount = promotionDiscount + manualDiscount;
  const finalTotal = postPromotionTotal - manualDiscount;
  if (!Number.isSafeInteger(totalDiscount) || !Number.isSafeInteger(finalTotal)) {
    throw new CashierManualDiscountError(
      'CASHIER_MANUAL_DISCOUNT_INVALID',
      'Manual discount arithmetic is unsafe',
    );
  }
  return {
    promotion_discount_minor: promotionDiscount,
    post_promotion_total_minor: postPromotionTotal,
    manual_discount_minor: manualDiscount,
    manual_discount_percentage_bps: percentageBps,
    total_discount_minor: totalDiscount,
    final_total_minor: finalTotal,
    allowed_without_override:
      input.policy.enabled && manualDiscount <= employeeLimit,
    employee_limit_minor: employeeLimit,
  };
}
