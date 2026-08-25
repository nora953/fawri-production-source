import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardCss = await readFile(
  new URL('../src/pages/dashboard/productCardCompact.css', import.meta.url),
  'utf8',
);
const pageSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogPage.tsx', import.meta.url),
  'utf8',
);

test('catalog cards never hide inventory behind nested scrolling', () => {
  assert.match(cardCss, /max-height:\s*none !important/);
  assert.match(cardCss, /overflow:\s*visible !important/);
  assert.doesNotMatch(cardCss, /overflow-y:\s*auto/);
  assert.doesNotMatch(cardCss, /max-height:\s*11rem/);
});

test('every tracked product uses the same collapsed inventory disclosure', () => {
  assert.match(pageSource, /expandedInventoryProducts/);
  assert.match(pageSource, /const inventoryExpanded = Boolean\(expandedInventoryProducts\[product\.id\]\)/);
  assert.match(pageSource, /aria-expanded=\{inventoryExpanded\}/);
  assert.match(pageSource, /onClick=\{\(\) => toggleInventoryDetails\(product\.id\)\}/);
  assert.match(pageSource, /inventoryExpanded && \(/);
  assert.match(pageSource, /inventoryDetails: 'تفاصيل المخزون'/);
  assert.match(pageSource, /variantDetails: 'تفاصيل الأنواع'/);
  assert.doesNotMatch(pageSource, /hasVariants && \(\s*<Button/);
});

test('variant and simple product controls render only inside the disclosed inventory panel', () => {
  assert.match(pageSource, /inventoryExpanded && \([\s\S]*hasVariants \? product\.variants\.map/);
  assert.match(pageSource, /return <InventoryControl copy=\{copy\} product=\{product\}/);
  assert.match(pageSource, /product\.variants\.map\(variant =>/);
});

test('expanded inventory rows stay compact and responsive', () => {
  assert.match(cardCss, /grid-template-columns:\s*minmax\(7\.5rem, 0\.8fr\) minmax\(14rem, 1\.2fr\)/);
  assert.match(cardCss, /grid-template-columns:\s*2\.25rem minmax\(4\.75rem, 1fr\) auto 2\.25rem/);
  assert.match(cardCss, /@media \(max-width: 720px\)/);
});

test('inventory operations remain canonical after disclosure', () => {
  assert.match(pageSource, /setInventory\(product, variant\)/);
  assert.match(pageSource, /adjustInventory\(product, delta, variant\)/);
  assert.match(pageSource, /setInventory\(product\)/);
  assert.match(pageSource, /adjustInventory\(product, delta\)/);
  assert.match(pageSource, /setCatalogInventory/);
  assert.match(pageSource, /adjustCatalogInventory/);
});
