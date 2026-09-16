import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCashierSalesReport } from '../src/lib/cashierSalesReportRuntime.ts';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts.ts';

type TestLine = {
  lineId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

function discountedSale(input: {
  id: string;
  manualDiscount: number;
  lines: TestLine[];
}): CashierSaleSnapshot {
  const subtotal = input.lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  return {
    sale_id: `sale:${input.id}`,
    operation_id: input.id,
    local_merchant_id: 'merchant-local',
    cloud_merchant_id: 'merchant-cloud',
    device_id: 'device-1',
    device_sequence: 1,
    source: 'cashier',
    status: 'completed',
    lines: input.lines.map(line => ({
      line_id: line.lineId,
      product_id: line.productId,
      product_name_snapshot: line.productName,
      quantity: line.quantity,
      base_unit_price_minor: line.unitPrice,
      effective_unit_price_minor: line.unitPrice,
      discount_minor: 0,
      line_total_minor: line.unitPrice * line.quantity,
      unit_cost_minor: line.unitCost,
    })) as CashierSaleSnapshot['lines'],
    subtotal_minor: subtotal,
    promotion_discount_minor: 0,
    manual_discount_kind: 'amount',
    manual_discount_minor: input.manualDiscount,
    manual_discount_reason: 'report regression test',
    discount_minor: input.manualDiscount,
    total_minor: subtotal - input.manualDiscount,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    occurred_at: '2026-09-14T00:00:00.000Z',
  };
}

test('local report accepts a valid manual discount and attributes charged revenue and profit', () => {
  const sale = discountedSale({
    id: 'discounted-one-line',
    manualDiscount: 3_000,
    lines: [
      {
        lineId: 'line-1',
        productId: 'product-1',
        productName: 'Product 1',
        quantity: 1,
        unitPrice: 40_000,
        unitCost: 20_000,
      },
    ],
  });

  const iq = buildCashierSalesReport([sale]).by_currency[0];
  assert.equal(iq.gross_revenue_minor, 37_000);
  assert.equal(iq.net_revenue_minor, 37_000);
  assert.equal(iq.gross_profit_minor, 17_000);
  assert.deepEqual(iq.top_products[0], {
    product_id: 'product-1',
    product_name: 'Product 1',
    net_units: 1,
    net_revenue_minor: 37_000,
  });
});

test('local report allocates a manual discount deterministically across multiple products', () => {
  const sale = discountedSale({
    id: 'discounted-multi-line',
    manualDiscount: 3_000,
    lines: [
      {
        lineId: 'line-a',
        productId: 'product-a',
        productName: 'Product A',
        quantity: 1,
        unitPrice: 30_000,
        unitCost: 10_000,
      },
      {
        lineId: 'line-b',
        productId: 'product-b',
        productName: 'Product B',
        quantity: 1,
        unitPrice: 10_000,
        unitCost: 5_000,
      },
    ],
  });

  const iq = buildCashierSalesReport([sale]).by_currency[0];
  assert.equal(iq.gross_revenue_minor, 37_000);
  assert.equal(iq.gross_profit_minor, 22_000);
  assert.deepEqual(
    iq.top_products.map(item => [item.product_id, item.net_revenue_minor]),
    [
      ['product-a', 27_750],
      ['product-b', 9_250],
    ],
  );
  assert.equal(
    iq.top_products.reduce((sum, item) => sum + item.net_revenue_minor, 0),
    iq.gross_revenue_minor,
  );
});

test('voiding a manually discounted sale reverses adjusted product revenue exactly', () => {
  const sale = discountedSale({
    id: 'discounted-void',
    manualDiscount: 3_000,
    lines: [
      {
        lineId: 'line-void',
        productId: 'product-void',
        productName: 'Product Void',
        quantity: 1,
        unitPrice: 40_000,
        unitCost: 20_000,
      },
    ],
  });
  sale.status = 'voided';
  sale.void = {
    operation_id: 'void-op',
    sale_id: sale.sale_id,
    device_id: sale.device_id,
    device_sequence: 2,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    refund_total_minor: 37_000,
    occurred_at: '2026-09-14T00:05:00.000Z',
  };

  const iq = buildCashierSalesReport([sale]).by_currency[0];
  assert.equal(iq.gross_revenue_minor, 37_000);
  assert.equal(iq.refunds_minor, 37_000);
  assert.equal(iq.net_revenue_minor, 0);
  assert.equal(iq.gross_profit_minor, 0);
  assert.equal(iq.top_products.length, 0);
});

test('local report still fails closed when manual discount and sale total do not reconcile', () => {
  const sale = discountedSale({
    id: 'discounted-corrupt',
    manualDiscount: 3_000,
    lines: [
      {
        lineId: 'line-corrupt',
        productId: 'product-corrupt',
        productName: 'Product Corrupt',
        quantity: 1,
        unitPrice: 40_000,
        unitCost: 20_000,
      },
    ],
  });
  sale.total_minor = 37_001;

  assert.throws(
    () => buildCashierSalesReport([sale]),
    /CASHIER_REPORT_INVALID_SALE_TOTAL/,
  );
});
