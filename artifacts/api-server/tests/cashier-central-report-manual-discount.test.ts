import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCashierCentralReportFromEvidenceRows,
  type CashierCentralReportEvidenceRow,
} from '../src/services/postgresCashierCentralReportAuthority.ts';

type TestLine = {
  lineId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

function discountedRow(input: {
  id: string;
  manualDiscount: number;
  lines: TestLine[];
  compensations?: unknown[];
}): CashierCentralReportEvidenceRow {
  const preDiscountTotal = input.lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  return {
    id: input.id,
    metadata: {
      cashier_sync: {
        sale_snapshot: {
          sale_id: input.id,
          operation_id: `op:${input.id}`,
          source: 'cashier',
          status: 'completed',
          occurred_at: '2026-09-14T00:00:00.000Z',
          currency_code: 'IQD',
          currency_fraction_digits: 0,
          manual_discount_kind: 'amount',
          manual_discount_minor: input.manualDiscount,
          manual_discount_reason: 'report regression test',
          total_minor: preDiscountTotal - input.manualDiscount,
          lines: input.lines.map(line => ({
            line_id: line.lineId,
            product_id: line.productId,
            product_name_snapshot: line.productName,
            quantity: line.quantity,
            effective_unit_price_minor: line.unitPrice,
            line_total_minor: line.unitPrice * line.quantity,
            unit_cost_minor: line.unitCost,
          })),
        },
        compensations: input.compensations || [],
      },
    },
    staff_id: 'staff-1',
    staff_name: 'Cashier Test',
    station_id: 'station-1',
    station_name: 'Main Cashier',
    branch_key: null,
    branch_label: null,
  };
}

function currencyReport(row: CashierCentralReportEvidenceRow) {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row],
    generatedAt: '2026-09-14T01:00:00.000Z',
  });
  assert.equal(result.report.by_currency.length, 1);
  return { result, iq: result.report.by_currency[0] };
}

test('central report accepts a synced sale with manual discount and reports charged revenue', () => {
  const row = discountedRow({
    id: 'sale-discounted-one-line',
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

  const { result, iq } = currencyReport(row);
  assert.equal(iq.gross_revenue_minor, 37_000);
  assert.equal(iq.net_revenue_minor, 37_000);
  assert.equal(iq.gross_profit_minor, 17_000);
  assert.deepEqual(iq.top_products[0], {
    product_id: 'product-1',
    product_name: 'Product 1',
    net_units: 1,
    net_revenue_minor: 37_000,
  });
  assert.equal(result.by_staff[0].report.by_currency[0].net_revenue_minor, 37_000);
  assert.equal(result.by_station[0].report.by_currency[0].net_revenue_minor, 37_000);
});

test('central report allocates manual discount deterministically across product revenue', () => {
  const row = discountedRow({
    id: 'sale-discounted-multi-line',
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

  const { iq } = currencyReport(row);
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

test('central report void reverses manually discounted product revenue exactly', () => {
  const row = discountedRow({
    id: 'sale-discounted-void',
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
    compensations: [
      {
        kind: 'void',
        operation_id: 'void-op',
        occurred_at: '2026-09-14T00:05:00.000Z',
        snapshot: {
          sale_id: 'sale-discounted-void',
          currency_code: 'IQD',
          currency_fraction_digits: 0,
          refund_total_minor: 37_000,
        },
      },
    ],
  });

  const { iq } = currencyReport(row);
  assert.equal(iq.gross_revenue_minor, 37_000);
  assert.equal(iq.refunds_minor, 37_000);
  assert.equal(iq.net_revenue_minor, 0);
  assert.equal(iq.gross_profit_minor, 0);
  assert.equal(iq.top_products.length, 0);
});

test('central report still fails closed when manual discount and final total disagree', () => {
  const row = discountedRow({
    id: 'sale-discounted-corrupt',
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
  const metadata = row.metadata as Record<string, any>;
  metadata.cashier_sync.sale_snapshot.total_minor = 37_001;

  assert.throws(
    () => buildCashierCentralReportFromEvidenceRows({ rows: [row] }),
    /cashier sale total does not match line and manual discount evidence/,
  );
});
