import {
  cashierOperatorHeaders,
  getCashierOperatorSession,
} from './cashierOperatorSessionRuntime';

export type CashierManualDiscountKind = 'amount' | 'percentage';

export type CashierOperatorDiscountPolicy = {
  enabled: boolean;
  max_percentage_bps: number;
  max_amount_minor: number | null;
  can_approve_override: boolean;
  version: number;
  discount_kind: CashierManualDiscountKind;
};

export const DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY: CashierOperatorDiscountPolicy = {
  enabled: false,
  max_percentage_bps: 0,
  max_amount_minor: null,
  can_approve_override: false,
  version: 0,
  discount_kind: 'amount',
};

export class CashierDiscountPolicyClientError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'CashierDiscountPolicyClientError';
    this.code = code;
    this.status = status;
  }
}

function safeInteger(value: unknown, minimum = 0): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

function parseDiscountKind(value: unknown): CashierManualDiscountKind {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CashierDiscountPolicyClientError(
      'CASHIER_DISCOUNT_SETTING_RESPONSE_INVALID',
      'Cashier discount setting response is invalid',
      502,
    );
  }
  const kind = (value as Record<string, unknown>).discount_kind;
  if (kind === 'amount' || kind === 'percentage') return kind;
  throw new CashierDiscountPolicyClientError(
    'CASHIER_DISCOUNT_SETTING_RESPONSE_INVALID',
    'Cashier discount setting response is invalid',
    502,
  );
}

function parsePolicy(
  value: unknown,
  discountKind: CashierManualDiscountKind,
): CashierOperatorDiscountPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY, discount_kind: discountKind };
  }
  const raw = value as Record<string, unknown>;
  const enabled = raw.enabled === true;
  const percentage = safeInteger(raw.max_percentage_bps);
  const version = safeInteger(raw.version);
  const amount = raw.max_amount_minor === null || raw.max_amount_minor === undefined
    ? null
    : safeInteger(raw.max_amount_minor);
  if (
    percentage === null ||
    percentage > 10_000 ||
    version === null ||
    (raw.max_amount_minor !== null && raw.max_amount_minor !== undefined && amount === null)
  ) {
    throw new CashierDiscountPolicyClientError(
      'CASHIER_DISCOUNT_POLICY_RESPONSE_INVALID',
      'Cashier discount policy response is invalid',
      502,
    );
  }
  if (!enabled) {
    return {
      ...DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY,
      version,
      discount_kind: discountKind,
    };
  }
  return {
    enabled: true,
    max_percentage_bps: percentage,
    max_amount_minor: amount,
    can_approve_override: raw.can_approve_override === true,
    version,
    discount_kind: discountKind,
  };
}

export function cashierDiscountLimitMinor(input: {
  postPromotionTotalMinor: number;
  policy: CashierOperatorDiscountPolicy;
  kind: CashierManualDiscountKind;
}): number {
  const total = safeInteger(input.postPromotionTotalMinor);
  if (total === null || !input.policy.enabled || total === 0) return 0;
  if (input.kind === 'amount') {
    return input.policy.max_amount_minor === null
      ? 0
      : Math.min(total, input.policy.max_amount_minor);
  }
  const percentageLimit = Math.floor((total * input.policy.max_percentage_bps) / 10_000);
  return Math.min(total, percentageLimit);
}

export async function loadCurrentCashierDiscountPolicy(): Promise<CashierOperatorDiscountPolicy> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return DISABLED_CASHIER_OPERATOR_DISCOUNT_POLICY;
  }
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierDiscountPolicyClientError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  const response = await fetch('/api/cashier/operator/discount-policy', {
    headers: cashierOperatorHeaders(session),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true) {
    throw new CashierDiscountPolicyClientError(
      String(payload?.code || 'CASHIER_DISCOUNT_POLICY_LOAD_FAILED'),
      String(payload?.error || 'Could not load cashier discount policy'),
      response.status,
    );
  }
  const discountKind = parseDiscountKind(payload.discount_setting);
  return parsePolicy(payload.discount_policy, discountKind);
}