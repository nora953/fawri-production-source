import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateCashierSaleNetByLine,
  cashierRefundForAllocatedLine,
} from "../src/services/cashierSaleAccounting";

test("server accounting allocates bill-level discount exactly", () => {
  const allocations = allocateCashierSaleNetByLine(
    [
      { line_id: "a", quantity: 2, effective_unit_price_minor: 10_000, line_total_minor: 20_000 },
      { line_id: "b", quantity: 1, effective_unit_price_minor: 15_000, line_total_minor: 15_000 },
    ],
    30_000,
  );
  assert.deepEqual(
    allocations.map((line) => line.allocated_net_minor),
    [17_142, 12_858],
  );
  assert.equal(
    allocations.reduce((sum, line) => sum + line.allocated_net_minor, 0),
    30_000,
  );
});

test("server accounting makes sequential partial returns sum to exact paid amount", () => {
  const [allocation] = allocateCashierSaleNetByLine(
    [{ line_id: "a", quantity: 3, effective_unit_price_minor: 100, line_total_minor: 300 }],
    200,
  );
  const refunds = [0, 1, 2].map((returnedBeforeQuantity) =>
    cashierRefundForAllocatedLine({
      allocatedNetMinor: allocation.allocated_net_minor,
      soldQuantity: 3,
      returnedBeforeQuantity,
      returnQuantity: 1,
    }),
  );
  assert.deepEqual(refunds, [66, 67, 67]);
  assert.equal(refunds.reduce((sum, refund) => sum + refund, 0), 200);
});
