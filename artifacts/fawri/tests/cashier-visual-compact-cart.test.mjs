import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../src/pages/CashierPosPage.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(
  new URL('../public/assets/cashier-visual-qa.css', import.meta.url),
  'utf8',
);

test('compact cart cards expose stable visual hooks without changing cart behavior', () => {
  assert.match(page, /cashier-cart-compact-panel/);
  assert.match(page, /cashier-cart-compact-grid/);
  assert.match(page, /cashier-cart-compact-card/);
  assert.match(page, /cashier-cart-compact-name/);
  assert.match(page, /cashier-cart-compact-meta/);
  assert.match(page, /cashier-cart-compact-qty/);
  assert.match(page, /cashier-cart-compact-price/);
  assert.match(page, /onClick=\{\(\) => setActiveCartKey\(key\)\}/);
});

test('compact cart card text and totals remain contained inside each card', () => {
  assert.match(css, /\.cashier-cart-compact-card \{[\s\S]*min-height: 64px;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.cashier-cart-compact-name \{[\s\S]*-webkit-line-clamp: 2;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /\.cashier-cart-compact-meta \{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);/);
  assert.match(css, /\.cashier-cart-compact-price \{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
});
