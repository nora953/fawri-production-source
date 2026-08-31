import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
  'utf8',
);
const cardStyles = await readFile(
  new URL('../src/styles/catalogSummaryCards.css', import.meta.url),
  'utf8',
);

test('catalog summary cards keep one stable compact footprint and three-column desktop density', () => {
  assert.match(pageSource, /data-catalog-summary-card="true"/);
  assert.match(cardStyles, /\[data-catalog-summary-card="true"\]\s*\{[\s\S]*min-height:\s*12\.25rem/);
  assert.match(cardStyles, /@media \(min-width: 1280px\)/);
  assert.match(cardStyles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(pageSource, /expandedInventoryProducts/);
  assert.doesNotMatch(pageSource, /toggleInventoryDetails/);
});

test('summary cards hide product media while the details dialog keeps the product image', () => {
  assert.match(cardStyles, /\[data-catalog-summary-card="true"\] > :first-child\s*\{[\s\S]*display:\s*none/);

  const cardStart = pageSource.indexOf('data-catalog-summary-card="true"');
  const dialogStart = pageSource.indexOf('<Dialog open={Boolean(detailsProduct)}');
  assert.ok(cardStart >= 0 && dialogStart > cardStart);

  const dialog = pageSource.slice(dialogStart);
  assert.match(dialog, /detailsProduct\.image_refs\[0\]/);
  assert.match(dialog, /<CatalogProtectedImage/);
});

test('summary cards keep SKU out of sight and align compact variant facts with status chips', () => {
  assert.match(cardStyles, /> :first-child > p\[dir="ltr"\][\s\S]*display:\s*none/);
  assert.match(cardStyles, /> :nth-child\(2\)[\s\S]*grid-row:\s*2/);
  assert.match(cardStyles, /> \[dir\] > p\s*\{[\s\S]*grid-column:\s*2[\s\S]*grid-row:\s*2/);
  assert.match(cardStyles, /border-radius:\s*9999px/);

  const cardStart = pageSource.indexOf('data-catalog-summary-card="true"');
  const dialogStart = pageSource.indexOf('<Dialog open={Boolean(detailsProduct)}');
  assert.ok(cardStart >= 0 && dialogStart > cardStart);
  const cards = pageSource.slice(cardStart, dialogStart);
  assert.match(cards, /product\.sku/);

  const dialog = pageSource.slice(dialogStart);
  assert.match(dialog, /detailsProduct\.sku/);
});

test('card keeps only summary facts and opens product details in a dialog', () => {
  assert.match(pageSource, /details: 'التفاصيل'/);
  assert.match(pageSource, /onClick=\{\(\) => setDetailsProductId\(product\.id\)\}/);
  assert.match(pageSource, /<Eye className="me-1\.5 h-4 w-4" \/>/);
  assert.match(pageSource, /<Dialog open=\{Boolean\(detailsProduct\)\}/);
  assert.match(pageSource, /detailsProduct\.description \|\| copy\.descriptionMissing/);

  const cardStart = pageSource.indexOf('data-catalog-summary-card="true"');
  const dialogStart = pageSource.indexOf('<Dialog open={Boolean(detailsProduct)}');
  assert.ok(cardStart >= 0 && dialogStart > cardStart);
  const cards = pageSource.slice(cardStart, dialogStart);
  assert.doesNotMatch(cards, /product\.description/);
});

test('small card actions stay separate from the full details action', () => {
  assert.match(pageSource, /title=\{copy\.edit\}[\s\S]*<Pencil className="h-4 w-4"/);
  assert.match(pageSource, /title=\{copy\.deleteConfirm\}[\s\S]*<Trash2 className="h-4 w-4"/);
  assert.match(pageSource, /variant="outline"[\s\S]*setDetailsProductId\(product\.id\)[\s\S]*copy\.details/);
});

test('inventory operations remain canonical inside the details modal', () => {
  assert.match(pageSource, /detailsProduct\.variants\.length > 0 \? detailsProduct\.variants\.map\(variant =>/);
  assert.match(pageSource, /setInventory\(detailsProduct, variant\)/);
  assert.match(pageSource, /adjustInventory\(detailsProduct, delta, variant\)/);
  assert.match(pageSource, /setInventory\(detailsProduct\)/);
  assert.match(pageSource, /adjustInventory\(detailsProduct, delta\)/);
  assert.match(pageSource, /setCatalogInventory/);
  assert.match(pageSource, /adjustCatalogInventory/);
});
