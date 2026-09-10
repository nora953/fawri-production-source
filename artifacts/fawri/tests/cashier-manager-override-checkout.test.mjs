import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = async (relative) => readFile(new URL(relative, root), 'utf8');

test('manager override client uses operator-authenticated online routes and never stores PIN', async () => {
  const client = await source('src/lib/cashierDiscountOverrideClient.ts');
  assert.match(client, /cashierOperatorHeaders\(session\)/);
  assert.match(client, /\/api\/cashier\/operator\/discount-override\/approvers/);
  assert.match(client, /\/api\/cashier\/operator\/discount-override/);
  assert.match(client, /approver_staff_id: input\.approverStaffId/);
  assert.match(client, /pin: input\.pin/);
  assert.match(client, /operation_id: input\.operationId/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB/);
});

test('checkout reserves an initial operation id and carries manager proof into the sale draft', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');
  assert.match(page, /const \[checkoutOperationId, setCheckoutOperationId\] = useState<string \| null>\(null\)/);
  assert.match(page, /setCheckoutOperationId\(newSaleOperationId\(\)\)/);
  assert.match(page, /operationId: checkoutOperationId/);
  assert.match(page, /operation_id: checkoutOperationId/);
  assert.match(page, /manual_discount_override_approval_id:[\s\S]*discountCheckout\.overrideApproval\.approval_id/);
  assert.doesNotMatch(page, /const operationId =[\s\S]{0,160}crypto\.randomUUID\(\)/);
});

test('renewed approval can replace the durable sale operation id without mutating the checkout page draft', async () => {
  const hook = await source('src/lib/useCashierManualDiscountCheckout.ts');
  const runtime = await source('src/lib/cashierOperatorPosRuntime.ts');
  assert.match(hook, /CASHIER_DISCOUNT_OVERRIDE_OPERATION_CONFLICT/);
  assert.match(hook, /requestForOperation\(newOverrideOperationId\(\)\)/);
  assert.match(runtime, /resolveCashierDiscountOverrideSaleInput\(input\)/);
  assert.match(runtime, /base\.commitSale\(effectiveInput\)/);
});

test('manager proof is invalidated with checkout binding changes and PIN is never retained', async () => {
  const hook = await source('src/lib/useCashierManualDiscountCheckout.ts');
  assert.match(hook, /clearOverride\(true\);[\s\S]*input\.operationId, quoteBinding/);
  assert.match(hook, /setKind:[\s\S]*clearOverride\(\)/);
  assert.match(hook, /setValueText:[\s\S]*clearOverride\(\)/);
  assert.match(hook, /setReason:[\s\S]*clearOverride\(\)/);
  assert.match(hook, /Never retain a manager PIN/);
  assert.match(hook, /setOverridePinState\(''\)/);
  assert.match(hook, /resolution\.allowed_without_override \|\| overrideApproved/);
});

test('checkout shows PIN-backed manager approval only when override is needed', async () => {
  const modal = await source('src/components/cashier/CashierCheckoutModal.tsx');
  const editor = await source('src/components/cashier/CashierDiscountOverrideEditor.tsx');
  assert.match(modal, /<CashierDiscountOverrideEditor/);
  assert.match(modal, /needed=\{overrideNeeded\}/);
  assert.match(editor, /if \(!needed\) return null/);
  assert.match(editor, /type="password"/);
  assert.match(editor, /autoComplete="off"/);
  assert.match(editor, /approvers\.length === 0/);
  assert.match(editor, /onApprove/);
});

test('override approval proof is part of the durable sale and outbox payload', async () => {
  const contracts = await source('src/lib/cashierLocalContracts.ts');
  const indexedDb = await source('src/lib/cashierIndexedDbAuthority.ts');
  assert.match(contracts, /manual_discount_override_approval_id\?: string/);
  assert.match(indexedDb, /manualDiscountOverrideApprovalId/);
  assert.match(indexedDb, /manual_discount_override_approval_id:[\s\S]*manualDiscountOverrideApprovalId/);
  assert.match(indexedDb, /payload: sale/);
});

test('manager approval copy exists for Arabic Kurdish and English checkout UX', async () => {
  const copy = await source('src/lib/cashierPosEnhancementCopy.ts');
  assert.equal((copy.match(/managerApprovalTitle:/g) || []).length, 3);
  assert.equal((copy.match(/managerApprovalInvalidPin:/g) || []).length, 3);
  assert.equal((copy.match(/managerApprovalNoApprovers:/g) || []).length, 3);
});
