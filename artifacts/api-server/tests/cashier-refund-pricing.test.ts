import assert from "node:assert/strict";
import test from "node:test";

import {
  CASHIER_REFUND_PRICING_VERSION,
  cashierAdjustedLineRevenueById,
  cashierNetReturnRefundMinor,
} from "../src/services/cashierRefundPricing.ts";

test("server refund pricing v2 derives exact discounted refunds", () => {
  assert.equal(CASHIER_REFUND_PRICING_VERSION, 2);
  const sale = {
    manual_discount_minor: 3_000,
    total_minor: 37_000,
    lines: [
      { line_id: "a", quantity: 1, line_total_minor: 30_000 },
      { line_id: "b", quantity: 1, line_total_minor: 10_000 },
    ],
  };
  assert.deepEqual(
    [...cashierAdjustedLineRevenueById(sale).entries()],
    [
      ["a", 27_750],
      ["b", 9_250],
    ],
  );
  assert.equal(cashierNetReturnRefundMinor(sale, "a", 0, 1), 27_750);
  assert.equal(cashierNetReturnRefundMinor(sale, "b", 0, 1), 9_250);
});

test("server refund pricing preserves exact totals across rounding-sensitive partial returns", () => {
  const sale = {
    manual_discount_minor: 1,
    total_minor: 2_999,
    lines: [{ line_id: "line", quantity: 3, line_total_minor: 3_000 }],
  };
  const refunds = [
    cashierNetReturnRefundMinor(sale, "line", 0, 1),
    cashierNetReturnRefundMinor(sale, "line", 1, 1),
    cashierNetReturnRefundMinor(sale, "line", 2, 1),
  ];
  assert.deepEqual(refunds, [999, 1_000, 1_000]);
  assert.equal(refunds.reduce((sum, item) => sum + item, 0), sale.total_minor);
});
