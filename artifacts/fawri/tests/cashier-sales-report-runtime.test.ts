import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCashierSalesReport } from '../src/lib/cashierSalesReportRuntime.ts';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts.ts';

type SaleLineInput = {
  lineId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  variantId?: string;
  variantName?: string;
};

function sale(input: {
  id: string;
  occurredAt: string;
  lines: SaleLineInput[];
  currency?: string;
  fractionDigits?: number;
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
      ...(line.variantId ? { variant_id: line.variantId } : {}),
      product_name_snapshot: line.productName,
      ...(line.variantName ? { variant_name_snapshot: line.variantName } : {}),
      quantity: line.quantity,
      base_unit_price_minor: line.unitPrice,
      effective_unit_price_minor: line.unitPrice,
      discount_minor: 0,
      line_total_minor: line.unitPrice * line.quantity,
      ...(line.unitCost !== undefined ? { unit_cost_minor: line.unitCost } : {}),
    })) as CashierSaleSnapshot['lines'],
    subtotal_minor: subtotal,
    discount_minor: 0,
    total_minor: subtotal,
    currency_code: input.currency || 'IQD',
    currency_fraction_digits: input.fractionDigits ?? 0,
    payment_method: 'cash',
    payment_status: 'paid',
    occurred_at: input.occurredAt,
  };
}

test('sales report derives revenue, units and profit from immutable sale evidence', () => {
  const report = buildCashierSalesReport([
    sale({
      id: 'one',
      occurredAt: '2026-08-25T09:00:00.000Z',
      lines: [
        {
          lineId: 'line-1',
          productId: 'coffee',
          productName: 'Coffee',
          quantity: 2,
          unitPrice: 10_000,
          unitCost: 6_000,
        },
      ],
    }),
  ]);

  assert.equal(report.sale_count, 1);
  assert.equal(report.by_currency.length, 1);
  const iq = report.by_currency[0];
  assert.equal(iq.currency_code, 'IQD');
  assert.equal(iq.gross_revenue_minor, 20_000);
  assert.equal(iq.refunds_minor, 0);
  assert.equal(iq.net_revenue_minor, 20_000);
  assert.equal(iq.sold_units, 2);
  assert.equal(iq.returned_units, 0);
  assert.equal(iq.net_units, 2);
  assert.equal(iq.average_ticket_minor, 20_000);
  assert.equal(iq.profit_status, 'available');
  assert.equal(iq.gross_profit_minor, 8_000);
  assert.equal(iq.cost_known_net_units, 2);
  assert.equal(iq.cost_unknown_net_units, 0);
  assert.deepEqual(iq.top_products[0], {
    product_id: 'coffee',
    product_name: 'Coffee',
    net_units: 2,
    net_revenue_minor: 20_000,
  });
});

test('partial return reduces net revenue, units and profit at original sale values', () => {
  const original = sale({
    id: 'returnable',
    occurredAt: '2026-08-25T10:00:00.000Z',
    lines: [
      {
        lineId: 'line-returnable',
        productId: 'shirt',
        productName: 'Shirt',
        quantity: 2,
        unitPrice: 15_000,
        unitCost: 9_000,
      },
    ],
  });
  original.returns = [
    {
      return_id: 'return-1',
      operation_id: 'return-op-1',
      sale_id: original.sale_id,
      local_merchant_id: original.local_merchant_id,
      cloud_merchant_id: original.cloud_merchant_id,
      device_id: original.device_id,
      device_sequence: 2,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      lines: [
        {
          original_line_id: 'line-returnable',
          product_id: 'shirt',
          quantity: 1,
          effective_unit_price_minor: 15_000,
          refund_minor: 15_000,
        },
      ],
      refund_total_minor: 15_000,
      occurred_at: '2026-08-25T10:15:00.000Z',
    },
  ];

  const iq = buildCashierSalesReport([original]).by_currency[0];
  assert.equal(iq.return_count, 1);
  assert.equal(iq.gross_revenue_minor, 30_000);
  assert.equal(iq.refunds_minor, 15_000);
  assert.equal(iq.net_revenue_minor, 15_000);
  assert.equal(iq.sold_units, 2);
  assert.equal(iq.returned_units, 1);
  assert.equal(iq.net_units, 1);
  assert.equal(iq.gross_profit_minor, 6_000);
  assert.equal(iq.top_products[0].net_units, 1);
  assert.equal(iq.top_products[0].net_revenue_minor, 15_000);
});

test('voided sale is retained as evidence but contributes zero net revenue and units', () => {
  const voided = sale({
    id: 'voided',
    occurredAt: '2026-08-25T11:00:00.000Z',
    lines: [
      {
        lineId: 'line-void',
        productId: 'headphones',
        productName: 'Headphones',
        quantity: 1,
        unitPrice: 40_000,
        unitCost: 25_000,
      },
    ],
  });
  voided.status = 'voided';
  voided.void = {
    operation_id: 'void-op',
    sale_id: voided.sale_id,
    device_id: voided.device_id,
    device_sequence: 2,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    refund_total_minor: 40_000,
    occurred_at: '2026-08-25T11:05:00.000Z',
  };

  const iq = buildCashierSalesReport([voided]).by_currency[0];
  assert.equal(iq.sale_count, 1);
  assert.equal(iq.active_sale_count, 0);
  assert.equal(iq.voided_sale_count, 1);
  assert.equal(iq.gross_revenue_minor, 40_000);
  assert.equal(iq.refunds_minor, 40_000);
  assert.equal(iq.net_revenue_minor, 0);
  assert.equal(iq.sold_units, 1);
  assert.equal(iq.returned_units, 1);
  assert.equal(iq.net_units, 0);
  assert.equal(iq.gross_profit_minor, 0);
  assert.equal(iq.top_products.length, 0);
});

