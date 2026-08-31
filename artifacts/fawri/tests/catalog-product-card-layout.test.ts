import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
  'utf8',
);

test('catalog summary cards keep one stable compact footprint', () => {
  assert.match(pageSource, /grid auto-rows-fr gap-4 lg:grid-cols-2 2xl:grid-cols-3/);
  assert.match(pageSource, /data-catalog-summary-card="true"/);
  assert.match(pageSource, /className="flex h-full min-h-\[17rem\]/);
  assert.doesNotMatch(pageSource, /expandedInventoryProducts/);
  assert.doesNotMatch(pageSource, /toggleInventoryDetails/);
});

test('product media stays physically left while localized content keeps its own direction', () => {
  assert.match(pageSource, /data-catalog-summary-card="true"[\s\S]*dir="ltr"/);
  assert.match(pageSource, /className="relative w-32 shrink-0 overflow-hidden border-r bg-muted\/20 sm:w-36"/);
  assert.match(pageSource, /<div dir=\{dir\} className=\{`flex min-w-0 flex-1 flex-col p-4/);
  assert.match(pageSource, /className="h-full w-full object-cover"/);
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
