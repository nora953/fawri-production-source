import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCashierCentralReportFromEvidenceRows,
  type CashierCentralReportEvidenceRow,
} from '../src/services/postgresCashierCentralReportAuthority';

const SALE_AT = '2026-08-25T10:00:00.000Z';
const RETURN_AT = '2026-08-26T09:00:00.000Z';
const VOID_AT = '2026-08-26T11:00:00.000Z';

function baseSaleSnapshot(options: { withCost?: boolean } = {}) {
  return {
    sale_id: 'sale-1',
    operation_id: 'sale-op-1',
    local_merchant_id: 'local-merchant',
    cloud_merchant_id: 'merchant-1',
    device_id: 'device-1',
    device_sequence: 1,
    source: 'cashier',
    status: 'completed',
    lines: [
      {
        line_id: 'line-1',
        product_id: 'product-1',
        product_name_snapshot: 'Test product',
        quantity: 2,
        base_unit_price_minor: 5000,
        effective_unit_price_minor: 5000,
        discount_minor: 0,
        line_total_minor: 10000,
        ...(options.withCost === false ? {} : { unit_cost_minor: 3000 }),
      },
    ],
    subtotal_minor: 10000,
    discount_minor: 0,
    total_minor: 10000,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    occurred_at: SALE_AT,
  };
}

function returnCompensation(input: {
  operationId?: string;
  quantity?: number;
  occurredAt?: string;
} = {}) {
  const quantity = input.quantity ?? 1;
  return {
    kind: 'return',
    operation_id: input.operationId || 'return-op-1',
    request_hash: 'a'.repeat(64),
    device_id: 'device-1',
    device_sequence: '2',
    occurred_at: input.occurredAt || RETURN_AT,
    snapshot: {
      return_id: input.operationId || 'return-1',
      operation_id: input.operationId || 'return-op-1',
      sale_id: 'sale-1',
      local_merchant_id: 'local-merchant',
      cloud_merchant_id: 'merchant-1',
      device_id: 'device-1',
      device_sequence: 2,
      lines: [
        {
          original_line_id: 'line-1',
          product_id: 'product-1',
          quantity,
          effective_unit_price_minor: 5000,
          refund_minor: 5000 * quantity,
        },
      ],
      refund_total_minor: 5000 * quantity,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      occurred_at: input.occurredAt || RETURN_AT,
    },
    accepted_entity_ids: [],
  };
}

function voidCompensation() {
  return {
    kind: 'void',
    operation_id: 'void-op-1',
    request_hash: 'b'.repeat(64),
    device_id: 'device-1',
    device_sequence: '2',
    occurred_at: VOID_AT,
    snapshot: {
      operation_id: 'void-op-1',
      sale_id: 'sale-1',
      device_id: 'device-1',
      device_sequence: 2,
      refund_total_minor: 10000,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      occurred_at: VOID_AT,
    },
    accepted_entity_ids: [],
  };
}

function row(input: {
  compensations?: unknown[];
  withCost?: boolean;
} = {}): CashierCentralReportEvidenceRow {
  return {
    id: 'sale-1',
    metadata: {
      cashier_sync: {
        operation_id: 'sale-op-1',
        sale_snapshot: baseSaleSnapshot({ withCost: input.withCost }),
        compensations: input.compensations || [],
      },
    },
    staff_id: 'staff-1',
    staff_name: 'Cashier One',
    station_id: 'station-1',
    station_name: 'Front Desk',
    branch_key: 'main',
    branch_label: 'Main branch',
  };
}

function onlyCurrency(result: ReturnType<typeof buildCashierCentralReportFromEvidenceRows>) {
  assert.equal(result.report.by_currency.length, 1);
  return result.report.by_currency[0];
}

test('return-only period reports the return at operation time without inventing a sale', () => {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row({ compensations: [returnCompensation()] })],
    from: '2026-08-26T00:00:00.000Z',
    to: '2026-08-27T00:00:00.000Z',
    generatedAt: '2026-08-27T00:00:00.000Z',
  });
  const currency = onlyCurrency(result);

  assert.equal(result.report.sale_count, 0);
  assert.equal(currency.sale_count, 0);
  assert.equal(currency.gross_revenue_minor, 0);
  assert.equal(currency.refunds_minor, 5000);
  assert.equal(currency.net_revenue_minor, -5000);
  assert.equal(currency.sold_units, 0);
  assert.equal(currency.returned_units, 1);
  assert.equal(currency.net_units, -1);
  assert.equal(currency.average_ticket_minor, 0);
  assert.equal(currency.profit_status, 'available');
  assert.equal(currency.gross_profit_minor, -2000);
  assert.equal(result.by_staff[0].report.by_currency[0].net_revenue_minor, -5000);
  assert.equal(result.by_station[0].report.by_currency[0].net_revenue_minor, -5000);
});

