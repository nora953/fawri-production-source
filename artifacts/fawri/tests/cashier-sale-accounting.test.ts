import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allocateCashierSaleNetByLine,
  cashierRefundForAllocatedLine,
} from '../src/lib/cashierSaleAccounting.ts';

test('manual invoice discount is allocated exactly across sale lines', () => {
  const allocations = allocateCashierSaleNetByLine(
    [
      { line_id: 'a', quantity: 2, effective_unit_price_minor: 10_000, line_total_minor: 20_000 },
      { line_id: 'b', quantity: 1, effective_unit_price_minor: 15_000, line_total_minor: 15_000 },
    ],
    30_000,
  );

  assert.deepEqual(allocations, [
    { line_id: 'a', quantity: 2, basis_total_minor: 20_000, allocated_net_minor: 17_142 },
    { line_id: 'b', quantity: 1, basis_total_minor: 15_000, allocated_net_minor: 12_858 },
  ]);
  assert.equal(
    allocations.reduce((sum, line) => sum + line.allocated_net_minor, 0),
    30_000,
  );
});

test('repeated partial returns reconcile exactly including rounding remainder', () => {
  const [allocation] = allocateCashierSaleNetByLine(
    [{ line_id: 'a', quantity: 3, effective_unit_price_minor: 100, line_total_minor: 300 }],
    200,
  );

  const first = cashierRefundForAllocatedLine({
    allocatedNetMinor: allocation.allocated_net_minor,
    soldQuantity: 3,
    returnedBeforeQuantity: 0,
    returnQuantity: 1,
  });
  const second = cashierRefundForAllocatedLine({
    allocatedNetMinor: allocation.allocated_net_minor,
    soldQuantity: 3,
    returnedBeforeQuantity: 1,
    returnQuantity: 1,
  });
  const final = cashierRefundForAllocatedLine({
    allocatedNetMinor: allocation.allocated_net_minor,
    soldQuantity: 3,
    returnedBeforeQuantity: 2,
    returnQuantity: 1,
  });

  assert.deepEqual([first, second, final], [66, 67, 67]);
  assert.equal(first + second + final, 200);
});

test('sale totals above post-promotion line basis fail closed', () => {
  assert.throws(
    () =>
      allocateCashierSaleNetByLine(
        [{ line_id: 'a', quantity: 1, effective_unit_price_minor: 100, line_total_minor: 100 }],
        101,
      ),
    /sale total exceeds/,
  );
});

test('return quantity cannot exceed sold quantity', () => {
  assert.throws(
    () =>
      cashierRefundForAllocatedLine({
        allocatedNetMinor: 100,
        soldQuantity: 1,
        returnedBeforeQuantity: 1,
        returnQuantity: 1,
      }),
    /exceeds the remaining sold quantity/,
  );
});
