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
  stationId?: string;
  stationName?: string;
  locationId?: string;
  locationName?: string;
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
    station_id: input.stationId || 'station-1',
    station_name: input.stationName || 'Main Cashier',
    location_id: input.locationId || 'location-1',
    location_name: input.locationName || 'Main Location',
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
  assert.equal(result.by_location[0].location_id, 'location-1');
  assert.equal(result.by_location[0].report.by_currency[0].net_revenue_minor, 37_000);
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


test('central report groups multiple cashier stations under the same canonical location', () => {
  const first = discountedRow({
    id: 'sale-location-station-a',
    manualDiscount: 0,
    stationId: 'station-a',
    stationName: 'Front Counter',
    locationId: 'location-main',
    locationName: 'Main Branch',
    lines: [
      {
        lineId: 'line-location-a',
        productId: 'product-location-a',
        productName: 'Product A',
        quantity: 1,
        unitPrice: 10_000,
        unitCost: 4_000,
      },
    ],
  });
  const second = discountedRow({
    id: 'sale-location-station-b',
    manualDiscount: 0,
    stationId: 'station-b',
    stationName: 'Back Counter',
    locationId: 'location-main',
    locationName: 'Main Branch',
    lines: [
      {
        lineId: 'line-location-b',
        productId: 'product-location-b',
        productName: 'Product B',
        quantity: 1,
        unitPrice: 20_000,
        unitCost: 8_000,
      },
    ],
  });

  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [first, second],
    generatedAt: '2026-09-14T01:00:00.000Z',
  });

  assert.equal(result.by_station.length, 2);
  assert.equal(result.by_location.length, 1);
  assert.equal(result.by_location[0].location_id, 'location-main');
  assert.equal(result.by_location[0].location_name, 'Main Branch');
  assert.equal(result.by_location[0].report.sale_count, 2);
  assert.equal(
    result.by_location[0].report.by_currency[0].net_revenue_minor,
    30_000,
  );
});


test('central report applies v2 partial return against net discounted sale value', () => {
  const row = discountedRow({
    id: 'sale-discounted-return-v2',
    manualDiscount: 3_000,
    lines: [
      {
        lineId: 'line-return-v2',
        productId: 'product-return-v2',
        productName: 'Product Return V2',
        quantity: 2,
        unitPrice: 20_000,
        unitCost: 10_000,
      },
    ],
    compensations: [
      {
        kind: 'return',
        operation_id: 'return-v2-op',
        occurred_at: '2026-09-14T00:05:00.000Z',
        snapshot: {
          refund_pricing_version: 2,
          sale_id: 'sale-discounted-return-v2',
          currency_code: 'IQD',
          currency_fraction_digits: 0,
          refund_total_minor: 18_500,
          lines: [
            {
              original_line_id: 'line-return-v2',
              product_id: 'product-return-v2',
              quantity: 1,
              effective_unit_price_minor: 20_000,
              refund_minor: 18_500,
            },
          ],
        },
      },
    ],
  });

  const { iq } = currencyReport(row);
  assert.equal(iq.gross_revenue_minor, 37_000);
  assert.equal(iq.refunds_minor, 18_500);
  assert.equal(iq.net_revenue_minor, 18_500);
  assert.equal(iq.net_units, 1);
  assert.equal(iq.gross_profit_minor, 8_500);
});

test('central report keeps legacy pre-v2 discounted return evidence readable', () => {
  const row = discountedRow({
    id: 'sale-discounted-return-legacy',
    manualDiscount: 3_000,
    lines: [
      {
        lineId: 'line-return-legacy',
        productId: 'product-return-legacy',
        productName: 'Product Return Legacy',
        quantity: 2,
        unitPrice: 20_000,
        unitCost: 10_000,
      },
    ],
    compensations: [
      {
        kind: 'return',
        operation_id: 'return-legacy-op',
        occurred_at: '2026-09-14T00:05:00.000Z',
        snapshot: {
          sale_id: 'sale-discounted-return-legacy',
          currency_code: 'IQD',
          currency_fraction_digits: 0,
          refund_total_minor: 20_000,
          lines: [
            {
              original_line_id: 'line-return-legacy',
              product_id: 'product-return-legacy',
              quantity: 1,
              effective_unit_price_minor: 20_000,
              refund_minor: 20_000,
            },
          ],
        },
      },
    ],
  });

  const { iq } = currencyReport(row);
  assert.equal(iq.refunds_minor, 20_000);
  assert.equal(iq.net_revenue_minor, 17_000);
});
