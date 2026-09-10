import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CashierDiscountOverrideOperationBindingError,
  forgetCashierDiscountOverrideOperationBinding,
  rememberCashierDiscountOverrideOperationBinding,
  resolveCashierDiscountOverrideSaleInput,
} from '../src/lib/cashierDiscountOverrideOperationBinding';

function saleInput(approvalId: string) {
  return {
    operation_id: 'checkout-operation-old',
    payment_method: 'cash' as const,
    payment_status: 'paid' as const,
    manual_discount_minor: 5390,
    manual_discount_reason: 'اختبار خصم 11%',
    manual_discount_override_approval_id: approvalId,
    cash_tendered_minor: 43610,
    change_due_minor: 0,
    lines: [{ product_id: 'product-1', quantity: 1 }],
  };
}

test('renewed manager approval replaces the durable sale operation id only through its live binding', () => {
  const approvalId = 'approval-renewed-1';
  rememberCashierDiscountOverrideOperationBinding({
    approvalId,
    operationId: 'checkout-operation-renewed',
    manualDiscountMinor: 5390,
    reason: 'اختبار خصم 11%',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const resolved = resolveCashierDiscountOverrideSaleInput(saleInput(approvalId));
  assert.equal(resolved.operation_id, 'checkout-operation-renewed');
  assert.equal(resolved.manual_discount_override_approval_id, approvalId);

  forgetCashierDiscountOverrideOperationBinding(approvalId);
  assert.throws(
    () => resolveCashierDiscountOverrideSaleInput(saleInput(approvalId)),
    (error: unknown) =>
      error instanceof CashierDiscountOverrideOperationBindingError &&
      error.code === 'CASHIER_DISCOUNT_OVERRIDE_INVALID',
  );
});

test('approval binding cannot be reused for a different amount or reason', () => {
  const approvalId = 'approval-binding-mismatch';
  rememberCashierDiscountOverrideOperationBinding({
    approvalId,
    operationId: 'operation-bound',
    manualDiscountMinor: 5390,
    reason: 'اختبار خصم 11%',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  assert.throws(
    () => resolveCashierDiscountOverrideSaleInput({
      ...saleInput(approvalId),
      manual_discount_minor: 5400,
    }),
    (error: unknown) =>
      error instanceof CashierDiscountOverrideOperationBindingError &&
      error.code === 'CASHIER_DISCOUNT_OVERRIDE_INVALID',
  );
  assert.throws(
    () => resolveCashierDiscountOverrideSaleInput({
      ...saleInput(approvalId),
      manual_discount_reason: 'different reason',
    }),
    (error: unknown) =>
      error instanceof CashierDiscountOverrideOperationBindingError &&
      error.code === 'CASHIER_DISCOUNT_OVERRIDE_INVALID',
  );
  forgetCashierDiscountOverrideOperationBinding(approvalId);
});

test('expired or fabricated approval proof cannot unlock a local over-limit sale binding', () => {
  assert.throws(
    () => rememberCashierDiscountOverrideOperationBinding({
      approvalId: 'approval-expired',
      operationId: 'operation-expired',
      manualDiscountMinor: 5390,
      reason: 'اختبار خصم 11%',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    }),
    (error: unknown) =>
      error instanceof CashierDiscountOverrideOperationBindingError &&
      error.code === 'CASHIER_DISCOUNT_OVERRIDE_EXPIRED',
  );

  assert.throws(
    () => resolveCashierDiscountOverrideSaleInput(saleInput('fabricated-approval')),
    (error: unknown) =>
      error instanceof CashierDiscountOverrideOperationBindingError &&
      error.code === 'CASHIER_DISCOUNT_OVERRIDE_INVALID',
  );
});
