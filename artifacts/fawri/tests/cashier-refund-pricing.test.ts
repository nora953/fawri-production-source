import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASHIER_REFUND_PRICING_VERSION,
  cashierAdjustedLineRevenueById,
  cashierNetReturnRefundMinor,
} from '../src/lib/cashierRefundPricing.ts';

function sale(input: {
  manualDiscount: number;
  lines: Array<{ id: string; quantity: number; unitPrice: number }>;
}) {
  const preDiscount = input.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  return {
    total_minor: preDiscount - input.manualDiscount,
    manual_discount_minor: input.manualDiscount,
    lines: input.lines.map(line => ({
      line_id: line.id,
      product_id: line.id,
      product_name_snapshot: line.id,
      quantity: line.quantity,
      base_unit_price_minor: line.unitPrice,
      effective_unit_price_minor: line.unitPrice,
      discount_minor: 0,
      line_total_minor: line.quantity * line.unitPrice,
    })),
  };
}

test('cashier refund pricing v2 allocates a sale-level discount across lines exactly', () => {
  assert.equal(CASHIER_REFUND_PRICING_VERSION, 2);
  const value = sale({
    manualDiscount: 3_000,
    lines: [
      { id: 'a', quantity: 1, unitPrice: 30_000 },
      { id: 'b', quantity: 1, unitPrice: 10_000 },
    ],
  });
  assert.deepEqual(
    [...cashierAdjustedLineRevenueById(value).entries()],
    [
      ['a', 27_750],
      ['b', 9_250],
    ],
  );
});

test('repeated partial returns sum exactly to the discounted line value', () => {
  const value = sale({
    manualDiscount: 1,
    lines: [{ id: 'line', quantity: 3, unitPrice: 1_000 }],
  });
  const first = cashierNetReturnRefundMinor(value, 'line', 0, 0, 1);
  const second = cashierNetReturnRefundMinor(value, 'line', 1, 0, 1);
  const third = cashierNetReturnRefundMinor(value, 'line', 2, 0, 1);
  assert.deepEqual([first, second, third], [999, 1_000, 1_000]);
  assert.equal(first + second + third, 2_999);
});

test('one-line discounted return never refunds more than the customer paid', () => {
  const value = sale({
    manualDiscount: 3_000,
    lines: [{ id: 'line', quantity: 1, unitPrice: 40_000 }],
  });
  assert.equal(cashierNetReturnRefundMinor(value, 'line', 0, 0, 1), 37_000);
});


test('v2 refund pricing caps a new return after a legacy over-refund', () => {
  const value = sale({
    manualDiscount: 3_000,
    lines: [{ id: 'line', quantity: 2, unitPrice: 20_000 }],
  });
  assert.equal(
    cashierNetReturnRefundMinor(value, 'line', 1, 20_000, 1),
    17_000,
  );
});
