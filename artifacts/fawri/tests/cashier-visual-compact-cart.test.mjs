import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../src/pages/CashierPosPage.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(
  new URL('../public/assets/cashier-visual-qa.css', import.meta.url),
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
