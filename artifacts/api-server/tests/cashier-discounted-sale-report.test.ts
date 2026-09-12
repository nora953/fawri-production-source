import assert from "node:assert/strict";
import test from "node:test";

import { buildCashierCentralReportFromEvidenceRows } from "../src/services/postgresCashierCentralReportAuthority";
import {
  allocateCashierSaleNetByLine,
  cashierRefundForAllocatedLine,
} from "../src/services/cashierSaleAccounting";

function row(compensations: unknown[] = []) {
  const sale = {
    sale_id: "sale:discounted",
    operation_id: "discounted",
    local_merchant_id: "merchant-local",
    cloud_merchant_id: "merchant-cloud",
    device_id: "device-1",
    device_sequence: 1,
    source: "cashier",
    status: "completed",
    lines: [
      {
        line_id: "line-a",
        product_id: "a",
        product_name_snapshot: "A",
        quantity: 2,
        base_unit_price_minor: 10_000,
        effective_unit_price_minor: 10_000,
        discount_minor: 0,
        line_total_minor: 20_000,
        unit_cost_minor: 6_000,
      },
      {
        line_id: "line-b",
        product_id: "b",
        product_name_snapshot: "B",
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
    currency_code: "IQD",
    currency_fraction_digits: 0,
    payment_method: "cash",
    payment_status: "paid",
    occurred_at: "2026-09-10T01:53:24.727Z",
  };
  return {
    id: sale.sale_id,
    metadata: { cashier_sync: { sale_snapshot: sale, compensations } },
    staff_id: "staff-1",
    staff_name: "Cashier Test",
    station_id: "station-1",
    station_name: "Station",
    branch_key: null,
    branch_label: null,
    sale,
  };
}

test("central report accepts a valid manual-discount sale instead of returning evidence 409", () => {
  const evidence = row();
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [evidence],
    generatedAt: "2026-09-12T00:00:00.000Z",
  });
  const iqd = result.report.by_currency[0];
  assert.equal(result.sales_scanned, 1);
  assert.equal(iqd.gross_revenue_minor, 30_000);
  assert.equal(iqd.net_revenue_minor, 30_000);
  assert.equal(
    iqd.top_products.reduce((sum, product) => sum + product.net_revenue_minor, 0),
    30_000,
  );
  assert.equal(iqd.gross_profit_minor, 10_000);
});

test("central report accepts discount-aware partial return evidence", () => {
  const evidence = row();
  const allocation = allocateCashierSaleNetByLine(evidence.sale.lines, evidence.sale.total_minor)[0];
  const refund = cashierRefundForAllocatedLine({
    allocatedNetMinor: allocation.allocated_net_minor,
    soldQuantity: 2,
    returnedBeforeQuantity: 0,
    returnQuantity: 1,
  });
  const compensation = {
    kind: "return",
    operation_id: "return-op-1",
    occurred_at: "2026-09-10T02:00:00.000Z",
    snapshot: {
      return_id: "return-1",
      operation_id: "return-op-1",
      sale_id: evidence.sale.sale_id,
      currency_code: "IQD",
      currency_fraction_digits: 0,
      lines: [
        {
          original_line_id: "line-a",
          product_id: "a",
          quantity: 1,
          effective_unit_price_minor: 10_000,
          refund_minor: refund,
        },
      ],
      refund_total_minor: refund,
      occurred_at: "2026-09-10T02:00:00.000Z",
    },
  };
  const discounted = row([compensation]);
  const result = buildCashierCentralReportFromEvidenceRows({ rows: [discounted] });
  const iqd = result.report.by_currency[0];
  assert.equal(refund, 8_571);
  assert.equal(iqd.refunds_minor, 8_571);
  assert.equal(iqd.net_revenue_minor, 21_429);
});

test("central report discounted void reverses exact paid total", () => {
  const evidence = row([
    {
      kind: "void",
      operation_id: "void-op-1",
      occurred_at: "2026-09-10T02:00:00.000Z",
      snapshot: {
        operation_id: "void-op-1",
        sale_id: "sale:discounted",
        currency_code: "IQD",
        currency_fraction_digits: 0,
        refund_total_minor: 30_000,
        occurred_at: "2026-09-10T02:00:00.000Z",
      },
    },
  ]);
  const iqd = buildCashierCentralReportFromEvidenceRows({ rows: [evidence] }).report.by_currency[0];
  assert.equal(iqd.gross_revenue_minor, 30_000);
  assert.equal(iqd.refunds_minor, 30_000);
  assert.equal(iqd.net_revenue_minor, 0);
  assert.equal(iqd.net_units, 0);
  assert.equal(iqd.gross_profit_minor, 0);
});
