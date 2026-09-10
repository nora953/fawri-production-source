import type { CashierCommitSaleInput } from './cashierLocalContracts';

export type CashierDiscountOverrideOperationBinding = {
  approvalId: string;
  operationId: string;
  manualDiscountMinor: number;
  reason: string;
  expiresAt: string;
};

export class CashierDiscountOverrideOperationBindingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierDiscountOverrideOperationBindingError';
    this.code = code;
  }
}

const bindings = new Map<string, CashierDiscountOverrideOperationBinding>();

function identifier(value: unknown, label: string): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CashierDiscountOverrideOperationBindingError(
      'CASHIER_DISCOUNT_OVERRIDE_BINDING_INVALID',
      `${label} is invalid`,
    );
  }
  return normalized;
}

function reason(value: unknown): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CashierDiscountOverrideOperationBindingError(
      'CASHIER_DISCOUNT_OVERRIDE_BINDING_INVALID',
      'manual discount reason is invalid',
    );
  }
  return normalized;
}

function positiveMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new CashierDiscountOverrideOperationBindingError(
      'CASHIER_DISCOUNT_OVERRIDE_BINDING_INVALID',
      'manual discount amount is invalid',
    );
  }
  return amount;
}

export function rememberCashierDiscountOverrideOperationBinding(input: {
  approvalId: string;
  operationId: string;
  manualDiscountMinor: number;
  reason: string;
  expiresAt: string;
}): CashierDiscountOverrideOperationBinding {
  const expiresAtMs = new Date(input.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new CashierDiscountOverrideOperationBindingError(
      'CASHIER_DISCOUNT_OVERRIDE_EXPIRED',
      'manager discount approval has expired',
    );
  }
  const binding: CashierDiscountOverrideOperationBinding = {
    approvalId: identifier(input.approvalId, 'approval id'),
    operationId: identifier(input.operationId, 'operation id'),
    manualDiscountMinor: positiveMoney(input.manualDiscountMinor),
    reason: reason(input.reason),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  bindings.set(binding.approvalId, binding);
  return binding;
}

export function resolveCashierDiscountOverrideSaleInput(
  input: CashierCommitSaleInput,
): CashierCommitSaleInput {
  const approvalId = input.manual_discount_override_approval_id;
  if (!approvalId) return input;

  const key = identifier(approvalId, 'approval id');
  const binding = bindings.get(key);
  if (!binding) {
    throw new CashierDiscountOverrideOperationBindingError(
      'CASHIER_DISCOUNT_OVERRIDE_INVALID',
      'manager discount approval is not bound to this live checkout',
    );
  }

  if (new Date(binding.expiresAt).getTime() <= Date.now()) {
    bindings.delete(key);
    throw new CashierDiscountOverrideOperationBindingError(
      'CASHIER_DISCOUNT_OVERRIDE_EXPIRED',
      'manager discount approval has expired',
    );
  }

  const amount = Number(input.manual_discount_minor || 0);
  const normalizedReason = reason(input.manual_discount_reason);
  if (
    amount !== binding.manualDiscountMinor ||
    normalizedReason !== binding.reason
  ) {
    throw new CashierDiscountOverrideOperationBindingError(
      'CASHIER_DISCOUNT_OVERRIDE_INVALID',
      'manager discount approval does not match this sale',
    );
  }

  return {
    ...input,
    operation_id: binding.operationId,
  };
}

export function forgetCashierDiscountOverrideOperationBinding(
  approvalId: string | undefined,
): void {
  if (!approvalId) return;
  bindings.delete(String(approvalId).normalize('NFKC').trim());
}
