import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCashierSalesReport } from '../src/lib/cashierSalesReportRuntime.ts';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts.ts';

function sale(): CashierSaleSnapshot {
  return {
    sale_id: 'sale:report-corruption',
    operation_id: 'report-corruption',
    local_merchant_id: 'merchant-local',
    cloud_merchant_id: 'merchant-cloud',
    device_id: 'device-1',
    device_sequence: 1,
    source: 'cashier',
    status: 'completed',
    lines: [
      {
        line_id: 'line-1',
        product_id: 'product-1',
        product_name_snapshot: 'Product',
        quantity: 1,
        base_unit_price_minor: 10_000,
        effective_unit_price_minor: 10_000,
        discount_minor: 0,
        line_total_minor: 10_000,
        unit_cost_minor: 6_000,
      },
    ],
    subtotal_minor: 10_000,
    discount_minor: 0,
    total_minor: 10_000,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    occurred_at: '2026-08-25T10:00:00.000Z',
  };
}

test('cashier report rejects refund evidence that does not match the immutable sale price', () => {
  const corrupt = sale();
  corrupt.returns = [
    {
      return_id: 'return-1',
      operation_id: 'return-op-1',
      sale_id: corrupt.sale_id,
      local_merchant_id: corrupt.local_merchant_id,
      cloud_merchant_id: corrupt.cloud_merchant_id,
      device_id: corrupt.device_id,
      device_sequence: 2,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      lines: [
        {
          original_line_id: 'line-1',
          product_id: 'product-1',
          quantity: 1,
          effective_unit_price_minor: 10_000,
          refund_minor: 11_000,
        },
      ],
      refund_total_minor: 11_000,
      occurred_at: '2026-08-25T10:10:00.000Z',
    },
  ];

  assert.throws(
    () => buildCashierSalesReport([corrupt]),
    /CASHIER_REPORT_RETURN_MISMATCH/,
  );
});

test('cashier report rejects an empty [from, to) range', () => {
  assert.throws(
    () =>
      buildCashierSalesReport([sale()], {
        from: '2026-08-25T10:00:00.000Z',
        to: '2026-08-25T10:00:00.000Z',
      }),
    /CASHIER_REPORT_INVALID_RANGE/,
  );
});