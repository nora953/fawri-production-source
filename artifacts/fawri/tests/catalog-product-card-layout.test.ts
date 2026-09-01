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
  assert.match(cardStyles, /@media \(min-width: 1280px\)[\s\S]*\[data-catalog-summary-card="true"\]\s*\{[\s\S]*height:\s*18\.75rem !important[\s\S]*min-height:\s*18\.75rem !important/);
  assert.match(cardStyles, /grid-template-rows:\s*4\.75rem 3\.25rem 4rem 0\.75rem 3rem/);
  assert.match(cardStyles, /> :nth-child\(2\)[\s\S]*height:\s*3\.25rem[\s\S]*align-content:\s*start/);
  assert.match(cardStyles, /> :nth-child\(3\)[\s\S]*height:\s*4rem/);
  assert.match(cardStyles, /> :last-child[\s\S]*height:\s*3rem/);
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

test('summary cards keep SKU out of sight and variant facts inside the wrapping badge row', () => {
  assert.match(cardStyles, /> :first-child > p\[dir="ltr"\][\s\S]*display:\s*none/);
  assert.match(cardStyles, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(cardStyles, /> :nth-child\(2\)[\s\S]*grid-column:\s*1[\s\S]*grid-row:\s*2[\s\S]*width:\s*100%/);

  const cardStart = pageSource.indexOf('data-catalog-summary-card="true"');
  const dialogStart = pageSource.indexOf('<Dialog open={Boolean(detailsProduct)}');
  assert.ok(cardStart >= 0 && dialogStart > cardStart);
  const cards = pageSource.slice(cardStart, dialogStart);

  assert.match(cards, /hasVariants \? \([\s\S]*<Badge[\s\S]*\{copy\.variants\}: \{product\.variants\.length\}/);
  assert.match(cards, /type === 'service' \? \([\s\S]*\{copy\.booking\}:/);
  assert.doesNotMatch(cards, /'\\u00a0'/);

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

test('details dialog presents inventory read-only and routes changes through edit', () => {
  assert.match(cardStyles, /Product details are presentation-only/);
  assert.doesNotMatch(cardStyles, /\.products-workspace-polish \[role="dialog"\]/);
  const readOnlyRule = cardStyles.match(
    /\[role="dialog"\] \[class~="grid-cols-\[auto_1fr_auto_auto\]"\] \{[\s\S]*?\n\}/,
  )?.[0] || '';
  assert.match(readOnlyRule, /display:\s*none !important/);

  const dialogStart = pageSource.indexOf('<Dialog open={Boolean(detailsProduct)}');
  assert.ok(dialogStart >= 0);
  const dialog = pageSource.slice(dialogStart);
  assert.match(dialog, /<InventoryControl/);
  assert.match(dialog, /setDetailsProductId\(null\);[\s\S]*openEdit\(product\);/);
});

test('read-only variant cards center name option summary and quantity as one unit', () => {
  const summaryRule = cardStyles.match(
    /\[role="dialog"\] \.rounded-xl\.border\.bg-background\.p-3 > \.mb-2\.flex\.items-start\.justify-between\.gap-3 \{[\s\S]*?\n\}/,
  )?.[0] || '';
  assert.match(summaryRule, /flex-direction:\s*column/);
  assert.match(summaryRule, /align-items:\s*center !important/);
  assert.match(summaryRule, /justify-content:\s*center !important/);
  assert.match(summaryRule, /text-align:\s*center/);

  const labelRule = cardStyles.match(
    /\[role="dialog"\] \.rounded-xl\.border\.bg-background\.p-3 > \.mb-2\.flex\.items-start\.justify-between\.gap-3 > :first-child \{[\s\S]*?\n\}/,
  )?.[0] || '';
  assert.match(labelRule, /width:\s*100%/);
  assert.match(labelRule, /text-align:\s*center/);

  const quantityRule = cardStyles.match(
    /\[role="dialog"\] \.rounded-xl\.border\.bg-background\.p-3 > \.mb-2\.flex\.items-start\.justify-between\.gap-3 > :last-child \{[\s\S]*?\n\}/,
  )?.[0] || '';
  assert.match(quantityRule, /min-width:\s*2\.5rem/);
  assert.match(quantityRule, /align-items:\s*center/);
  assert.match(quantityRule, /justify-content:\s*center/);
  assert.match(quantityRule, /text-align:\s*center/);
  assert.match(quantityRule, /align-self:\s*center/);

  assert.doesNotMatch(cardStyles, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(6rem, 0\.28fr\)/);
});
