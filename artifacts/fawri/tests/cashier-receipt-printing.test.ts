import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts';
import {
  CASHIER_RECEIPT_COPY,
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

function installMemoryLocalStorage(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
      removeItem(key: string) { values.delete(key); },
      clear() { values.clear(); },
    },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  };
}

test('receipt renders authoritative sale snapshot, merchant store name and escaped text', () => {
  const html = renderCashierReceiptHtml({
    sale: saleFixture(),
    lang: 'ar',
    stationLabel: 'Main <Cashier>',
    storeName: 'متجر <النور>',
  });

  assert.match(html, /متجر &lt;النور&gt;/);
  assert.doesNotMatch(html, /<div class="brand">Fawri<\/div>/);
  assert.match(html, /sale-test-001/);
  assert.match(html, /١٨٠٠٠|18,000|18000/);
  assert.match(html, /المبلغ المستلم/);
  assert.match(html, /الباقي للعميل/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /أسود &amp; سريع/);
  assert.match(html, /Main &lt;Cashier&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('receipt supports 80mm and 58mm thermal rolls with automatic content length', () => {
  const sale = saleFixture();
  sale.lines = Array.from({ length: 40 }, (_, index) => ({
    ...sale.lines[0],
    line_id: `line-${index + 1}`,
    product_id: `product-${index + 1}`,
    product_name_snapshot: `منتج طويل ${index + 1}`,
  }));
  const html80 = renderCashierReceiptHtml({ sale, lang: 'ar', storeName: 'متجر', paperWidthMm: 80 });
  const html58 = renderCashierReceiptHtml({ sale, lang: 'ar', storeName: 'متجر', paperWidthMm: 58 });

  assert.match(html80, /@page \{ size: 80mm auto; margin: 4mm; \}/);
  assert.match(html80, /body \{ width: 72mm;/);
  assert.match(html58, /@page \{ size: 58mm auto; margin: 3mm; \}/);
  assert.match(html58, /body \{ width: 52mm;/);
  assert.match(html80, /منتج طويل 40/);
  assert.match(html58, /منتج طويل 40/);
  assert.doesNotMatch(html80, /\.receipt \{[^}]*height\s*:/s);
  assert.doesNotMatch(html58, /\.receipt \{[^}]*height\s*:/s);
});

test('receipt never discloses raw cost or opaque cost evidence', () => {
  const html = renderCashierReceiptHtml({ sale: saleFixture(), lang: 'en', storeName: 'Store' });
  assert.doesNotMatch(html, /opaque-secret-cost-evidence/);
  assert.doesNotMatch(html, /unit_cost_minor|cost_evidence/);
});

test('receipt settings default to 80mm and preserve paper width across auto-print changes', () => {
  assert.deepEqual(readCashierReceiptPrintSettings('device-a'), {
    auto_print: false,
    paper_width_mm: 80,
  });
  assert.equal(writeCashierReceiptPrintSettings('device-a', { auto_print: true }), false);

  const restore = installMemoryLocalStorage();
  try {
    assert.deepEqual(readCashierReceiptPrintSettings('device-a'), {
      auto_print: false,
      paper_width_mm: 80,
    });
    assert.equal(writeCashierReceiptPrintSettings('device-a', { paper_width_mm: 58 }), true);
    assert.equal(writeCashierReceiptPrintSettings('device-a', { auto_print: true }), true);
    assert.deepEqual(readCashierReceiptPrintSettings('device-a'), {
      auto_print: true,
      paper_width_mm: 58,
    });
    assert.equal(writeCashierReceiptPrintSettings('device-a', { paper_width_mm: 80 }), true);
    assert.deepEqual(readCashierReceiptPrintSettings('device-a'), {
      auto_print: true,
      paper_width_mm: 80,
    });
  } finally {
    restore();
  }
});

test('receipt printing uses an isolated iframe instead of printing the cashier page', () => {
  const source = fs.readFileSync(
    new URL('../src/lib/cashierReceiptPrinting.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /document\.createElement\('iframe'\)/);
  assert.match(source, /frame\.srcdoc = renderCashierReceiptHtml\(renderInput\)/);
  assert.match(source, /printWindow\.print\(\)/);
  assert.doesNotMatch(source, /window\.print\(\)/);
  assert.match(source, /afterprint/);
  assert.match(source, /PRINT_FRAME_TIMEOUT_MS/);
});

test('POS exposes F9 manual print, device-scoped auto print and 58/80mm roll control', () => {
  const source = fs.readFileSync(
    new URL('../src/pages/CashierPosPage.tsx', import.meta.url),
    'utf8',
  );
  const keyboard = fs.readFileSync(
    new URL('../src/lib/cashierFastCheckoutKeyboard.ts', import.meta.url),
    'utf8',
  );

  assert.equal(CASHIER_RECEIPT_COPY.ar.printShortcut, 'F9');
  assert.equal(CASHIER_RECEIPT_COPY.ku.printShortcut, 'F9');
  assert.equal(CASHIER_RECEIPT_COPY.en.printShortcut, 'F9');
  assert.match(source, /receipt: result\.sale/);
  assert.match(source, /onClick=\{\(\) => printReceipt\(success\.receipt\)\}/);
  assert.match(keyboard, /CASHIER_RECEIPT_PRINT_KEY = 'F9'/);
  assert.match(keyboard, /receiptPrintButton/);
  assert.match(keyboard, /stopImmediatePropagation\(\)/);
  assert.match(source, /writeCashierReceiptPrintSettings\(runtime\.deviceId/);
  assert.match(source, /readCashierReceiptPrintSettings\(runtime\.deviceId\)/);
  assert.match(source, /paper_width_mm: width/);
  assert.match(source, /<option value=\{80\}>/);
  assert.match(source, /<option value=\{58\}>/);
  assert.match(source, /if \(receiptAutoPrint\) printReceipt\(result\.sale\)/);
  assert.doesNotMatch(source, /handleReceiptShortcut/);
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

test('receipt store profile is tenant-bound, minimal and cached for offline printing', () => {
  const route = fs.readFileSync(
    new URL('../../api-server/src/routes/cashier-operator-commerce.ts', import.meta.url),
    'utf8',
  );
  const authority = fs.readFileSync(
    new URL('../../api-server/src/services/cashierReceiptProfileAuthority.ts', import.meta.url),
    'utf8',
  );
  const client = fs.readFileSync(
    new URL('../src/lib/cashierReceiptProfileClient.ts', import.meta.url),
    'utf8',
  );
  const main = fs.readFileSync(
    new URL('../src/cashierMain.tsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /\/cashier\/operator\/receipt-profile/);
  assert.match(route, /requireCashierOperatorSession\("sale\.create"\)/);
  assert.match(route, /merchantId: context\.merchant_id/);
  assert.match(authority, /SELECT store_name\s+FROM merchants\s+WHERE id = \$1/s);
  assert.doesNotMatch(authority, /owner_name|phone|email/);
  assert.match(client, /cashierOperatorHeaders\(session\)/);
  assert.match(client, /writeCachedCashierReceiptProfile\(session\.device_id, profile\)/);
  assert.match(main, /installCashierReceiptProfileRefresh\(\)/);
});
