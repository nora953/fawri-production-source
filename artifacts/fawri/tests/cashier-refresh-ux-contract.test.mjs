import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pos = fs.readFileSync(new URL('../src/pages/CashierPosPage.tsx', import.meta.url), 'utf8');
const history = fs.readFileSync(new URL('../src/pages/CashierHistoryPage.tsx', import.meta.url), 'utf8');
const reports = fs.readFileSync(new URL('../src/pages/CashierReportsPage.tsx', import.meta.url), 'utf8');
const syncPage = fs.readFileSync(new URL('../src/pages/CashierCatalogSyncPage.tsx', import.meta.url), 'utf8');
const productsRoute = fs.readFileSync(new URL('../src/pages/dashboard/ProductsPage.tsx', import.meta.url), 'utf8');
const productsWorkspace = fs.readFileSync(new URL('../src/pages/dashboard/ProductsWorkspacePage.tsx', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../src/pages/dashboard/CommerceCatalogPage.tsx', import.meta.url), 'utf8');
const orders = fs.readFileSync(new URL('../src/pages/dashboard/ServerOrdersPage.tsx', import.meta.url), 'utf8');
const productDetails = fs.readFileSync(new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url), 'utf8');
const dashboardLayout = fs.readFileSync(new URL('../src/components/layout/DashboardLayout.tsx', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
const bottomNav = fs.readFileSync(new URL('../src/components/layout/BottomNav.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cashierMain = fs.readFileSync(new URL('../src/cashierMain.tsx', import.meta.url), 'utf8');
const cashierCopy = fs.readFileSync(new URL('../src/lib/translations/features/lib/cashierUiCopy.ts', import.meta.url), 'utf8');
const cashierCopyAlias = fs.readFileSync(new URL('../src/lib/cashierUiCopy.ts', import.meta.url), 'utf8');
const posEnhancementCopy = fs.readFileSync(new URL('../src/lib/translations/features/lib/cashierPosEnhancementCopy.ts', import.meta.url), 'utf8');
const posEnhancementCopyAlias = fs.readFileSync(new URL('../src/lib/cashierPosEnhancementCopy.ts', import.meta.url), 'utf8');
const operatorSessionUi = fs.readFileSync(new URL('../src/lib/cashierOperatorSessionUi.ts', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../src/lib/i18n.tsx', import.meta.url), 'utf8');
const merchantCommerceUx = fs.readFileSync(new URL('../src/styles/merchantCommerceUxFixes.css', import.meta.url), 'utf8');

const arabicScriptUiLetters = /[\u0621-\u064A\u066E-\u06D3\u06D5\u06EE-\u06EF\u06FA-\u06FC]/u;

test('automatic cashier catalog refresh stays silent and preserves unchanged catalog state', () => {
  assert.match(pos, /refreshCatalog\(runtime, query, false\)/);
  assert.match(pos, /catalogMatches\(current, next\) \? current : next/);
  assert.match(pos, /if \(visible\) setSearching\(true\)/);
  assert.match(pos, /if \(visible\) setSearching\(false\)/);
});

test('cashier auto-sync keeps durable operation upload independent from catalog and policy refresh failures', () => {
  assert.match(cashierMain, /let nextOutboxAttemptAt = 0;/);
  assert.match(cashierMain, /let nextRefreshAttemptAt = 0;/);
  assert.match(cashierMain, /AUTO_SYNC_RETRY_BACKOFF_MS/);
  assert.match(cashierMain, /AUTO_REFRESH_RETRY_BACKOFF_MS/);

  const outboxIndex = cashierMain.indexOf('result = await syncCashierOperatorOutboxToCloud()');
  const policyIndex = cashierMain.indexOf('await refreshCashierOperatorPolicyFromCloud()', outboxIndex);
  const catalogIndex = cashierMain.indexOf('await syncCashierOperatorCatalogFromCloud()', policyIndex);
  assert.ok(outboxIndex >= 0, 'operator outbox must be synchronized');
  assert.ok(policyIndex > outboxIndex, 'policy refresh must not block already-durable operation upload');
  assert.ok(catalogIndex > policyIndex, 'catalog reconciliation follows operation upload and policy refresh');

  assert.match(
    cashierMain,
    /catch \(cause\) \{[\s\S]*publishCashierOperationSyncFailure\(cause\);[\s\S]*nextOutboxAttemptAt = Date\.now\(\) \+ AUTO_SYNC_RETRY_BACKOFF_MS;[\s\S]*return;[\s\S]*\}/,
  );
  assert.match(
    cashierMain,
    /Catalog\/policy refresh is a separate, non-destructive background concern\.[\s\S]*nextRefreshAttemptAt = Date\.now\(\) \+ AUTO_REFRESH_RETRY_BACKOFF_MS;/,
  );
  assert.doesNotMatch(
    cashierMain,
    /nextRefreshAttemptAt = Date\.now\(\) \+ AUTO_REFRESH_RETRY_BACKOFF_MS;[\s\S]{0,180}nextOutboxAttemptAt = Date\.now\(\) \+ AUTO_SYNC_RETRY_BACKOFF_MS;/,
    'a non-session catalog refresh failure must not back off later sale uploads',
  );
});

test('cashier catalog opening and manual search failures are localized and accessible', () => {
  assert.ok(pos.includes('setError(extra.catalogOpenFailed);'));
  assert.ok(pos.includes("if (source === 'search') throw cause;"));
  assert.ok(pos.includes('extra.searchFailed'));
  assert.ok(pos.includes('extra.scannerAmbiguous'));
  assert.ok(pos.includes('role="alert"'));
  assert.equal((posEnhancementCopy.match(/catalogOpenFailed:/g) || []).length, 3);
  assert.equal((posEnhancementCopy.match(/searchFailed:/g) || []).length, 3);
  assert.match(posEnhancementCopyAlias, /translations\/features\/lib\/cashierPosEnhancementCopy/);
});

test('cashier operational pages fail closed into operator authorization when the session ends', () => {
  assert.match(operatorSessionUi, /CASHIER_OPERATOR_LOGIN_REQUIRED/);
  assert.match(operatorSessionUi, /CASHIER_OPERATOR_SESSION_INVALID/);
  assert.match(operatorSessionUi, /fawri:cashier-operator-session-invalidated/);

  for (const page of [pos, history, reports, syncPage]) {
    assert.match(page, /isCashierOperatorSessionEnded/);
    assert.match(page, /publishCashierOperatorSessionInvalidated/);
    assert.match(page, /role="alert"/);
  }

  assert.match(pos, /createCashierPosRuntime\(\{ demoMode \}\)[\s\S]*isCashierOperatorSessionEnded\(cause\)[\s\S]*publishCashierOperatorSessionInvalidated\(\)/);
  assert.match(pos, /runtime\.commitSale\([\s\S]*isCashierOperatorSessionEnded\(cause\)[\s\S]*setCheckoutOpen\(false\)[\s\S]*publishCashierOperatorSessionInvalidated\(\)/);
  assert.match(history, /performReturn[\s\S]*isCashierOperatorSessionEnded\(cause\)/);
  assert.match(history, /performVoid[\s\S]*isCashierOperatorSessionEnded\(cause\)/);
  assert.match(reports, /buildReport\(rangeOptions\(range\)\)[\s\S]*isCashierOperatorSessionEnded\(cause\)/);
  assert.match(syncPage, /syncCashierOperatorOutboxToCloud\(\)[\s\S]*isCashierOperatorSessionEnded\(cause\)/);
  assert.match(syncPage, /syncCashierOperatorCatalogFromCloud\(\)[\s\S]*isCashierOperatorSessionEnded\(catalogCause\)/);
});

test('cashier and active catalog do not use Arabic thousands separators for merchant money', () => {
  assert.doesNotMatch(pos, /Intl\.NumberFormat\('ar-IQ'/);
  assert.match(pos, /formatMerchantMoneyMinor\(amountMinor, currencyCode, fractionDigits, lang\)/);
  assert.match(catalog, /formatMerchantMoneyMinor/);
  assert.match(catalog, /catalogMoneyFormForDisplay/);
  assert.match(catalog, /catalogMoneyFormForAuthority/);
});

test('active catalog price inputs follow merchant currency fraction digits', () => {
  assert.match(productsRoute, /ProductsWorkspacePage/);
  assert.match(productsWorkspace, /CommerceCatalogPage/);
  assert.match(catalog, /const moneyStep = catalogCurrencyStep\(fractionDigits\)/);
  assert.match(catalog, /step=\{moneyStep\} inputMode="decimal" dir="ltr" value=\{form\.current_price\}/);
  assert.match(catalog, /step=\{moneyStep\} inputMode="decimal" dir="ltr" value=\{form\.original_price\}/);
  assert.doesNotMatch(catalog, /pointer-events-none absolute end-3 top-1\/2/);
  assert.doesNotMatch(catalog, /<span[^>]*>\{copy\.currency\}<\/span>/);
});

test('cashier opens beside merchant dashboard on desktop and mobile without dashboard remounts', () => {
  for (const navigation of [sidebar, bottomNav]) {
    assert.match(navigation, /href=\{item\.href\}/);
    assert.match(navigation, /target="_blank"/);
    assert.match(navigation, /rel="noopener noreferrer"/);
  }
  assert.match(bottomNav, /href: "\/cashier\.html"/);
  assert.doesNotMatch(dashboardLayout, /window\.location\.reload\(\)/);
  assert.doesNotMatch(dashboardLayout, /cashierContentRevision/);
  assert.doesNotMatch(dashboardLayout, /subscribeCashierDashboardRefresh/);
});

test('cashier dashboard refresh refetches catalog and orders in place without discarding merchant work', () => {
  assert.match(catalog, /subscribeCashierDashboardRefresh/);
  assert.match(catalog, /if \(formOpen \|\| saving\)/);
  assert.match(catalog, /pendingCashierRefresh\.current = true/);
  assert.match(catalog, /if \(formOpen \|\| saving \|\| !pendingCashierRefresh\.current\) return/);
  assert.match(catalog, /setReload\(value => value \+ 1\)/);
  assert.match(catalog, /if \(!loadedOnce\.current\) setLoading\(true\)/);
  assert.match(orders, /subscribeCashierDashboardRefresh/);
  assert.match(orders, /if \(!pendingOrderId\) void loadOrders\(true\)/);
});

test('cashier reports refresh on connectivity and cashier sync signals without stale response overwrite', () => {
  assert.match(reports, /subscribeCashierDashboardRefresh/);
  assert.match(reports, /window\.addEventListener\('online', handleConnectivityChange\)/);
  assert.match(reports, /window\.addEventListener\('offline', handleConnectivityChange\)/);
  assert.match(reports, /if \(runtime\) void refresh\(\)/);
  assert.match(reports, /const requestSequence = useRef\(0\)/);
  assert.match(reports, /const requestId = \+\+requestSequence\.current/);
  assert.match(reports, /if \(requestId !== requestSequence\.current\) return/);
  assert.match(reports, /requestSequence\.current \+= 1/);
});


test('shipping measurement hint belongs to the active simplified workspace and fields stay on one responsive grid', () => {
  assert.match(productsRoute, /ProductsWorkspacePage/);
  assert.match(productsWorkspace, /CommerceCatalogPage/);
  assert.match(catalog, /CatalogProductDetailsEditor/);

  const hint = '<p className="mt-2 text-xs leading-5 text-muted-foreground">{labels.advancedHint}</p>';
  const fieldsGrid = '<div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">';
  const fieldLabels = [
    '<span>{labels.weight}</span>',
    '<span>{labels.length}</span>',
    '<span>{labels.width}</span>',
    '<span>{labels.height}</span>',
  ];

  const hintIndex = productDetails.indexOf(hint);
  const fieldsGridIndex = productDetails.indexOf(fieldsGrid);

  assert.ok(hintIndex >= 0, 'measurement hint must remain visible');
  assert.ok(fieldsGridIndex > hintIndex, 'measurement fields must start after the full-width hint');
  for (const fieldLabel of fieldLabels) {
    assert.ok(
      productDetails.indexOf(fieldLabel, fieldsGridIndex) > fieldsGridIndex,
      `${fieldLabel} must render inside the responsive measurement grid`,
    );
  }
  assert.doesNotMatch(merchantCommerceUx, /input\[placeholder=/, 'measurement geometry must not depend on placeholder CSS selectors');
});

test('confirmation primary action remains direction-aware', () => {
  assert.match(app, /merchantCommerceUxFixes\.css/);
  assert.match(cashierMain, /merchantCommerceUxFixes\.css/);
  assert.match(merchantCommerceUx, /data-cashier-view="history"[\s\S]*flex-direction:\s*row-reverse/);
  assert.match(history, /dir=\{dir\}/);
});

test('all operational cashier views inherit merchant Arabic Kurdish or English language', () => {
  assert.match(
    cashierMain,
    /<I18nProvider>[\s\S]*<CashierOperatorGate[^>]*>[\s\S]*\{operationalPage\}[\s\S]*<\/CashierOperatorGate>[\s\S]*<\/I18nProvider>/,
  );
  assert.match(pos, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(history, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(syncPage, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(pos, /CASHIER_UI_COPY\[lang\]\.pos/);
  assert.match(history, /CASHIER_UI_COPY\[lang\]\.history/);
  assert.match(syncPage, /CASHIER_UI_COPY\[lang\]\.sync/);
  assert.doesNotMatch(pos, arabicScriptUiLetters, 'POS component must not keep Arabic/Kurdish UI letter literals');
  assert.doesNotMatch(history, arabicScriptUiLetters, 'history component must not keep Arabic/Kurdish UI letter literals');
  assert.doesNotMatch(syncPage, arabicScriptUiLetters, 'sync component must not keep Arabic/Kurdish UI letter literals');
  assert.doesNotMatch(cashierMain, arabicScriptUiLetters, 'cashier runtime messages must come from the language authority');
});

test('cashier language follows merchant language changes across tabs and merchant pages expose the same language alias', () => {
  assert.match(i18n, /window\.addEventListener\('storage', handleStorage\)/);
  assert.match(i18n, /event\.key !== LANG_STORAGE_KEY/);
  assert.match(i18n, /language:\s*lang/);
  assert.match(cashierCopy, /ar:\s*\{/);
  assert.match(cashierCopy, /ku:\s*\{/);
  assert.match(cashierCopy, /en:\s*\{/);
  assert.match(cashierCopy, /if \(lang === 'ku'\) return 'ckb-IQ'/);
  assert.match(cashierCopyAlias, /translations\/features\/lib\/cashierUiCopy/);
  assert.match(history, /cashierLocale\(lang\)/);
  assert.match(syncPage, /cashierLocale\(lang\)/);
  assert.match(pos, /dir=\{dir\}/);
  assert.match(history, /dir=\{dir\}/);
  assert.match(syncPage, /dir=\{dir\}/);
});
