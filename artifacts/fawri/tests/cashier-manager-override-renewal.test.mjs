import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = async (relative) => readFile(new URL(relative, root), 'utf8');

test('manager approval renewal rotates only after the backend reports an operation conflict', async () => {
  const hook = await source('src/lib/useCashierManualDiscountCheckout.ts');
  assert.match(hook, /CASHIER_DISCOUNT_OVERRIDE_OPERATION_CONFLICT/);
  assert.match(hook, /requestForOperation\(input\.operationId\)/);
  assert.match(hook, /requestForOperation\(newOverrideOperationId\(\)\)/);
  assert.match(
    hook,
    /if \(errorCode\(error\) !== 'CASHIER_DISCOUNT_OVERRIDE_OPERATION_CONFLICT'\) \{\s*throw error;/,
  );
  assert.doesNotMatch(hook, /catch \{[\s\S]{0,120}newOverrideOperationId/);
});

test('approval client records the exact server-approved operation binding in memory only', async () => {
  const client = await source('src/lib/cashierDiscountOverrideClient.ts');
  assert.match(client, /rememberCashierDiscountOverrideOperationBinding\(/);
  assert.match(client, /operationId: input\.operationId/);
  assert.match(client, /manualDiscountMinor: input\.manualDiscountMinor/);
  assert.match(client, /reason: input\.reason/);
  assert.match(client, /operation_id: input\.operationId/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB/);
});

test('operator runtime validates a live approval binding before any over-limit local write', async () => {
  const runtime = await source('src/lib/cashierOperatorPosRuntime.ts');
  assert.match(runtime, /resolveCashierDiscountOverrideSaleInput\(input\)/);
  assert.match(runtime, /assertOfflineInventoryPermission\(base, effectiveInput, currentSession\)/);
  assert.match(runtime, /assertManualDiscountPermission\(base, effectiveInput\)/);
  assert.match(runtime, /bindCashierOperationToCurrentOperator\(effectiveInput\.operation_id, 'sale'\)/);
  assert.match(runtime, /base\.commitSale\(effectiveInput\)/);
  assert.match(
    runtime,
    /discount > limit && !input\.manual_discount_override_approval_id/,
  );
});

test('operation binding is amount reason and expiry bound and is forgotten only after local commit', async () => {
  const binding = await source('src/lib/cashierDiscountOverrideOperationBinding.ts');
  const runtime = await source('src/lib/cashierOperatorPosRuntime.ts');
  assert.match(binding, /amount !== binding\.manualDiscountMinor/);
  assert.match(binding, /normalizedReason !== binding\.reason/);
  assert.match(binding, /CASHIER_DISCOUNT_OVERRIDE_EXPIRED/);
  assert.match(binding, /operation_id: binding\.operationId/);
  assert.match(runtime, /const result = await base\.commitSale\(effectiveInput\);/);
  assert.match(runtime, /forgetCashierDiscountOverrideOperationBinding\(/);
});
