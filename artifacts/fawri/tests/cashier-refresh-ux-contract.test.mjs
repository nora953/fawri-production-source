import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pos = fs.readFileSync(new URL('../src/pages/CashierPosPage.tsx', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../src/pages/dashboard/CommerceCatalogPage.tsx', import.meta.url), 'utf8');
const productDetails = fs.readFileSync(new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url), 'utf8');
const dashboardLayout = fs.readFileSync(new URL('../src/components/layout/DashboardLayout.tsx', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cashierMain = fs.readFileSync(new URL('../src/cashierMain.tsx', import.meta.url), 'utf8');
const merchantCommerceUx = fs.readFileSync(new URL('../src/styles/merchantCommerceUxFixes.css', import.meta.url), 'utf8');

test('automatic cashier catalog refresh stays silent and preserves unchanged catalog state', () => {
  assert.match(pos, /refreshCatalog\(runtime, query, false\)/);
  assert.match(pos, /catalogMatches\(current, next\) \? current : next/);
  assert.match(pos, /if \(visible\) setSearching\(true\)/);
  assert.match(pos, /if \(visible\) setSearching\(false\)/);
});

test('cashier and catalog do not use Arabic thousands separators for merchant money', () => {
  assert.doesNotMatch(pos, /Intl\.NumberFormat\('ar-IQ'/);
  assert.doesNotMatch(catalog, /price_iqd\.toLocaleString\(lang === 'en' \? 'en-US' : 'ar-IQ'\)/);
  assert.match(pos, /formatMerchantMoneyMinor/);
  assert.match(catalog, /formatMerchantMoneyMinor/);
});

test('catalog price inputs do not overlay a legacy hardcoded currency label', () => {
  assert.match(catalog, /const moneyStep = catalogCurrencyStep\(fractionDigits\)/);
  assert.match(catalog, /step=\{moneyStep\} inputMode="decimal" dir="ltr" value=\{form\.current_price\}/);
  assert.match(catalog, /step=\{moneyStep\} inputMode="decimal" dir="ltr" value=\{form\.original_price\}/);
  assert.doesNotMatch(catalog, /pointer-events-none absolute end-3 top-1\/2/);
  assert.doesNotMatch(catalog, /<span[^>]*>\{copy\.currency\}<\/span>/);
});

test('cashier opens beside the merchant dashboard and cashier refresh never reloads the browser', () => {
  assert.match(sidebar, /target="_blank"/);
  assert.match(sidebar, /rel="noopener noreferrer"/);
  assert.match(sidebar, /href=\{item\.href\}/);
  assert.doesNotMatch(dashboardLayout, /window\.location\.reload\(\)/);
  assert.match(dashboardLayout, /setCashierContentRevision\(value => value \+ 1\)/);
  assert.match(dashboardLayout, /key=\{`\$\{location\}:\$\{cashierContentRevision\}`\}/);
});

test('shipping measurement hint spans above aligned weight and dimensions fields', () => {
  const hint = '<p className="text-xs leading-5 text-muted-foreground">{labels.physicalHint}</p>';
  const fieldsGrid = '<div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">';
  const weight = '<span>{labels.weight}</span>';
  const dimensions = '<p className="text-xs font-semibold text-muted-foreground">{labels.dimensions}</p>';

  const hintIndex = productDetails.indexOf(hint);
  const fieldsGridIndex = productDetails.indexOf(fieldsGrid);
  const weightIndex = productDetails.indexOf(weight);
  const dimensionsIndex = productDetails.indexOf(dimensions);

  assert.ok(hintIndex >= 0, 'measurement hint must remain visible');
  assert.ok(fieldsGridIndex > hintIndex, 'measurement fields must start after the full-width hint');
  assert.ok(weightIndex > fieldsGridIndex, 'weight must render inside the aligned fields grid');
  assert.ok(dimensionsIndex > fieldsGridIndex, 'dimensions must render inside the aligned fields grid');
  assert.doesNotMatch(merchantCommerceUx, /input\[placeholder=/, 'measurement geometry must not depend on placeholder CSS selectors');
});

test('confirmation primary action remains direction-aware', () => {
  assert.match(app, /merchantCommerceUxFixes\.css/);
  assert.match(cashierMain, /merchantCommerceUxFixes\.css/);
  assert.match(merchantCommerceUx, /data-cashier-view="history"[\s\S]*flex-direction:\s*row-reverse/);
});
