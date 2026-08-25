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

test('catalog cards never hide variant inventory behind nested scrolling', () => {
  assert.match(cardCss, /max-height:\s*none !important/);
  assert.match(cardCss, /overflow:\s*visible !important/);
  assert.doesNotMatch(cardCss, /overflow-y:\s*auto/);
  assert.doesNotMatch(cardCss, /max-height:\s*11rem/);
});

test('desktop variant inventory rows use compact side-by-side layout', () => {
  assert.match(cardCss, /grid-template-columns:\s*minmax\(7\.5rem, 0\.8fr\) minmax\(14rem, 1\.2fr\)/);
  assert.match(cardCss, /grid-template-columns:\s*2\.25rem minmax\(4\.75rem, 1fr\) auto 2\.25rem/);
  assert.match(cardCss, /@media \(max-width: 720px\)/);
});

test('inventory operations remain canonical and fully rendered for every variant', () => {
  assert.match(pageSource, /product\.variants\.map\(variant =>/);
  assert.match(pageSource, /setInventory\(product, variant\)/);
  assert.match(pageSource, /adjustInventory\(product, delta, variant\)/);
});
