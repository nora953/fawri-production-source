import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts';
import {
  readCashierReceiptPrintSettings,
  renderCashierReceiptHtml,
  writeCashierReceiptPrintSettings,
} from '../src/lib/cashierReceiptPrinting';

function saleFixture(): CashierSaleSnapshot {
  return {
    sale_id: 'sale-test-001',
    operation_id: 'operation-test-001',
    local_merchant_id: 'merchant-test',
    device_id: 'device-test',
    device_sequence: 1,
    source: 'cashier',
    status: 'completed',
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    lines: [
      {
        line_id: 'line-1',
        product_id: 'product-1',
        product_name_snapshot: '<script>alert("x")</script> شاحن',
        variant_name_snapshot: 'أسود & سريع',
        quantity: 2,
        base_unit_price_minor: 10000,
        effective_unit_price_minor: 9000,
        unit_cost_minor: 1,
        cost_evidence: 'opaque-secret-cost-evidence',
        discount_minor: 2000,
        line_total_minor: 18000,
      },
    ],
    subtotal_minor: 20000,
    promotion_discount_minor: 2000,
    discount_minor: 2000,
    total_minor: 18000,
    payment_method: 'cash',
    payment_status: 'paid',
    cash_tendered_minor: 20000,
    change_due_minor: 2000,
    occurred_at: '2026-09-10T09:30:00.000Z',
  };
}

test('receipt renders authoritative sale snapshot and escapes merchant-controlled text', () => {
  const html = renderCashierReceiptHtml({
    sale: saleFixture(),
    lang: 'ar',
    stationLabel: 'Main <Cashier>',
  });

  assert.match(html, /sale-test-001/);
  assert.match(html, /١٨٠٠٠|18,000|18000/);
  assert.match(html, /المبلغ المستلم/);
  assert.match(html, /الباقي للعميل/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /أسود &amp; سريع/);
  assert.match(html, /Main &lt;Cashier&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('receipt never discloses raw cost or opaque cost evidence', () => {
  const html = renderCashierReceiptHtml({ sale: saleFixture(), lang: 'en' });
  assert.doesNotMatch(html, /opaque-secret-cost-evidence/);
  assert.doesNotMatch(html, /unit_cost_minor|cost_evidence/);
});

test('receipt print settings fail closed when browser storage is unavailable', () => {
  assert.deepEqual(readCashierReceiptPrintSettings('device-a'), { auto_print: false });
  assert.equal(writeCashierReceiptPrintSettings('device-a', { auto_print: true }), false);
});

test('receipt printing uses an isolated iframe instead of printing the cashier page', () => {
  const source = fs.readFileSync(
    new URL('../src/lib/cashierReceiptPrinting.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /document\.createElement\('iframe'\)/);
  assert.match(source, /frame\.srcdoc = renderCashierReceiptHtml\(input\)/);
  assert.match(source, /printWindow\.print\(\)/);
  assert.doesNotMatch(source, /window\.print\(\)/);
  assert.match(source, /afterprint/);
  assert.match(source, /PRINT_FRAME_TIMEOUT_MS/);
});

test('POS exposes manual receipt print, Ctrl+P and device-scoped auto print after a completed sale', () => {
  const source = fs.readFileSync(
    new URL('../src/pages/CashierPosPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /receipt: result\.sale/);
  assert.match(source, /onClick=\{\(\) => printReceipt\(success\.receipt\)\}/);
  assert.match(source, /event\.key\.toLowerCase\(\) !== 'p'/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /writeCashierReceiptPrintSettings\(runtime\.deviceId/);
  assert.match(source, /readCashierReceiptPrintSettings\(runtime\.deviceId\)\.auto_print/);
  assert.match(source, /if \(receiptAutoPrint\) printReceipt\(result\.sale\)/);
});

test('receipt print failure is non-fatal to the committed sale path', () => {
  const source = fs.readFileSync(
    new URL('../src/pages/CashierPosPage.tsx', import.meta.url),
    'utf8',
  );

  const commitIndex = source.indexOf('const result = await runtime.commitSale');
  const successIndex = source.indexOf('setSuccess({', commitIndex);
  const autoPrintIndex = source.indexOf('if (receiptAutoPrint) printReceipt(result.sale)', successIndex);
  assert.ok(commitIndex >= 0);
  assert.ok(successIndex > commitIndex);
  assert.ok(autoPrintIndex > successIndex);
  assert.match(source, /printCashierReceipt\(\{ sale, lang \}\)\.catch\(\(\) => \{/);
  assert.doesNotMatch(source, /await printCashierReceipt/);
});
