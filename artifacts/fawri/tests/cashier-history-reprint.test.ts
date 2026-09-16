import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { CashierSaleSnapshot } from '../src/lib/cashierLocalContracts';
import {
  CASHIER_RECEIPT_COPY,
  renderCashierReceiptHtml,
} from '../src/lib/cashierReceiptPrinting';

function saleFixture(): CashierSaleSnapshot {
  return {
    sale_id: 'sale:history-reprint-001',
    operation_id: 'operation-history-reprint-001',
    local_merchant_id: 'merchant-test',
    device_id: 'device-test',
    device_sequence: 7,
    source: 'cashier',
    status: 'completed',
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    lines: [
      {
        line_id: 'line-1',
        product_id: 'product-1',
        product_name_snapshot: 'شاحن سريع',
        quantity: 2,
        base_unit_price_minor: 18000,
        effective_unit_price_minor: 18000,
        discount_minor: 0,
        line_total_minor: 36000,
      },
    ],
    subtotal_minor: 36000,
    discount_minor: 0,
    total_minor: 36000,
    payment_method: 'cash',
    payment_status: 'paid',
    cash_tendered_minor: 40000,
    change_due_minor: 4000,
    occurred_at: '2026-09-10T18:00:00.000Z',
  };
}

function reprintHtml(sale: CashierSaleSnapshot, lang: 'ar' | 'ku' | 'en' = 'ar'): string {
  return renderCashierReceiptHtml({
    sale,
    lang,
    storeName: 'متجر النور',
    paperWidthMm: 80,
    reprint: true,
  });
}

test('historical receipt reprint is visibly marked in Arabic, Kurdish and English', () => {
  assert.equal(CASHIER_RECEIPT_COPY.ar.reprintReceipt, 'إعادة طباعة الإيصال');
  assert.equal(CASHIER_RECEIPT_COPY.ku.reprintReceipt, 'دووبارە چاپکردنەوەی پسوڵە');
  assert.equal(CASHIER_RECEIPT_COPY.en.reprintReceipt, 'Reprint receipt');

  assert.match(reprintHtml(saleFixture(), 'ar'), /نسخة معاد طباعتها/);
  assert.match(reprintHtml(saleFixture(), 'ku'), /وەشانی دووبارە چاپکراو/);
  assert.match(reprintHtml(saleFixture(), 'en'), /Reprinted copy/);
});

test('reprinted receipt reports completed, partial-return, full-return and void states', () => {
  const completed = saleFixture();
  assert.match(reprintHtml(completed), /الحالة الحالية/);
  assert.match(reprintHtml(completed), /مكتمل/);

  const partial = saleFixture();
  partial.returns = [
    {
      return_id: 'return-1',
      operation_id: 'return-operation-1',
      sale_id: partial.sale_id,
      local_merchant_id: partial.local_merchant_id,
      device_id: partial.device_id,
      device_sequence: 8,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      lines: [
        {
          original_line_id: 'line-1',
          product_id: 'product-1',
          quantity: 1,
          effective_unit_price_minor: 18000,
          refund_minor: 18000,
        },
      ],
      refund_total_minor: 18000,
      occurred_at: '2026-09-10T18:10:00.000Z',
    },
  ];
  assert.match(reprintHtml(partial), /مرتجع جزئيًا/);

  const fullyReturned = structuredClone(partial);
  fullyReturned.returns![0].lines[0].quantity = 2;
  fullyReturned.returns![0].lines[0].refund_minor = 36000;
  fullyReturned.returns![0].refund_total_minor = 36000;
  assert.match(reprintHtml(fullyReturned), /مرتجع بالكامل/);

  const voided = saleFixture();
  voided.status = 'voided';
  voided.void = {
    operation_id: 'void-operation-1',
    sale_id: voided.sale_id,
    device_id: voided.device_id,
    device_sequence: 9,
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    refund_total_minor: 36000,
    occurred_at: '2026-09-10T18:20:00.000Z',
  };
  assert.match(reprintHtml(voided), /ملغي/);
});

test('normal first-print receipt is not falsely marked as a reprint', () => {
  const html = renderCashierReceiptHtml({
    sale: saleFixture(),
    lang: 'ar',
    storeName: 'متجر النور',
    paperWidthMm: 80,
  });
  assert.doesNotMatch(html, /نسخة معاد طباعتها/);
  assert.doesNotMatch(html, /الحالة الحالية/);
});

test('history reprint uses the selected immutable sale and current device receipt profile/settings only', () => {
  const source = fs.readFileSync(
    new URL('../src/pages/CashierHistoryPage.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('const reprintSelectedReceipt = useCallback');
  const end = source.indexOf('\n\n  useEffect(() => {', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /readCashierReceiptPrintSettings\(runtime\.deviceId\)/);
  assert.match(handler, /readCachedCashierReceiptProfile\(runtime\.deviceId\)/);
  assert.match(handler, /sale: selectedSale/);
  assert.match(handler, /paperWidthMm: settings\.paper_width_mm/);
  assert.match(handler, /storeName: profile\.store_name/);
  assert.match(handler, /reprint: true/);
  assert.doesNotMatch(handler, /returnSale|voidSale|syncPending|commitSale|requestCashierSync/);
});

test('history exposes a visible reprint action and F9 for the selected sale', () => {
  const source = fs.readFileSync(
    new URL('../src/pages/CashierHistoryPage.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /receiptLabels\.reprintReceipt/);
  assert.match(source, /receiptLabels\.printShortcut/);
  assert.match(source, /event\.key !== 'F9'/);
  assert.match(source, /reprintSelectedReceipt\(\)/);
  assert.match(source, /addEventListener\('keydown', handleReprintShortcut, true\)/);
  assert.match(source, /disabled=\{busy \|\| Boolean\(confirmAction\)\}/);
});
