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
const workspaceSource = await readFile(
  new URL('../src/pages/dashboard/ProductsWorkspacePage.tsx', import.meta.url),
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
const cardHarmonyCss = await readFile(
  new URL('../src/pages/dashboard/catalogEditorCardHarmony.css', import.meta.url),
  'utf8',
);
const compactCardCss = await readFile(
  new URL('../src/pages/dashboard/productCardCompact.css', import.meta.url),
  'utf8',
);
const baselineCss = await readFile(
  new URL('../src/styles/fawriUiBaseline.css', import.meta.url),
  'utf8',
);
const signupSource = await readFile(
  new URL('../src/pages/SignupPage.tsx', import.meta.url),
  'utf8',
);
const loginSource = await readFile(
  new URL('../src/pages/LoginPage.tsx', import.meta.url),
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

test('catalog fields inherit the reviewed Signup/Login Fawri UI authority', () => {
  assert.match(signupSource, /fieldInputClass = "h-12 rounded-xl"/);
  assert.match(signupSource, /fieldHeaderClass = "flex min-h-5 items-center justify-between gap-3"/);
  assert.match(signupSource, /className="space-y-2"/);
  assert.match(loginSource, /className="h-12 rounded-xl"/);
  assert.match(loginSource, /className="flex min-h-5 items-center justify-between gap-3"/);
  assert.match(baselineCss, /--fawri-control-height:\s*3rem/);
  assert.match(baselineCss, /--fawri-control-radius:\s*0\.75rem/);
  assert.match(baselineCss, /--fawri-field-gap:\s*0\.5rem/);
  assert.match(baselineCss, /--fawri-label-size:\s*0\.875rem/);
  assert.match(shellSource, /catalog-editor-shell fawri-ui-baseline/);
  assert.match(fullscreenCss, /height:\s*var\(--fawri-control-height\) !important/);
  assert.match(fullscreenCss, /font-size:\s*var\(--fawri-label-size\) !important/);
  assert.match(fullscreenCss, /color:\s*hsl\(var\(--foreground\)\)/);
  assert.match(fullscreenCss, /html\[lang="ar"\][\s\S]*Noto Sans Arabic/);
  assert.match(fullscreenCss, /html\[lang="ku"\][\s\S]*Noto Naskh Arabic/);
  assert.match(fullscreenCss, /font-family:\s*"Inter"/);
  assert.match(fullscreenCss, /label:has\(> div > input\)/);
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

test('product cards stay compact without nested inventory scrolling', () => {
  assert.match(workspaceSource, /productCardCompact\.css/);
  assert.match(compactCardCss, /\.grid:has\(> article\)[\s\S]*align-items:\s*start/);
  assert.match(compactCardCss, /article[\s\S]*align-self:\s*start/);
  assert.match(compactCardCss, /max-height:\s*none !important/);
  assert.match(compactCardCss, /overflow:\s*visible !important/);
  assert.doesNotMatch(compactCardCss, /overflow-y:\s*auto/);
  assert.match(compactCardCss, /-webkit-line-clamp:\s*3/);
});

test('variant inventory is collapsed by default and opens only from an explicit details control', () => {
  assert.match(pageSource, /expandedVariantProducts/);
  assert.match(pageSource, /toggleVariantDetails/);
  assert.match(pageSource, /aria-expanded=\{variantsExpanded\}/);
  assert.match(pageSource, /aria-controls=\{variantsPanelId\}/);
  assert.match(pageSource, /copy\.variantDetails/);
  assert.match(pageSource, /copy\.hideVariantDetails/);
  assert.match(pageSource, /variantsExpanded \? \(/);
  assert.match(pageSource, /product\.variants\.map\(variant =>/);
});

test('Fawri availability aligns as a canonical field beside Description', () => {
  assert.match(workspaceSource, /catalogEditorCardHarmony\.css/);
  assert.match(pageSource, /catalog-editor-description-field/);
  assert.match(pageSource, /catalog-editor-fawri-field/);
  assert.match(pageSource, /catalog-editor-fawri-control/);
  assert.match(pageSource, /checked \? 'end-1' : 'start-1'/);
  assert.match(cardHarmonyCss, /catalog-editor-description-field[\s\S]*catalog-editor-fawri-field/);
  assert.match(cardHarmonyCss, /align-self:\s*stretch !important/);
  assert.match(cardHarmonyCss, /min-height:\s*8\.5rem !important/);
  assert.match(cardHarmonyCss, /catalog-editor-fawri-field[\s\S]*padding:\s*0 !important/);
  assert.match(cardHarmonyCss, /catalog-editor-fawri-control[\s\S]*border-radius:\s*0\.75rem !important/);
  assert.match(cardHarmonyCss, /button\[aria-pressed\][\s\S]*width:\s*3\.5rem !important/);
});

test('RTL examples remain readable inside LTR technical and numeric fields', () => {
  assert.match(fullscreenCss, /input\[dir="ltr"\]::placeholder/);
  assert.match(fullscreenCss, /direction:\s*rtl/);
  assert.match(fullscreenCss, /unicode-bidi:\s*plaintext/);
  assert.match(cardHarmonyCss, /catalog-editor-fawri-field[\s\S]*align-items:\s*stretch !important/);
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
