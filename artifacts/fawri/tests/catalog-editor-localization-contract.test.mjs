import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const central = read('../src/lib/translations/features/catalog/catalogEditorCopy.ts');
const page = read('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx');
const details = read('../src/components/catalog/CatalogProductDetailsEditor.tsx');
const itemType = read('../src/components/catalog/CatalogItemTypeEditor.tsx');
const shell = read('../src/components/catalog/CatalogEditorShell.tsx');
const images = read('../src/components/catalog/CatalogImageUploadEditor.tsx');

test('catalog editor copy has one feature authority instead of local dictionaries', () => {
  for (const source of [page, details, itemType, shell, images]) assert.match(source, /catalogEditorCopy/);
  assert.doesNotMatch(page, /const COPY: Record<Lang/);
  assert.doesNotMatch(details, /const copy = \{/);
  assert.doesNotMatch(itemType, /const COPY: Record<Lang/);
  assert.doesNotMatch(shell, /const copy = \{/);
  assert.doesNotMatch(images, /const copy = \{/);
});

test('approved sale-price editor layout is language-neutral', () => {
  assert.match(central, /basePrice: 'سعر البيع'/);
  assert.match(central, /basePrice: 'Sale price'/);
  assert.match(central, /basePrice: 'نرخی فرۆشتن'/);
  assert.doesNotMatch(page, /copy\.basePriceHint/);
  assert.match(page, /md:grid-cols-3/);
});

test('variant terminology is aligned in Arabic English and Sorani', () => {
  assert.match(central, /combinations: 'أنواع المنتج'/);
  assert.match(central, /combination: 'النوع'/);
  assert.match(central, /actions: 'حذف'/);
  assert.match(central, /combinations: 'Product variants'/);
  assert.match(central, /combination: 'Variant'/);
  assert.match(central, /actions: 'Delete'/);
  assert.match(central, /combinations: 'جۆرەکانی بەرهەم'/);
  assert.match(central, /combination: 'جۆر'/);
  assert.match(central, /actions: 'سڕینەوە'/);
  assert.doesNotMatch(central, /'Product combinations'|'Generate \/ update combinations'|'Combination image — optional'|'Stock per combination'|'Generate combination SKUs'/);
  assert.doesNotMatch(central, /تێکەڵە/);
});

test('all three languages use the same product-editor structure', () => {
  assert.match(page, /<CatalogItemTypeEditor lang=\{lang\}/);
  assert.match(page, /<CatalogProductDetailsEditor lang=\{lang\}/);
  assert.ok((central.match(/\bar:\s*\{/g) || []).length >= 5);
  assert.ok((central.match(/\bku:\s*\{/g) || []).length >= 5);
  assert.ok((central.match(/\ben:\s*\{/g) || []).length >= 5);
});
