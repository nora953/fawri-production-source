import assert from 'node:assert/strict';
import test from 'node:test';

import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts.ts';
import {
  CASHIER_RETURN_REFUND_ALLOCATION_VERSION,
  cashierAdjustedLineRevenueById,
  cashierRemainingRefundMinor,
  cashierReturnRefundMinor,
} from '../src/lib/cashierReturnRefundAllocation.ts';

function sale(input: {
  total: number;
  lines: Array<{ id: string; quantity: number; unitPrice: number }>;
  returns?: CashierSaleSnapshot['returns'];
}): CashierSaleSnapshot {
  const subtotal = input.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  return {
    sale_id: 'sale-refund-allocation',
    operation_id: 'sale-op-refund-allocation',
    local_merchant_id: 'local-merchant',
    cloud_merchant_id: 'cloud-merchant',
    device_id: 'device-1',
    device_sequence: 1,
    source: 'cashier',
    status: 'completed',
    lines: input.lines.map((line, index) => ({
      line_id: line.id,
      product_id: `product-${index + 1}`,
      product_name_snapshot: `Product ${index + 1}`,
      quantity: line.quantity,
      base_unit_price_minor: line.unitPrice,
      effective_unit_price_minor: line.unitPrice,
      discount_minor: 0,
      line_total_minor: line.unitPrice * line.quantity,
    })),
    subtotal_minor: subtotal,
    promotion_discount_minor: 0,
    manual_discount_kind: 'amount',
    manual_discount_minor: subtotal - input.total,
    manual_discount_reason: 'allocation regression',
    discount_minor: subtotal - input.total,
    total_minor: input.total,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    occurred_at: '2026-09-19T10:00:00.000Z',
    ...(input.returns ? { returns: input.returns } : {}),
  };
}

test('v2 refund uses the amount actually charged after a manual discount', () => {
  const discounted = sale({
    total: 37_000,
    lines: [{ id: 'line-1', quantity: 1, unitPrice: 40_000 }],
  });

  assert.equal(
    cashierReturnRefundMinor({
      sale: discounted,
      lineId: 'line-1',
      alreadyReturnedQuantity: 0,
      returnQuantity: 1,
    }),
    37_000,
  );
});

test('v2 cumulative allocation is deterministic when charged revenue does not divide evenly', () => {
  const discounted = sale({
    total: 299,
    lines: [{ id: 'line-1', quantity: 3, unitPrice: 100 }],
  });

  const first = cashierReturnRefundMinor({
    sale: discounted,
    lineId: 'line-1',
    alreadyReturnedQuantity: 0,
    returnQuantity: 1,
  });
  const second = cashierReturnRefundMinor({
    sale: discounted,
    lineId: 'line-1',
    alreadyReturnedQuantity: 1,
    returnQuantity: 1,
  });
  const third = cashierReturnRefundMinor({
    sale: discounted,
    lineId: 'line-1',
    alreadyReturnedQuantity: 2,
    returnQuantity: 1,
  });

  assert.deepEqual([first, second, third], [99, 100, 100]);
  assert.equal(first + second + third, discounted.total_minor);
});

test('manual discount allocation across multiple lines sums exactly to charged sale total', () => {
  const discounted = sale({
    total: 37_000,
    lines: [
      { id: 'line-a', quantity: 1, unitPrice: 30_000 },
      { id: 'line-b', quantity: 1, unitPrice: 10_000 },
    ],
  });
  const adjusted = cashierAdjustedLineRevenueById(discounted);

  assert.equal(adjusted.get('line-a'), 27_750);
  assert.equal(adjusted.get('line-b'), 9_250);
  assert.equal(
    [...adjusted.values()].reduce((sum, value) => sum + value, 0),
    discounted.total_minor,
  );
});

test('remaining refundable value protects v2 after a legacy over-refund', () => {
  const legacyReturn = {
    return_id: 'legacy-return',
    operation_id: 'legacy-return-op',
    sale_id: 'sale-refund-allocation',
    local_merchant_id: 'local-merchant',
    cloud_merchant_id: 'cloud-merchant',
    device_id: 'device-1',
    device_sequence: 2,
    lines: [
      {
        original_line_id: 'line-1',
        product_id: 'product-1',
        quantity: 1,
        effective_unit_price_minor: 20_000,
        refund_minor: 20_000,
      },
    ],
    refund_total_minor: 20_000,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    occurred_at: '2026-09-19T10:05:00.000Z',
  } satisfies NonNullable<CashierSaleSnapshot['returns']>[number];

  const discounted = sale({
    total: 37_000,
    lines: [{ id: 'line-1', quantity: 2, unitPrice: 20_000 }],
    returns: [legacyReturn],
  });

  assert.equal(cashierRemainingRefundMinor(discounted), 17_000);
  const ideal = cashierReturnRefundMinor({
    sale: discounted,
    lineId: 'line-1',
    alreadyReturnedQuantity: 1,
    returnQuantity: 1,
  });
  assert.equal(ideal, 18_500);
  assert.equal(Math.min(ideal, cashierRemainingRefundMinor(discounted)), 17_000);
  assert.equal(CASHIER_RETURN_REFUND_ALLOCATION_VERSION, 2);
});
