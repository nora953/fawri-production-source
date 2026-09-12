import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCashierSalesReport } from '../src/lib/cashierSalesReportRuntime.ts';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts.ts';
import {
  allocateCashierSaleNetByLine,
  cashierRefundForAllocatedLine,
} from '../src/lib/cashierSaleAccounting.ts';

function discountedSale(): CashierSaleSnapshot {
  return {
    sale_id: 'sale:discounted',
    operation_id: 'discounted',
    local_merchant_id: 'merchant-local',
    cloud_merchant_id: 'merchant-cloud',
    device_id: 'device-1',
    device_sequence: 1,
    source: 'cashier',
    status: 'completed',
    lines: [
      {
        line_id: 'line-a',
        product_id: 'a',
        product_name_snapshot: 'A',
        quantity: 2,
        base_unit_price_minor: 10_000,
        effective_unit_price_minor: 10_000,
        discount_minor: 0,
        line_total_minor: 20_000,
        unit_cost_minor: 6_000,
      },
      {
        line_id: 'line-b',
        product_id: 'b',
        product_name_snapshot: 'B',
        quantity: 1,
        base_unit_price_minor: 15_000,
        effective_unit_price_minor: 15_000,
        discount_minor: 0,
        line_total_minor: 15_000,
        unit_cost_minor: 8_000,
      },
    ],
    subtotal_minor: 35_000,
    promotion_discount_minor: 0,
    manual_discount_minor: 5_000,
    discount_minor: 5_000,
    total_minor: 30_000,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    occurred_at: '2026-09-10T01:53:24.727Z',
  };
}

test('offline report accepts valid manual discount and allocates product revenue to exact paid total', () => {
  const report = buildCashierSalesReport([discountedSale()]);
  const iqd = report.by_currency[0];
  assert.equal(iqd.gross_revenue_minor, 30_000);
  assert.equal(iqd.net_revenue_minor, 30_000);
  assert.equal(
    iqd.top_products.reduce((sum, product) => sum + product.net_revenue_minor, 0),
    30_000,
  );
  assert.equal(iqd.gross_profit_minor, 10_000);
});

test('offline report validates partial return against the discounted paid allocation', () => {
  const sale = discountedSale();
  const allocation = allocateCashierSaleNetByLine(sale.lines, sale.total_minor)[0];
  const refund = cashierRefundForAllocatedLine({
    allocatedNetMinor: allocation.allocated_net_minor,
    soldQuantity: 2,
    returnedBeforeQuantity: 0,
    returnQuantity: 1,
  });
  assert.equal(refund, 8_571);
  sale.returns = [
    {
      return_id: 'return-1',
      operation_id: 'return-op-1',
      sale_id: sale.sale_id,
      local_merchant_id: sale.local_merchant_id,
      cloud_merchant_id: sale.cloud_merchant_id,
      device_id: sale.device_id,
      device_sequence: 2,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      lines: [
        {
          original_line_id: 'line-a',
          product_id: 'a',
          quantity: 1,
          effective_unit_price_minor: 10_000,
          refund_minor: refund,
        },
      ],
      refund_total_minor: refund,
      occurred_at: '2026-09-10T02:00:00.000Z',
    },
  ];

  const iqd = buildCashierSalesReport([sale]).by_currency[0];
  assert.equal(iqd.refunds_minor, 8_571);
  assert.equal(iqd.net_revenue_minor, 21_429);
  assert.equal(iqd.returned_units, 1);
});

test('discounted void reverses exactly the paid sale total and product allocation', () => {
  const sale = discountedSale();
  sale.status = 'voided';
  sale.void = {
    operation_id: 'void-op',
    sale_id: sale.sale_id,
    device_id: sale.device_id,
    device_sequence: 2,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    refund_total_minor: 30_000,
    occurred_at: '2026-09-10T02:00:00.000Z',
  };

  const iqd = buildCashierSalesReport([sale]).by_currency[0];
  assert.equal(iqd.gross_revenue_minor, 30_000);
  assert.equal(iqd.refunds_minor, 30_000);
  assert.equal(iqd.net_revenue_minor, 0);
  assert.equal(iqd.net_units, 0);
  assert.equal(iqd.gross_profit_minor, 0);
  assert.equal(iqd.top_products.length, 0);
});
