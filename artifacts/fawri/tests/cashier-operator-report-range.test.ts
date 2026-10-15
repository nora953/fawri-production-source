import assert from 'node:assert/strict';
import test from 'node:test';

import { cashierSaleTouchesReportRange } from '../src/lib/cashierOperatorReportsRuntime.ts';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts.ts';

function sale(occurredAt: string): CashierSaleSnapshot {
  return {
    sale_id: 'sale:range-test',
    operation_id: 'sale-op-range-test',
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
      },
    ],
    subtotal_minor: 10_000,
    discount_minor: 0,
    total_minor: 10_000,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    occurred_at: occurredAt,
  };
}

const range = {
  from: '2026-09-19T00:00:00.000Z',
  to: '2026-09-20T00:00:00.000Z',
};

test('offline operator report keeps an old sale when a return happened inside the report range', () => {
  const original = sale('2026-09-10T09:00:00.000Z');
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
          original_line_id: 'line-1',
          product_id: 'product-1',
          quantity: 1,
          effective_unit_price_minor: 10_000,
          refund_minor: 10_000,
        },
      ],
      refund_total_minor: 10_000,
      occurred_at: '2026-09-19T10:00:00.000Z',
    },
  ];

  assert.equal(cashierSaleTouchesReportRange(original, range), true);
});

test('offline operator report keeps an old sale when a void happened inside the report range', () => {
  const original = sale('2026-09-10T09:00:00.000Z');
  original.status = 'voided';
  original.void = {
    operation_id: 'void-op-1',
    sale_id: original.sale_id,
    device_id: original.device_id,
    device_sequence: 2,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    refund_total_minor: 10_000,
    occurred_at: '2026-09-19T11:00:00.000Z',
  };

  assert.equal(cashierSaleTouchesReportRange(original, range), true);
});

test('offline operator report excludes a sale when neither sale nor compensation touches the range', () => {
  const original = sale('2026-09-10T09:00:00.000Z');
  assert.equal(cashierSaleTouchesReportRange(original, range), false);
});

test('offline operator report range keeps [from, to) boundaries', () => {
  assert.equal(
    cashierSaleTouchesReportRange(sale('2026-09-19T00:00:00.000Z'), range),
    true,
  );
  assert.equal(
    cashierSaleTouchesReportRange(sale('2026-09-20T00:00:00.000Z'), range),
    false,
  );
});
