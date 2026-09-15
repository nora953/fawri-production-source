import {
  cashierOperatorHeaders,
  getCashierOperatorSession,
} from './cashierOperatorSessionRuntime';
import type { CashierManualDiscountKind } from './cashierDiscountPolicyClient';
import { rememberCashierDiscountOverrideOperationBinding } from './cashierDiscountOverrideOperationBinding';

export type CashierDiscountOverrideApprover = {
  id: string;
  display_name: string;
};

export type CashierDiscountOverrideApproval = {
  approval_id: string;
  approver_staff_id: string;
  expires_at: string;
  operation_id: string;
};

export class CashierDiscountOverrideClientError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: string,
    message: string,
    status?: number,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'CashierDiscountOverrideClientError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function identifier(value: unknown): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  return normalized && normalized.length <= 200 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : '';
}

function responseError(
  response: Response,
  payload: Record<string, unknown>,
  fallbackCode: string,
  fallbackMessage: string,
): CashierDiscountOverrideClientError {
  const retry = Number(payload.retry_after_seconds);
  return new CashierDiscountOverrideClientError(
    identifier(payload.code) || fallbackCode,
    String(payload.error || fallbackMessage),
    response.status,
    Number.isSafeInteger(retry) && retry > 0 ? retry : undefined,
  );
}

async function sessionHeaders(): Promise<Record<string, string>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierDiscountOverrideClientError(
      'CASHIER_DISCOUNT_OVERRIDE_ONLINE_REQUIRED',
      'Internet connection is required for manager discount approval',
      0,
    );
  }
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierDiscountOverrideClientError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
      401,
    );
  }
  return cashierOperatorHeaders(session);
}

export async function listCashierDiscountOverrideApprovers(): Promise<
  CashierDiscountOverrideApprover[]
> {
  const response = await fetch('/api/cashier/operator/discount-override/approvers', {
    headers: await sessionHeaders(),
    cache: 'no-store',
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    throw responseError(
      response,
      payload,
      'CASHIER_DISCOUNT_OVERRIDE_APPROVERS_LOAD_FAILED',
      'Could not load eligible discount approvers',
    );
  }
  const raw = Array.isArray(payload.approvers) ? payload.approvers : [];
  return raw.flatMap((value) => {
    const item = record(value);
    const id = identifier(item.id);
    const displayName = identifier(item.display_name);
    return id && displayName ? [{ id, display_name: displayName }] : [];
  });
}

export async function requestCashierDiscountOverrideApproval(input: {
  approverStaffId: string;
  pin: string;
  operationId: string;
  manualDiscountMinor: number;
  discountBaseMinor: number;
  discountKind: CashierManualDiscountKind;
  reason: string;
}): Promise<CashierDiscountOverrideApproval> {
  const response = await fetch('/api/cashier/operator/discount-override', {
    method: 'POST',
    headers: await sessionHeaders(),
    cache: 'no-store',
    body: JSON.stringify({
      approver_staff_id: input.approverStaffId,
      pin: input.pin,
      operation_id: input.operationId,
      manual_discount_minor: input.manualDiscountMinor,
      discount_base_minor: input.discountBaseMinor,
      discount_kind: input.discountKind,
      manual_discount_reason: input.reason.normalize('NFKC').trim(),
    }),
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    throw responseError(
      response,
      payload,
      'CASHIER_DISCOUNT_OVERRIDE_APPROVAL_FAILED',
      'Manager discount approval failed',
    );
  }
  const approval = record(payload.approval);
  const approvalId = identifier(approval.approval_id);
  const approverStaffId = identifier(approval.approver_staff_id);
  const expiresAt = identifier(approval.expires_at);
  const expiresAtMs = new Date(expiresAt).getTime();
  if (
    !approvalId ||
    !approverStaffId ||
    approverStaffId !== input.approverStaffId ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= Date.now()
  ) {
    throw new CashierDiscountOverrideClientError(
      'CASHIER_DISCOUNT_OVERRIDE_RESPONSE_INVALID',
      'Manager discount approval response is invalid',
      502,
    );
  }
  const normalizedExpiresAt = new Date(expiresAtMs).toISOString();
  rememberCashierDiscountOverrideOperationBinding({
    approvalId,
    operationId: input.operationId,
    manualDiscountMinor: input.manualDiscountMinor,
    discountKind: input.discountKind,
    reason: input.reason,
    expiresAt: normalizedExpiresAt,
  });
  return {
    approval_id: approvalId,
    approver_staff_id: approverStaffId,
    expires_at: normalizedExpiresAt,
    operation_id: input.operationId,
  };
}
