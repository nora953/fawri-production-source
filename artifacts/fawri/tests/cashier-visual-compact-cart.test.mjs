import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../src/pages/CashierPosPage.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(
  new URL('../public/assets/cashier-visual-qa.css', import.meta.url),
  'utf8',
);
const cashierPosCss = fs.readFileSync(
  new URL('../src/styles/cashierPos.css', import.meta.url),
  'utf8',
);

test('compact cart cards expose stable visual hooks without changing item selection behavior', () => {
  assert.match(page, /cashier-cart-compact-panel/);
  assert.match(page, /cashier-cart-compact-grid/);
  assert.match(page, /cashier-cart-compact-card/);
  assert.match(page, /cashier-cart-compact-name/);
  assert.match(page, /cashier-cart-compact-meta/);
  assert.match(page, /cashier-cart-compact-qty/);
  assert.match(page, /cashier-cart-compact-price/);
  assert.match(page, /onClick=\{\(\) => setActiveCartKey\(key\)\}/);
});

test('compact cart pages at four items so the strip never tries to cram the whole cart into one row', () => {
  assert.match(page, /const COMPACT_ITEMS_PER_PAGE = 4;/);
  assert.match(page, /compactPageCount > 1/);
  assert.match(page, /setCompactPage\(page => \(page - 1 \+ compactPageCount\) % compactPageCount\)/);
  assert.match(page, /setCompactPage\(page => \(page \+ 1\) % compactPageCount\)/);
});

test('compact cart card text, quantity and totals remain contained and readable', () => {
  assert.match(css, /\.cashier-cart-compact-panel \{[\s\S]*min-height: 92px;[\s\S]*overflow: hidden !important;/);
  assert.match(css, /\.cashier-cart-compact-grid \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important;/);
  assert.match(css, /\.cashier-cart-compact-card \{[\s\S]*min-height: 68px;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.cashier-cart-compact-name \{[\s\S]*-webkit-line-clamp: 2;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /\.cashier-cart-compact-meta \{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*overflow: hidden;/);
  assert.match(css, /\.cashier-cart-compact-price \{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(css, /scrollbar-width: none;/);
});

test('legacy cashierPos geometry cannot clip the two-row compact cards', () => {
  assert.match(cashierPosCss, /grid-template-rows: minmax\(128px, 1fr\) auto;/);
  assert.match(cashierPosCss, /> div:nth-child\(2\) \{[\s\S]*height: auto !important;[\s\S]*min-height: 92px !important;/);
  assert.match(cashierPosCss, /> div:nth-child\(2\) > div:first-child \{[\s\S]*display: flex !important;/);
  assert.match(cashierPosCss, /> div:last-child > div \{[\s\S]*height: auto !important;[\s\S]*min-height: 68px;[\s\S]*overflow: hidden !important;/);
  assert.doesNotMatch(cashierPosCss, /grid-template-rows: minmax\(128px, 1fr\) 70px;/);
  assert.doesNotMatch(cashierPosCss, /height: 58px !important;/);
  assert.doesNotMatch(cashierPosCss, /flex: 0 0 104px !important;/);
  assert.doesNotMatch(cashierPosCss, /scrollbar-color: #94a3b8 #e2e8f0;/);
});
