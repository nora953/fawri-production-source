import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  catalogEditorFormFingerprint,
  catalogEditorHasUnsavedChanges,
} from '../src/lib/catalogEditorSession.ts';
import {
  createEmptyCatalogProductForm,
  createEmptyCatalogVariantDraft,
} from '../src/lib/catalogProductEditor.ts';

const shellSource = await readFile(
  new URL('../src/components/catalog/CatalogEditorShell.tsx', import.meta.url),
  'utf8',
);
const itemTypeSource = await readFile(
  new URL('../src/components/catalog/CatalogItemTypeEditor.tsx', import.meta.url),
  'utf8',
);
const pageSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogPage.tsx', import.meta.url),
  'utf8',
);
const variantSource = await readFile(
  new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url),
  'utf8',
);
const fullscreenCss = await readFile(
  new URL('../src/pages/dashboard/catalogEditorFullscreen.css', import.meta.url),
  'utf8',
);

test('dirty-state contract detects field and variant changes without false positives', () => {
  const form = createEmptyCatalogProductForm();
  const initial = catalogEditorFormFingerprint(form);
  assert.equal(catalogEditorHasUnsavedChanges(initial, form), false);

  const renamed = { ...form, name: 'منتج جديد' };
  assert.equal(catalogEditorHasUnsavedChanges(initial, renamed), true);

  const variant = createEmptyCatalogVariantDraft();
  variant.name = 'Black / S';
  variant.options = [
    { key: 'color', name: 'Color', value: 'Black' },
    { key: 'size', name: 'Size', value: 'S' },
  ];
  const withVariant = { ...form, variants: [variant] };
  assert.equal(catalogEditorHasUnsavedChanges(initial, withVariant), true);
  assert.equal(
    catalogEditorHasUnsavedChanges(catalogEditorFormFingerprint(withVariant), withVariant),
    false,
  );
});

test('full-screen catalog shell owns scrolling and protects unsaved work', () => {
  assert.match(shellSource, /h-\[100dvh\]/);
  assert.match(shellSource, /document\.documentElement/);
  assert.match(shellSource, /body\.style\.overflow = 'hidden'/);
  assert.match(shellSource, /catalogEditorHasUnsavedChanges/);
  assert.match(shellSource, /window\.confirm\(labels\.discard\)/);
  assert.match(shellSource, /event\.key !== 'Escape'/);
  assert.match(shellSource, /data-catalog-primary-input/);
  assert.match(shellSource, /Unsaved changes|تغييرات غير محفوظة/);
  assert.match(fullscreenCss, /overscroll-behavior:\s*contain/);
});

test('create and edit routes use the hardened shell and explicit actions', () => {
  assert.match(pageSource, /CatalogEditorShell/);
  assert.match(pageSource, /title=\{editingId \? copy\.edit : copy\.create\}/);
  assert.match(pageSource, /data-catalog-primary-input="true"/);
  assert.match(pageSource, /saveLabel=\{copy\.save\}/);
  assert.match(pageSource, /onClose=\{\(\) => closeForm\(true\)\}/);
  assert.doesNotMatch(pageSource, /max-w-4xl flex-col overflow-hidden rounded-\[2rem\]/);
});

test('desktop item type selection stays compact and keeps inventory beside product/service choices', () => {
  assert.match(itemTypeSource, /lg:grid-cols-3/);
  assert.match(itemTypeSource, /sm:col-span-2 lg:col-span-1/);
  assert.match(itemTypeSource, /trackInventory/);
  assert.doesNotMatch(itemTypeSource, /space-y-4 rounded-2xl border bg-muted\/10 p-4/);
});

test('RTL examples remain readable inside LTR technical and numeric fields', () => {
  assert.match(fullscreenCss, /input\[dir="ltr"\]::placeholder/);
  assert.match(fullscreenCss, /direction:\s*rtl/);
  assert.match(fullscreenCss, /unicode-bidi:\s*plaintext/);
  assert.match(fullscreenCss, /nth-child\(9\)[\s\S]*align-self:\s*start/);
});

test('variant UX is truthful, bidi-safe, compact, and warns about zero inherited prices', () => {
  assert.match(variantSource, /generatedVariantsCount/);
  assert.match(variantSource, /zeroInheritedPrice/);
  assert.match(variantSource, /inventoryManagedByVariants/);
  assert.match(variantSource, /dir="ltr" className="inline-flex items-center gap-1 rounded-full/);
  assert.match(variantSource, /<bdi>\{option\.name\.trim\(\)\}<\/bdi>/);
  assert.match(variantSource, /<bdi>\{option\.value\.trim\(\)\}<\/bdi>/);
  assert.match(variantSource, /<details className="group rounded-2xl border bg-muted\/10"/);
  assert.match(variantSource, /noOptionsHint/);
  assert.doesNotMatch(variantSource, /\(\{form\.variants\.length\}\{coverage\.expectedCount/);
});