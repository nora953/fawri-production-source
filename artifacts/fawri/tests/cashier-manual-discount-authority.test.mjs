import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cashier consumes the existing server-authoritative per-employee discount policy', async () => {
  const client = await source('src/lib/cashierDiscountPolicyClient.ts');
  assert.match(client, /\/api\/cashier\/operator\/discount-policy/);
  assert.match(client, /cashierOperatorHeaders\(session\)/);
  assert.match(client, /max_percentage_bps/);
  assert.match(client, /max_amount_minor/);
  assert.match(client, /can_approve_override/);
  assert.match(client, /navigator\.onLine === false/);
});

test('manual discount is applied after promotions and preserves separate accounting fields', async () => {
  const discount = await source('src/lib/cashierManualDiscount.ts');
  assert.match(discount, /postPromotionTotal = subtotal - promotionDiscount/);
  assert.match(discount, /finalTotal = postPromotionTotal - manualDiscount/);
  assert.match(discount, /promotion_discount_minor/);
  assert.match(discount, /manual_discount_minor/);
  assert.match(discount, /total_discount_minor/);
  assert.match(discount, /final_total_minor/);
});

test('employee discount authority uses the stricter percentage and absolute amount limits', async () => {
  const client = await source('src/lib/cashierDiscountPolicyClient.ts');
  assert.match(client, /Math\.min\(total, percentageLimit, amountLimit\)/);
  const discount = await source('src/lib/cashierManualDiscount.ts');
  assert.match(discount, /manualDiscount <= employeeLimit/);
});

test('manual discount requires an auditable reason and cannot exceed the post-promotion total', async () => {
  const discount = await source('src/lib/cashierManualDiscount.ts');
  assert.match(discount, /CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED/);
  assert.match(discount, /manualDiscount > postPromotionTotal/);
  assert.match(discount, /reason\.length > 200/);
});

test('manual discount evidence is additive to the durable sale contract', async () => {
  const contracts = await source('src/lib/cashierLocalContracts.ts');
  assert.match(contracts, /promotion_discount_minor\?: number/);
  assert.match(contracts, /manual_discount_minor\?: number/);
  assert.match(contracts, /manual_discount_reason\?: string/);
  assert.match(contracts, /Total discount = promotion discount \+ manual discount/);
});
