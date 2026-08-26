import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authority = await readFile(
  new URL('../src/services/postgresCashierCentralReportAuthority.ts', import.meta.url),
  'utf8',
);
const routes = await readFile(
  new URL('../src/routes/cashier-staff-operations.ts', import.meta.url),
  'utf8',
);
const operatorCommerce = await readFile(
  new URL('../src/services/cashierOperatorCommerceAuthority.ts', import.meta.url),
  'utf8',
);

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('owner central report reads only durable cashier sales and joins operator attribution', () => {
  assert.match(authority, /FROM orders o/);
  assert.match(authority, /o\.source_channel = 'cashier'/);
  assert.match(authority, /LEFT JOIN cashier_operation_attribution attribution/);
  assert.match(authority, /attribution\.operation_kind = 'sale'/);
  assert.match(authority, /LEFT JOIN merchant_cashier_staff staff/);
  assert.match(authority, /LEFT JOIN merchant_cashier_stations station/);
  assert.match(authority, /by_staff/);
  assert.match(authority, /by_station/);
});

test('central report uses sale-time server evidence and compensation evidence for truthful profit', () => {
  assert.match(authority, /cashier_sync/);
  assert.match(authority, /sale_snapshot/);
  assert.match(authority, /compensations/);
  assert.match(authority, /unit_cost_minor/);
  assert.match(authority, /profit_status/);
  assert.match(authority, /cost_unknown_net_units/);
  assert.match(authority, /gross_profit_minor/);
  assert.match(
    authority,
    /profitStatus !== "unavailable"[\s\S]*gross_profit_minor/,
    'unknown cost must never be converted into a zero-profit claim',
  );
  assert.match(
    operatorCommerce,
    /resolveCashierCostEvidence[\s\S]*delete line\.unit_cost_minor[\s\S]*resolved\.unit_cost_minor/,
    'sale-time cost entering durable cashier evidence must be server-resolved',
  );
});

test('central report response shape does not expose raw unit cost evidence', () => {
  const publicCurrencyType = section(
    authority,
    'export type CashierCentralCurrencyReport = {',
    'export type CashierCentralReport = {',
  );
  assert.doesNotMatch(publicCurrencyType, /unit_cost_minor/);
  assert.doesNotMatch(publicCurrencyType, /cost_evidence/);
  assert.match(publicCurrencyType, /gross_profit_minor\?: number/);
});

test('central report endpoint is merchant-authority only', () => {
  assert.match(
    routes,
    /"\/cashier\/management\/report"[\s\S]{0,120}requireMerchantAuthority/,
  );
  assert.match(routes, /buildCashierCentralReportAuthoritative/);
  assert.match(routes, /merchantId: merchantId\(res\)/);
  assert.match(routes, /from: req\.query\.from/);
  assert.match(routes, /to: req\.query\.to/);
  assert.doesNotMatch(
    routes,
    /"\/cashier\/operator\/report"/,
    'owner central report must not be exposed through an operator route',
  );
});

test('central report fails closed on invalid evidence and oversized ranges', () => {
  assert.match(authority, /CASHIER_REPORT_EVIDENCE_INVALID/);
  assert.match(authority, /CASHIER_REPORT_RANGE_INVALID/);
  assert.match(authority, /CASHIER_REPORT_RANGE_TOO_LARGE/);
  assert.match(authority, /MAX_REPORT_SALES \+ 1/);
  assert.match(authority, /operationalPostgresAuthorityRequired\(\)/);
});
