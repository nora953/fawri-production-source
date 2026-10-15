import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// Actual committed export closure, explicit inert downloader. This tests the
// workbook input boundary, not ZIP creation, Excel rendering, HTTP or React UI.
const source = readFileSync(new URL('../artifacts/fawri/src/pages/dashboard/ReportsPage.tsx', import.meta.url), 'utf8');
const marker = 'const downloadReport = async () => {';
const combinedStart = source.indexOf('function CombinedReports()');
assert.ok(combinedStart >= 0, 'combined report component must exist');
const start = source.indexOf(marker, combinedStart);
const end = source.indexOf('\n  return (', start);
assert.ok(start > combinedStart && end > start);
const closure = source.slice(start, end);
async function exported(currencies) {
  let captured;
  const run = vm.runInNewContext(`(async()=>{${closure}\nawait downloadReport();})`, {
    cashier: {}, online: { received_order_count: 2, delivered_order_count: 1, delivered_sales_iqd: 1000 },
    currencies, copy: { currency: 'Currency', cashierNetSales: 'Cashier net sales',
      onlineDeliveredSales: 'Online delivered sales', combinedSales: 'Combined sales',
      receivedOrders: 'Received orders', deliveredOrders: 'Delivered orders' },
    downloadWorkbook: async (name, sheets) => { captured = structuredClone(sheets); },
  }, { timeout: 2000 });
  await run(); return captured;
}
test('combined report IQD export keeps whole-dinar revenue and total', async () => {
  const sheets = await exported([{ code: 'IQD', digits: 0, cashier: 3000, online: 1000 }]);
  assert.deepEqual(sheets[0].rows[1], ['IQD', 3000, 1000, 4000]);
  assert.equal(sheets[1].rows[2][1], 1000);
});
test('combined report two-fraction currency export must match displayed major-unit money', async () => {
  const sheets = await exported([{ code: 'USD', digits: 2, cashier: 12345, online: 0 }]);
  assert.deepEqual(sheets[0].rows[1], ['USD', 123.45, 0, 123.45],
    'UI uses fraction-aware money; workbook supplies raw minor units without a minor-unit/fraction header');
});
test('combined report negative three-fraction currency export must preserve monetary scale', async () => {
  const sheets = await exported([{ code: 'KWD', digits: 3, cashier: -1050, online: 0 }]);
  assert.deepEqual(sheets[0].rows[1], ['KWD', -1.05, 0, -1.05],
    'Negative net revenue must use the same units in display and export');
});

function pureModule(path, names) {
  const raw = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(raw, { mode: 'transform' }).replace(/^import[^;]+;\s*$/gm, '').replace(/^export\s+/gm, '');
  return vm.runInNewContext(`(()=>{${code}\nreturn {${names.join(',')}}})()`, {}, { timeout: 2000 });
}
test('actual UI formatter displays two- and three-fraction major units', () => {
  const ui = pureModule('artifacts/fawri/src/lib/moneyUi.ts', ['formatMerchantMoneyMinor']);
  assert.equal(ui.formatMerchantMoneyMinor(12345, 'USD', 2, 'en'), '123.45\u00a0USD');
  assert.equal(ui.formatMerchantMoneyMinor(-1050, 'KWD', 3, 'en'), '-1.050\u00a0KWD');
});
test('workbook inline string encoding prevents formula interpretation', () => {
  const xml = pureModule('artifacts/fawri/src/lib/reportWorkbook.ts', ['worksheetXml']);
  const output = xml.worksheetXml({ name: 'Synthetic', rows: [['=1+1', '+SUM(A1)', '@SUM(A1)']] });
  assert.equal((output.match(/t="inlineStr"/g) || []).length, 3);
  assert.ok(!output.includes('<f>'));
});
test('workbook XML escapes markup and keeps numeric zero', () => {
  const xml = pureModule('artifacts/fawri/src/lib/reportWorkbook.ts', ['worksheetXml']);
  const output = xml.worksheetXml({ name: 'Synthetic', rows: [['<&"', 0]] });
  assert.ok(output.includes('&lt;&amp;&quot;'));
  assert.ok(output.includes('<v>0</v>'));
});

async function centralExport(code, digits) {
  const raw = readFileSync(new URL('../artifacts/fawri/src/pages/dashboard/CashierCentralReportsPage.tsx', import.meta.url), 'utf8');
  const start = raw.indexOf('const downloadReport = async () => {');
  const end = raw.indexOf('\n  };', start) + 6;
  assert.ok(start > 0 && end > start);
  const closure = stripTypeScriptTypes(raw.slice(start, end), { mode: 'transform' });
  let sheets;
  const labels = new Proxy({}, { get: (_, key) => String(key) });
  const currency = { currency_code: code, currency_fraction_digits: digits, net_revenue_minor: 12345,
    gross_profit_minor: 2345, profit_status: 'complete', sale_count: 1, net_units: 1, refunds_minor: 0,
    average_ticket_minor: 12345, voided_sale_count: 0, return_count: 0, top_products: [], top_profitable_products: [] };
  const result = { generated_at: '2026-10-12T00:00:00Z', report: { by_currency: [currency] }, activity: { operation_detail_limit: 30 } };
  const run = vm.runInNewContext(`(async()=>{${closure}\nawait downloadReport();})`, {
    result, labels, range: 'today', customRange: null, lang: 'en', detailsAreLimited: true,
    hasHistoricalActivityGap: false, historicalActivityText: '', filteredOperations: [],
    exportPeriodText: () => 'Synthetic period', formatDayFirstDateTime: () => '12/10/2026',
    cashierExportSheetNames: () => ({ summary: 'Summary', topSelling: 'Top selling', profitable: 'Profit', operations: 'Operations' }),
    profitStatusLabel: value => value, productDisplayName: p => p.name,
    downloadWorkbook: async (_, value) => { sheets = structuredClone(value); },
  }, { timeout: 2000 });
  await run(); return sheets;
}
test('central cashier IQD summary keeps units and limited-details notice', async () => {
  const sheets = await centralExport('IQD', 0);
  assert.equal(sheets[0].rows.find(row => row[1] === 'netSales')[2], 12345);
  assert.ok(sheets.find(sheet => sheet.name === 'Operations').rows.some(row => row[0] === 'detailsLimited'));
});
test('central cashier USD summary export must match major-unit display', async () => {
  const sheets = await centralExport('USD', 2);
  assert.equal(sheets[0].rows.find(row => row[1] === 'netSales')[2], 123.45,
    'Cashier central summary has the same raw-minor vs displayed-major discrepancy');
});
