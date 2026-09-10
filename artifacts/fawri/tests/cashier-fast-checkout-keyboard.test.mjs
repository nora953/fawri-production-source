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
  assert.match(keyboard, /CASHIER_FAST_CHECKOUT_KEY = 'F8'/);
  assert.doesNotMatch(keyboard, /event\.key\s*===\s*'Enter'/);
  assert.match(keyboard, /dataset\.cashierView === 'pos'/);
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

test('Delete undoes exactly one active cart unit without becoming a clear-cart shortcut', () => {
  assert.match(keyboard, /CASHIER_CART_UNDO_KEY = 'Delete'/);
  assert.match(keyboard, /activeCartDecrementButton/);
  assert.match(keyboard, /if \(!event\.shiftKey\) \{\s*button\.click\(\);\s*return;/s);
  assert.doesNotMatch(keyboard, /Backspace/);
  assert.doesNotMatch(keyboard, /clearCart|تفريغ السلة/);
});

test('Shift+Delete removes only the quantity captured from the current active line', () => {
  assert.match(keyboard, /activeCartQuantity\(initialButton\)/);
  assert.match(keyboard, /index < quantity/);
  assert.match(keyboard, /wholeLineRemovalRunning/);
  assert.match(keyboard, /removeWholeActiveCartLine\(button\)/);
  assert.match(keyboard, /index === 0 \? initialButton : activeCartDecrementButton\(\)/);
});

test('cart Delete yields to text editing and is disabled during checkout or modified shortcuts', () => {
  assert.match(keyboard, /editableTargetOwnsDelete\(event\.target\)/);
  assert.match(keyboard, /target\.isContentEditable/);
  assert.match(keyboard, /HTMLTextAreaElement/);
  assert.match(keyboard, /HTMLSelectElement/);
  assert.match(keyboard, /HTMLInputElement/);
  assert.match(keyboard, /return target\.value\.length > 0/);
  assert.match(keyboard, /event\.defaultPrevented/);
  assert.match(keyboard, /event\.ctrlKey/);
  assert.match(keyboard, /event\.altKey/);
  assert.match(keyboard, /event\.metaKey/);
  assert.match(keyboard, /checkoutIsOpen\(\)/);
});

test('cashier bootstrap installs the fast checkout keyboard layer only on operational POS views', () => {
  assert.match(main, /installCashierFastCheckoutKeyboard/);
  assert.match(main, /!diagnostics && !sync && !history && !reports/);
});
