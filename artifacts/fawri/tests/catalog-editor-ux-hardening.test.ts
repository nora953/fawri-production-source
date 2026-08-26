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
const recoverySource = await readFile(
  new URL('../src/lib/catalogEditorRecovery.ts', import.meta.url),
  'utf8',
);
const editorSource = await readFile(
  new URL('../src/lib/catalogProductEditor.ts', import.meta.url),
  'utf8',
);
const dashboardSource = await readFile(
  new URL('../src/components/layout/DashboardLayout.tsx', import.meta.url),
  'utf8',
);
const itemTypeSource = await readFile(
  new URL('../src/components/catalog/CatalogItemTypeEditor.tsx', import.meta.url),
  'utf8',
);
const pageSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
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
const imageSource = await readFile(
  new URL('../src/components/catalog/CatalogImageUploadEditor.tsx', import.meta.url),
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
});

test('full-screen catalog shell uses Fawri discard UI and does not refocus on dirty changes', () => {
  assert.match(shellSource, /h-\[100dvh\]/);
  assert.match(shellSource, /catalogEditorHasUnsavedChanges/);
  assert.match(shellSource, /AlertDialog/);
  assert.match(shellSource, /discardOpen/);
  assert.doesNotMatch(shellSource, /window\.confirm/);
  assert.match(shellSource, /data-catalog-primary-input/);
  assert.match(shellSource, /\}, \[\]\);/);
  assert.match(fullscreenCss, /overscroll-behavior:\s*contain/);
});

test('new-item recovery remains browser-tab scoped and can carry option-builder progress', () => {
  assert.match(recoverySource, /sessionStorage/);
  assert.doesNotMatch(recoverySource, /localStorage/);
  assert.match(recoverySource, /merchant_id/);
  assert.match(recoverySource, /saveCatalogCreateRecoveryDraft/);
  assert.match(recoverySource, /peekCatalogCreateRecoveryDraft/);
  assert.match(recoverySource, /not catalog authority/i);
  assert.match(editorSource, /peekCatalogCreateRecoveryDraft\(\)/);
  assert.match(shellSource, /saveCatalogCreateRecoveryDraft\(form\)/);
  assert.match(variantSource, /variant_option_rows/);
});

test('merchant dashboard logs out only on authoritative unauthenticated lifecycle result', () => {
  assert.match(dashboardSource, /lifecycle\.reason === 'unauthenticated'/);
  assert.match(dashboardSource, /routeToLogin\(\)/);
  assert.match(dashboardSource, /Connectivity\/server failures are not authentication decisions/);
  assert.match(dashboardSource, /scheduleRetry\(\)/);
  assert.doesNotMatch(
    dashboardSource,
    /if \(!lifecycle\.ok\) \{\s*clearMerchantTabSession\(\)/,
  );
});

test('products workspace stays on the simplified canonical catalog editor', () => {
  assert.match(workspaceSource, /CommerceCatalogSimplifiedPage/);
  assert.match(pageSource, /CatalogEditorShell/);
  assert.match(pageSource, /data-catalog-primary-input="true"/);
  assert.match(pageSource, /input\.compare_at_price_iqd = null/);
  assert.match(baselineCss, /--fawri-control-height:\s*3rem/);
});

test('inventory tracking and Fawri replies share one compact item settings card', () => {
  assert.match(itemTypeSource, /itemSettings/);
  assert.match(itemTypeSource, /track_inventory/);
  assert.match(itemTypeSource, /allow_fawri_reply/);
  assert.match(itemTypeSource, /SettingRow/);
  assert.match(itemTypeSource, /lg:grid-cols-3/);
  assert.match(cardHarmonyCss, /catalog-editor-fawri-field[\s\S]*display:\s*none/);
});

test('multi-option product entry is category-neutral and generated from one option list', () => {
  assert.match(variantSource, /multiProduct/);
  assert.match(variantSource, /خيارات المنتج/);
  assert.match(variantSource, /السعة/);
  assert.match(variantSource, /النكهة/);
  assert.match(variantSource, /splitValues/);
  assert.match(variantSource, /regenerateCatalogVariantDrafts/);
  assert.match(variantSource, /variant_option_rows/);
  assert.match(variantSource, /generateSku/);
  assert.doesNotMatch(variantSource, /Shirt/);
  assert.doesNotMatch(variantSource, /clothingSetup/);
  assert.doesNotMatch(variantSource, /إعداد سريع للملابس/);
  assert.doesNotMatch(variantSource, /الألوان والمقاسات والمتغيرات/);
});

test('variant rows inherit general price, cost and images unless explicitly overridden', () => {
  assert.match(variantSource, /inheritedSale/);
  assert.match(variantSource, /inheritedCost/);
  assert.match(variantSource, /inheritedImage/);
  assert.match(variantSource, /inheritanceTitle/);
  assert.match(variantSource, /variant\.price_iqd/);
  assert.match(variantSource, /variant\.cost_iqd/);
  assert.match(variantSource, /variant\.image_refs\.length === 0/);
  assert.match(variantSource, /bulkStock/);
  assert.match(variantSource, /applyBulkStock/);
});

test('generated combinations are grouped by the first option with safe group bulk actions', () => {
  assert.match(variantSource, /function variantGroups/);
  assert.match(variantSource, /structuredOptions\(variant\)\[0\]/);
  assert.match(variantSource, /group\.optionName/);
  assert.match(variantSource, /group\.optionValue/);
  assert.match(variantSource, /applyGroupField/);
  assert.match(variantSource, /applyGroupImages/);
  assert.match(variantSource, /copyGroupData/);
  assert.match(variantSource, /secondarySignature/);
  assert.match(variantSource, /price_iqd: matching\.price_iqd/);
  assert.match(variantSource, /cost_iqd: matching\.cost_iqd/);
  assert.match(variantSource, /image_refs: cloneImages\(matching\.image_refs\)/);
  assert.doesNotMatch(variantSource, /sku: matching\.sku/);
  assert.doesNotMatch(variantSource, /barcode: matching\.barcode/);
  assert.match(variantSource, /groupImagesHint/);
  assert.match(variantSource, /variantTable\(group\.indexes, true\)/);
});

test('catalog image editor stays compact and fetches protected previews before rendering img', () => {
  assert.match(imageSource, /catalogImagePreviewUrl/);
  assert.match(imageSource, /protectedPreviewRequest/);
  assert.match(imageSource, /await fetch\(protectedRequest/);
  assert.match(imageSource, /URL\.createObjectURL/);
  assert.match(imageSource, /multiple/);
  assert.match(imageSource, /lightboxIndex/);
  assert.doesNotMatch(imageSource, /min-h-32/);
});

test('product cards remain compact without nested inventory scrolling', () => {
  assert.match(workspaceSource, /productCardCompact\.css/);
  assert.match(compactCardCss, /align-items:\s*start/);
  assert.match(compactCardCss, /align-self:\s*start/);
  assert.doesNotMatch(compactCardCss, /overflow-y:\s*auto/);
});