test('reports never merge currencies', () => {
  const report = buildCashierSalesReport([
    sale({
      id: 'iqd',
      occurredAt: '2026-08-25T08:00:00.000Z',
      lines: [
        {
          lineId: 'iqd-line',
          productId: 'p1',
          productName: 'P1',
          quantity: 1,
          unitPrice: 10_000,
        },
      ],
    }),
    sale({
      id: 'usd',
      occurredAt: '2026-08-25T09:00:00.000Z',
      currency: 'USD',
      fractionDigits: 2,
      lines: [
        {
          lineId: 'usd-line',
          productId: 'p2',
          productName: 'P2',
          quantity: 1,
          unitPrice: 2_500,
          unitCost: 1_000,
        },
      ],
    }),
  ]);

  assert.equal(report.by_currency.length, 2);
  assert.deepEqual(
    report.by_currency.map(item => item.currency_code),
    ['IQD', 'USD'],
  );
  assert.equal(report.by_currency.find(item => item.currency_code === 'IQD')?.net_revenue_minor, 10_000);
  assert.equal(report.by_currency.find(item => item.currency_code === 'USD')?.net_revenue_minor, 2_500);
});

test('profit is partial or unavailable when sale-time cost evidence is missing', () => {
  const partial = buildCashierSalesReport([
    sale({
      id: 'partial-cost',
      occurredAt: '2026-08-25T12:00:00.000Z',
      lines: [
        {
          lineId: 'known',
          productId: 'known-product',
          productName: 'Known',
          quantity: 1,
          unitPrice: 10_000,
          unitCost: 7_000,
        },
        {
          lineId: 'unknown',
          productId: 'unknown-product',
          productName: 'Unknown',
          quantity: 2,
          unitPrice: 5_000,
        },
      ],
    }),
  ]).by_currency[0];

  assert.equal(partial.profit_status, 'partial');
  assert.equal(partial.gross_profit_minor, 3_000);
  assert.equal(partial.cost_known_net_units, 1);
  assert.equal(partial.cost_unknown_net_units, 2);

  const unavailable = buildCashierSalesReport([
    sale({
      id: 'no-cost',
      occurredAt: '2026-08-25T13:00:00.000Z',
      lines: [
        {
          lineId: 'none',
          productId: 'none',
          productName: 'No cost',
          quantity: 1,
          unitPrice: 8_000,
        },
      ],
    }),
  ]).by_currency[0];

  assert.equal(unavailable.profit_status, 'unavailable');
  assert.equal(unavailable.gross_profit_minor, undefined);
  assert.equal(unavailable.cost_known_net_units, 0);
  assert.equal(unavailable.cost_unknown_net_units, 1);
});

test('date range is [from, to) and excludes sales outside the requested period', () => {
  const sales = [
    sale({
      id: 'before',
      occurredAt: '2026-08-24T23:59:59.000Z',
      lines: [{ lineId: 'a', productId: 'a', productName: 'A', quantity: 1, unitPrice: 1 }],
    }),
    sale({
      id: 'inside',
      occurredAt: '2026-08-25T00:00:00.000Z',
      lines: [{ lineId: 'b', productId: 'b', productName: 'B', quantity: 1, unitPrice: 2 }],
    }),
    sale({
      id: 'at-end',
      occurredAt: '2026-08-26T00:00:00.000Z',
      lines: [{ lineId: 'c', productId: 'c', productName: 'C', quantity: 1, unitPrice: 3 }],
    }),
  ];

  const report = buildCashierSalesReport(sales, {
    from: '2026-08-25T00:00:00.000Z',
    to: '2026-08-26T00:00:00.000Z',
  });
  assert.equal(report.sale_count, 1);
  assert.equal(report.by_currency[0].net_revenue_minor, 2);
});

test('corrupt over-return evidence fails closed instead of producing negative reports', () => {
  const corrupt = sale({
    id: 'corrupt',
    occurredAt: '2026-08-25T14:00:00.000Z',
    lines: [
      {
        lineId: 'corrupt-line',
        productId: 'p',
        productName: 'P',
        quantity: 1,
        unitPrice: 10,
      },
    ],
  });
  corrupt.returns = [
    {
      return_id: 'r',
      operation_id: 'r-op',
      sale_id: corrupt.sale_id,
      local_merchant_id: corrupt.local_merchant_id,
      device_id: corrupt.device_id,
      device_sequence: 2,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      lines: [
        {
          original_line_id: 'corrupt-line',
          product_id: 'p',
          quantity: 2,
          effective_unit_price_minor: 10,
          refund_minor: 10,
        },
      ],
      refund_total_minor: 10,
      occurred_at: '2026-08-25T14:05:00.000Z',
    },
  ];

  assert.throws(
    () => buildCashierSalesReport([corrupt]),
    /CASHIER_REPORT_RETURN_EXCEEDS_SALE/,
  );
});
