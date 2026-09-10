import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const keyboard = fs.readFileSync(
  new URL('../src/lib/cashierFastCheckoutKeyboard.ts', import.meta.url),
  'utf8',
);
const main = fs.readFileSync(
  new URL('../src/cashierMain.tsx', import.meta.url),
  'utf8',
);

test('F8 opens only the enabled POS checkout action and never overloads scanner Enter', () => {
  assert.match(keyboard, /event\.key !== 'F8'/);
  assert.doesNotMatch(keyboard, /event\.key\s*===\s*'Enter'/);
  assert.match(keyboard, /dataset\.cashierView !== 'pos'/);
  assert.match(keyboard, /data-cashier-checkout=\\"open\\"/);
  assert.match(keyboard, /!button\.disabled/);
  assert.match(keyboard, /button\.click\(\)/);
  assert.match(keyboard, /preventDefault\(\)/);
  assert.match(keyboard, /stopPropagation\(\)/);
});

test('F8 checkout lookup follows the active cashier language instead of hard-coded text', () => {
  assert.match(keyboard, /readStoredCashierLanguage\(\)/);
  assert.match(keyboard, /CASHIER_POS_ENHANCEMENT_COPY/);
  assert.match(keyboard, /\.checkout/);
  assert.doesNotMatch(keyboard, /'الدفع'|'Pay'|'پارەدان'/);
});

test('cashier bootstrap installs the fast checkout keyboard layer only on operational POS views', () => {
  assert.match(main, /installCashierFastCheckoutKeyboard/);
  assert.match(main, /!diagnostics && !sync && !history && !reports/);
});
