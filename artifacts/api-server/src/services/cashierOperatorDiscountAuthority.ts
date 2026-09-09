import {
  cashierManualDiscountLimitMinor,
} from './cashierDiscountPolicy';
import {
  disabledStoredCashierDiscountPolicy,
  loadCashierDiscountPolicies,
} from './cashierDiscountPolicyAuthority';
import { consumeCashierDiscountOverrideApproval } from './cashierDiscountOverrideAuthority';
import type { CashierOperatorContext } from './postgresCashierStaffAuthority';
import { CashierSyncError } from './postgresCashierSyncAuthority';
import { withMerchantOperationalTransaction } from './operationalPostgresAuthority';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeNonNegative(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_DISCOUNT_INVALID',
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return parsed;
}

function identifier(value: unknown, field: string): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_DISCOUNT_INVALID',
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function instant(value: unknown, field: string): string {
  const normalized = identifier(value, field);
  const millis = new Date(normalized).getTime();
  if (!Number.isFinite(millis)) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_DISCOUNT_INVALID',
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return new Date(millis).toISOString();
}

function saleEnvelope(body: unknown): {
  operationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
} {
  const raw = record(body);
  if (!Array.isArray(raw.envelopes)) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_DISCOUNT_INVALID',
      'cashier sync envelopes are required',
      400,
    );
  }
  const sales = raw.envelopes
    .map(record)
    .filter((envelope) => envelope.entity_type === 'sale' && envelope.operation === 'append');
  if (sales.length !== 1) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_DISCOUNT_INVALID',
      'cashier sale envelope is required',
      400,
    );
  }
  const envelope = sales[0];
  return {
    operationId: identifier(envelope.operation_id, 'sale.operation_id'),
    occurredAt: instant(envelope.occurred_at, 'sale.occurred_at'),
    payload: record(envelope.payload),
  };
}

function postPromotionTotal(payload: Record<string, unknown>): number {
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_DISCOUNT_INVALID',
      'cashier sale lines are required',
      400,
    );
  }
  let total = 0;
  for (const value of payload.lines) {
    const line = record(value);
    const lineTotal = safeNonNegative(line.line_total_minor, 'line.line_total_minor');
    total += lineTotal;
    if (!Number.isSafeInteger(total)) {
      throw new CashierSyncError(
        'CASHIER_OPERATOR_DISCOUNT_INVALID',
        'cashier sale total overflow',
        400,
      );
    }
  }
  return total;
}

export async function assertCashierOperatorManualDiscountAuthority(input: {
  context: CashierOperatorContext;
  body: unknown;
}): Promise<void> {
  const sale = saleEnvelope(input.body);
  const payload = sale.payload;
  const manualDiscount = payload.manual_discount_minor === undefined
    ? 0
    : safeNonNegative(payload.manual_discount_minor, 'sale.manual_discount_minor');
  if (manualDiscount === 0) return;

  if (!input.context.permissions.includes('sale.discount')) {
    throw new CashierSyncError(
      'CASHIER_MANUAL_DISCOUNT_PERMISSION_REQUIRED',
      'cashier operator is not allowed to apply manual discounts',
      403,
    );
  }

  const reason = String(payload.manual_discount_reason || '').normalize('NFKC').trim();
  if (!reason || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason)) {
    throw new CashierSyncError(
      'CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED',
      'manual discount reason is required',
      409,
    );
  }

  const postPromotion = postPromotionTotal(payload);
  await withMerchantOperationalTransaction(
    input.context.merchant_id,
    async (client) => {
      const policies = await loadCashierDiscountPolicies(
        client,
        input.context.merchant_id,
        input.context.staff_id,
      );
      const policy = policies.get(input.context.staff_id) || disabledStoredCashierDiscountPolicy();

      if (!policy.enabled) {
        throw new CashierSyncError(
          'CASHIER_MANUAL_DISCOUNT_PERMISSION_REQUIRED',
          'manual discount policy is disabled for this operator',
          403,
        );
      }
      const limit = cashierManualDiscountLimitMinor({
        postPromotionTotalMinor: postPromotion,
        policy,
      });
      if (manualDiscount <= limit) return;

      const rawApprovalId = String(payload.manual_discount_override_approval_id ?? '').trim();
      if (!rawApprovalId) {
        throw new CashierSyncError(
          'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED',
          'manual discount exceeds this operator limit and requires manager approval',
          403,
          {
            requested_discount_minor: manualDiscount,
            employee_limit_minor: limit,
          },
        );
      }
      const approvalId = identifier(
        rawApprovalId,
        'sale.manual_discount_override_approval_id',
      );
      await consumeCashierDiscountOverrideApproval(client, {
        merchantId: input.context.merchant_id,
        stationId: input.context.station_id,
        operatorStaffId: input.context.staff_id,
        operationId: sale.operationId,
        saleOccurredAt: sale.occurredAt,
        approvalId,
        manualDiscountMinor: manualDiscount,
        reason,
      });
    },
  );
}