test('sale and later return in the same period keep average ticket based on gross sale operations', () => {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row({ compensations: [returnCompensation()] })],
    from: '2026-08-25T00:00:00.000Z',
    to: '2026-08-27T00:00:00.000Z',
  });
  const currency = onlyCurrency(result);

  assert.equal(result.report.sale_count, 1);
  assert.equal(currency.gross_revenue_minor, 10000);
  assert.equal(currency.refunds_minor, 5000);
  assert.equal(currency.net_revenue_minor, 5000);
  assert.equal(currency.sold_units, 2);
  assert.equal(currency.returned_units, 1);
  assert.equal(currency.net_units, 1);
  assert.equal(currency.average_ticket_minor, 10000);
  assert.equal(currency.active_sale_count, 1);
  assert.equal(currency.voided_sale_count, 0);
  assert.equal(currency.gross_profit_minor, 2000);
});

test('sale and void in the same period net to zero and do not remain active', () => {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row({ compensations: [voidCompensation()] })],
    from: '2026-08-25T00:00:00.000Z',
    to: '2026-08-27T00:00:00.000Z',
  });
  const currency = onlyCurrency(result);

  assert.equal(result.report.sale_count, 1);
  assert.equal(currency.gross_revenue_minor, 10000);
  assert.equal(currency.refunds_minor, 10000);
  assert.equal(currency.net_revenue_minor, 0);
  assert.equal(currency.net_units, 0);
  assert.equal(currency.average_ticket_minor, 10000);
  assert.equal(currency.active_sale_count, 0);
  assert.equal(currency.voided_sale_count, 1);
  assert.equal(currency.gross_profit_minor, 0);
});

test('void-only period carries negative revenue and profit at void operation time', () => {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row({ compensations: [voidCompensation()] })],
    from: '2026-08-26T00:00:00.000Z',
    to: '2026-08-27T00:00:00.000Z',
  });
  const currency = onlyCurrency(result);

  assert.equal(result.report.sale_count, 0);
  assert.equal(currency.gross_revenue_minor, 0);
  assert.equal(currency.refunds_minor, 10000);
  assert.equal(currency.net_revenue_minor, -10000);
  assert.equal(currency.net_units, -2);
  assert.equal(currency.average_ticket_minor, 0);
  assert.equal(currency.active_sale_count, 0);
  assert.equal(currency.voided_sale_count, 1);
  assert.equal(currency.gross_profit_minor, -4000);
});

test('unknown cost remains unavailable in a return-only period instead of becoming zero profit', () => {
  const result = buildCashierCentralReportFromEvidenceRows({
    rows: [row({ withCost: false, compensations: [returnCompensation()] })],
    from: '2026-08-26T00:00:00.000Z',
    to: '2026-08-27T00:00:00.000Z',
  });
  const currency = onlyCurrency(result);

  assert.equal(currency.profit_status, 'unavailable');
  assert.equal(currency.gross_profit_minor, undefined);
  assert.equal(currency.cost_unknown_net_units, 1);
});

test('corrupt cumulative returns that exceed sold quantity fail closed', () => {
  assert.throws(
    () => buildCashierCentralReportFromEvidenceRows({
      rows: [row({
        compensations: [
          returnCompensation({ operationId: 'return-op-1', quantity: 2 }),
          returnCompensation({
            operationId: 'return-op-2',
            quantity: 1,
            occurredAt: '2026-08-26T12:00:00.000Z',
          }),
        ],
      })],
    }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 'CASHIER_REPORT_EVIDENCE_INVALID',
  );
});

test('duplicate sale attribution rows fail closed instead of double counting revenue', () => {
  const first = row();
  const duplicate = { ...row(), staff_id: 'staff-2', staff_name: 'Cashier Two' };
  assert.throws(
    () => buildCashierCentralReportFromEvidenceRows({ rows: [first, duplicate] }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 'CASHIER_REPORT_EVIDENCE_INVALID',
  );
});
