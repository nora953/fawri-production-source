import assert from "node:assert/strict";
import test from "node:test";
import { buildCashierCentralReportFromEvidenceRows } from "../src/services/postgresCashierCentralReportAuthority";

function row() {
  return {
    id: "sale-profit-1",
    metadata: {
      cashier_sync: {
        sale_snapshot: {
          source: "cashier",
          status: "completed",
          sale_id: "sale-profit-1",
          operation_id: "operation-sale-1",
          occurred_at: "2026-09-20T10:00:00.000Z",
          currency_code: "IQD",
          currency_fraction_digits: 0,
          total_minor: 35000,
          manual_discount_minor: 0,
          lines: [
            {
              line_id: "line-known",
              product_id: "product-known",
              product_name_snapshot: "Known cost product",
              quantity: 2,
              effective_unit_price_minor: 10000,
              line_total_minor: 20000,
              unit_cost_minor: 6000,
            },
            {
              line_id: "line-unknown",
              product_id: "product-unknown",
              product_name_snapshot: "Unknown cost product",
              quantity: 1,
              effective_unit_price_minor: 15000,
              line_total_minor: 15000,
            },
          ],
        },
        compensations: [
          {
            kind: "return",
            operation_id: "operation-return-1",
            occurred_at: "2026-09-21T10:00:00.000Z",
            snapshot: {
              sale_id: "sale-profit-1",
              currency_code: "IQD",
              currency_fraction_digits: 0,
              refund_total_minor: 10000,
              lines: [
                {
                  original_line_id: "line-known",
                  product_id: "product-known",
                  quantity: 1,
                  effective_unit_price_minor: 10000,
                  refund_minor: 10000,
                },
              ],
            },
          },
        ],
      },
    },
    staff_id: "staff-1",
    staff_name: "Cashier",
    station_id: "station-1",
    station_name: "Main",
    location_id: "location-1",
    location_name: "Main",
    branch_key: null,
    branch_label: null,
  };
}

test("cashier report ranks only products with complete historical cost evidence by profit", () => {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row()],
    generatedAt: "2026-09-21T12:00:00.000Z",
  });
  const currency = result.report.by_currency[0];

  assert.equal(currency.currency_code, "IQD");
  assert.equal(currency.net_revenue_minor, 25000);
  assert.equal(currency.profit_status, "partial");

  const known = currency.top_products.find(product => product.product_id === "product-known");
  const unknown = currency.top_products.find(product => product.product_id === "product-unknown");
  assert.ok(known);
  assert.ok(unknown);

  assert.equal(known.profit_status, "available");
  assert.equal(known.gross_profit_minor, 4000);
  assert.equal(known.net_units, 1);
  assert.equal(known.net_revenue_minor, 10000);

  assert.equal(unknown.profit_status, "unavailable");
  assert.equal(unknown.gross_profit_minor, undefined);

  assert.deepEqual(
    currency.top_profitable_products.map(product => product.product_id),
    ["product-known"],
  );
});

test("return-only range reverses historical profit and never invents selling or profitable rankings", () => {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row()],
    from: "2026-09-21T00:00:00.000Z",
    to: "2026-09-22T00:00:00.000Z",
    generatedAt: "2026-09-21T12:00:00.000Z",
  });
  const currency = result.report.by_currency[0];

  assert.equal(currency.net_revenue_minor, -10000);
  assert.equal(currency.gross_profit_minor, -4000);

  // A return-only period has no positive-selling product, so it must not
  // appear in the "top selling" list. The negative profit also must never
  // be promoted into the "most profitable" ranking.
  assert.equal(currency.top_products.length, 0);
  assert.equal(currency.top_profitable_products.length, 0);
});


test("top-selling products are ranked by net units before revenue", () => {
  const evidence = row();
  evidence.metadata.cashier_sync.sale_snapshot.total_minor = 218800;
  evidence.metadata.cashier_sync.sale_snapshot.lines = [
    {
      line_id: "line-more-units",
      product_id: "product-more-units",
      product_name_snapshot: "More units",
      quantity: 6,
      effective_unit_price_minor: 10000,
      line_total_minor: 60000,
      unit_cost_minor: 5000,
    },
    {
      line_id: "line-more-revenue",
      product_id: "product-more-revenue",
      product_name_snapshot: "More revenue",
      quantity: 4,
      effective_unit_price_minor: 39700,
      line_total_minor: 158800,
      unit_cost_minor: 10000,
    },
  ];
  evidence.metadata.cashier_sync.compensations = [];

  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [evidence],
    generatedAt: "2026-09-21T12:00:00.000Z",
  });
  const currency = result.report.by_currency[0];

  assert.deepEqual(
    currency.top_products.map(product => product.product_id),
    ["product-more-units", "product-more-revenue"],
  );
  assert.equal(currency.top_products[0].net_units, 6);
  assert.equal(currency.top_products[1].net_units, 4);
  assert.ok(
    currency.top_products[0].net_revenue_minor <
      currency.top_products[1].net_revenue_minor,
  );
});
