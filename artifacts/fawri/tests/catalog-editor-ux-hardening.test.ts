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

test('full-screen catalog shell uses Fawri discard UI and does not refocus on dirty changes', () => {
  assert.match(shellSource, /h-\[100dvh\]/);
  assert.match(shellSource, /document\.documentElement/);
  assert.match(shellSource, /body\.style\.overflow = 'hidden'/);
  assert.match(shellSource, /catalogEditorHasUnsavedChanges/);
  assert.match(shellSource, /AlertDialog/);
  assert.match(shellSource, /discardOpen/);
  assert.match(shellSource, /keepEditing/);
  assert.match(shellSource, /discardAction/);
  assert.doesNotMatch(shellSource, /window\.confirm/);
  assert.match(shellSource, /data-catalog-primary-input/);
  assert.match(shellSource, /\}, \[\]\);/);
  assert.match(shellSource, /event\.key !== 'Escape'/);
  assert.match(fullscreenCss, /overscroll-behavior:\s*contain/);
});

test('new-item recovery is browser-tab scoped, merchant scoped and never catalog authority', () => {
  assert.match(recoverySource, /sessionStorage/);
  assert.doesNotMatch(recoverySource, /localStorage/);
  assert.match(recoverySource, /merchant_id/);
  assert.match(recoverySource, /RECOVERY_TTL_MS/);
  assert.match(recoverySource, /saveCatalogCreateRecoveryDraft/);
  assert.match(recoverySource, /clearCatalogCreateRecoveryDraft/);
  assert.match(recoverySource, /peekCatalogCreateRecoveryDraft/);
  assert.match(recoverySource, /not catalog authority/i);
  assert.match(editorSource, /peekCatalogCreateRecoveryDraft\(\)/);
  assert.match(editorSource, /if \(recovered\) return recovered/);
  assert.match(shellSource, /saveCatalogCreateRecoveryDraft\(form\)/);
  assert.match(shellSource, /clearCatalogCreateRecoveryDraft\(\)/);
});

test('merchant dashboard logs out only on authoritative unauthenticated lifecycle result', () => {
  assert.match(dashboardSource, /lifecycle\.reason === 'unauthenticated'/);
  assert.match(dashboardSource, /routeToLogin\(\)/);
  assert.match(dashboardSource, /Connectivity\/server failures are not authentication decisions/);
  assert.match(dashboardSource, /transientFailures \+= 1/);
  assert.match(dashboardSource, /scheduleRetry\(\)/);
  assert.match(dashboardSource, /lifecyclePollDelay/);
  assert.doesNotMatch(
    dashboardSource,
    /if \(!lifecycle\.ok\) \{\s*clearMerchantTabSession\(\)/,
  );
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
});

test('products workspace uses the simplified canonical catalog editor', () => {
  assert.match(workspaceSource, /CommerceCatalogSimplifiedPage/);
  assert.match(pageSource, /CatalogEditorShell/);
  assert.match(pageSource, /title=\{editingId \? copy\.edit : copy\.create\}/);
  assert.match(pageSource, /data-catalog-primary-input="true"/);
  assert.match(pageSource, /saveLabel=\{copy\.save\}/);
  assert.match(pageSource, /onClose=\{\(\) => closeForm\(true\)\}/);
  assert.doesNotMatch(pageSource, /compare_at_price_iqd[^=]*=\s*form\.original_price/);
});

test('desktop item type selection stays compact and keeps inventory beside product/service choices', () => {
  assert.match(itemTypeSource, /lg:grid-cols-3/);
  assert.match(itemTypeSource, /sm:col-span-2 lg:col-span-1/);
  assert.match(itemTypeSource, /trackInventory/);
});

test('product cards stay compact without nested inventory scrolling', () => {
  assert.match(workspaceSource, /productCardCompact\.css/);
  assert.match(compactCardCss, /\.grid:has\(> article\)[\s\S]*align-items:\s*start/);
  assert.match(compactCardCss, /article[\s\S]*align-self:\s*start/);
  assert.match(compactCardCss, /max-height:\s*none !important/);
  assert.match(compactCardCss, /overflow:\s*visible !important/);
  assert.doesNotMatch(compactCardCss, /overflow-y:\s*auto/);
});

test('all tracked product cards share one collapsed inventory disclosure pattern', () => {
  assert.match(pageSource, /expandedInventoryProducts/);
  assert.match(pageSource, /toggleInventoryDetails/);
  assert.match(pageSource, /aria-expanded=\{inventoryExpanded\}/);
  assert.match(pageSource, /aria-controls=\{inventoryPanelId\}/);
  assert.match(pageSource, /inventoryExpanded && \(/);
  assert.match(pageSource, /product\.variants\.map\(variant =>/);
});

test('Fawri availability remains an explicit field separate from inventory tracking', () => {
  assert.match(workspaceSource, /catalogEditorCardHarmony\.css/);
  assert.match(pageSource, /catalog-editor-description-field/);
  assert.match(pageSource, /catalog-editor-fawri-field/);
  assert.match(pageSource, /catalog-editor-fawri-control/);
  assert.match(pageSource, /allow_fawri_reply/);
  assert.match(itemTypeSource, /track_inventory/);
  assert.match(cardHarmonyCss, /catalog-editor-description-field[\s\S]*catalog-editor-fawri-field/);
});

test('clothing variants use one bulk option matrix with inherited price/cost and batch fields', () => {
  assert.match(variantSource, /clothingSetup/);
  assert.match(variantSource, /اللون/);
  assert.match(variantSource, /المقاس/);
  assert.match(variantSource, /splitValues/);
  assert.match(variantSource, /regenerateCatalogVariantDrafts/);
  assert.match(variantSource, /generate/);
  assert.match(variantSource, /bulkStock/);
  assert.match(variantSource, /applyStock/);
  assert.match(variantSource, /generateSku/);
  assert.match(variantSource, /inheritedSale/);
  assert.match(variantSource, /inheritedCost/);
  assert.match(variantSource, /CatalogImageUploadEditor/);
  assert.match(variantSource, /advancedHint/);
  assert.doesNotMatch(variantSource, /VariantCombinationEditor/);
});

test('catalog image editor is compact and derives previews from server storage keys', () => {
  assert.match(imageSource, /catalogImagePreviewUrl/);
  assert.match(imageSource, /storage_key/);
  assert.match(imageSource, /multiple/);
  assert.match(imageSource, /lightbox|preview/i);
  assert.doesNotMatch(imageSource, /min-h-32/);
});
