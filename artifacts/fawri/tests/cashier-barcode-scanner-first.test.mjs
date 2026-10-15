import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('scanner buffer recognizes fast hardware-style scans and supports Enter or Tab suffix', async () => {
  const scanner = await source('src/lib/cashierBarcodeScanner.ts');

  assert.match(scanner, /MAX_INTER_KEY_GAP_MS = 90/);
  assert.match(scanner, /MAX_AVERAGE_GAP_MS = 65/);
  assert.match(scanner, /MAX_TOTAL_DURATION_MS = 900/);
  assert.match(scanner, /MIN_SCAN_LENGTH = 4/);
  assert.match(scanner, /gap > MAX_INTER_KEY_GAP_MS/);
  assert.match(scanner, /averageGap > MAX_AVERAGE_GAP_MS/);
  assert.match(scanner, /key === 'Enter' \|\| key === 'Tab'/);
});

test('cashier listens for scanner input globally on the sale screen', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');

  assert.match(page, /window\.addEventListener\('keydown', handleScannerKey, true\)/);
  assert.match(page, /completeCashierScannerBuffer/);
  assert.match(page, /appendCashierScannerKey/);
  assert.match(page, /runtime\.lookupExact\(value\)/);
  assert.match(page, /addItem\(exact\)/);
  assert.match(page, /setQuery\(''\)/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /event\.stopPropagation\(\)/);
});

test('scanner is disabled while checkout is open so barcode digits cannot enter cash received', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');
  const modal = await source('src/components/cashier/CashierCheckoutModal.tsx');

  assert.match(page, /if \(!runtime \|\| checkoutOpen\) return/);
  assert.match(page, /\[addExactCode, checkoutOpen, runtime\]/);
  assert.match(modal, /id="cashier-cash-received"/);
  assert.match(modal, /data-cashier-checkout="open"/);
});

test('duplicate or unknown scanner identities fail visibly instead of selecting an arbitrary item', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');
  const runtime = await source('src/lib/cashierPosBaseRuntime.ts');

  assert.match(runtime, /await authority\.lookupByBarcode\(normalized\)/);
  assert.match(runtime, /await authority\.lookupBySku\(normalized\)/);
  assert.match(page, /CASHIER_BARCODE_AMBIGUOUS/);
  assert.match(page, /CASHIER_SKU_AMBIGUOUS/);
  assert.match(page, /extra\.scannerAmbiguous/);
  assert.match(page, /extra\.scannerNotFound/);
});

test('main sale screen keeps payment controls out of the cart footer', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');
  const footerStart = page.indexOf('<div className="shrink-0 border-t border-slate-100 bg-white p-3">');
  const modalStart = page.indexOf('<CashierCheckoutModal');
  const footer = page.slice(footerStart, modalStart);

  assert.ok(footerStart >= 0 && modalStart > footerStart);
  assert.match(footer, /extra\.checkout/);
  assert.doesNotMatch(footer, /labels\.paymentMethod/);
  assert.doesNotMatch(footer, /cashier-cash-received/);
  assert.doesNotMatch(footer, /externalPaymentConfirmed/);
});
