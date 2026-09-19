import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const pos = read('../src/pages/CashierPosPage.tsx');
const checkout = read('../src/components/cashier/CashierCheckoutModal.tsx');
const discountEditor = read('../src/components/cashier/CashierManualDiscountEditor.tsx');
const overrideEditor = read('../src/components/cashier/CashierDiscountOverrideEditor.tsx');
const discountCheckout = read('../src/lib/useCashierManualDiscountCheckout.ts');
const connectivity = read('../src/lib/cashierConnectivity.ts');
const keyboard = read('../src/lib/cashierFastCheckoutKeyboard.ts');
const scanner = read('../src/lib/cashierBarcodeScanner.ts');
const operatorRuntime = read('../src/lib/cashierOperatorPosRuntime.ts');
const receipt = read('../src/lib/cashierReceiptPrinting.ts');
const receiptProfile = read('../src/lib/cashierReceiptProfileClient.ts');
const history = read('../src/pages/CashierHistoryPage.tsx');
const main = read('../src/cashierMain.tsx');
const copy = read('../src/lib/cashierUiCopy.ts');
const enhancementCopy = read('../src/lib/cashierPosEnhancementCopy.ts');

test('functional freeze keeps the scanner and keyboard-first sale path intact', () => {
  assert.match(scanner, /MAX_INTER_KEY_GAP_MS = 90/);
  assert.match(scanner, /MAX_AVERAGE_GAP_MS = 65/);
  assert.match(scanner, /return key === 'Enter' \|\| key === 'Tab'/);
  assert.match(pos, /completeCashierScannerBuffer/);
  assert.match(pos, /addExactCode\(code, 'scanner'\)/);
  assert.match(keyboard, /CASHIER_FAST_CHECKOUT_KEY = 'F8'/);
  assert.match(keyboard, /CASHIER_CART_UNDO_KEY = 'Delete'/);
  assert.match(keyboard, /removeWholeActiveCartLine/);
  assert.doesNotMatch(keyboard, /Backspace/);
});

test('functional freeze keeps exact-cash Enter and fail-safe Escape checkout behavior', () => {
  assert.match(checkout, /previousExactTotalRef\.current !== finalTotalMinor/);
  assert.match(checkout, /!cashTouchedRef\.current/);
  assert.match(checkout, /onExactCash\(\)/);
  assert.match(checkout, /event\.key === 'Escape'/);
  assert.match(checkout, /!committing && !overrideApprovalLoading/);
  assert.match(checkout, /event\.key !== 'Enter'/);
  assert.match(checkout, /paymentMethod !== 'cash'/);
  assert.match(checkout, /!canSubmit/);
});

test('functional freeze keeps manual discount reasons touch-first without losing audit text', () => {
  assert.match(discountEditor, /copy\.discountReasonCustomerRecovery/);
  assert.match(discountEditor, /copy\.discountReasonLoyalty/);
  assert.match(discountEditor, /copy\.discountReasonPriceMatch/);
  assert.match(discountEditor, /copy\.discountReasonDamagedItem/);
  assert.match(discountEditor, /copy\.discountReasonSpecialOffer/);
  assert.match(discountEditor, /copy\.discountReasonClearance/);
  assert.match(discountEditor, /copy\.discountReasonOther/);
  assert.match(discountEditor, /onReasonChange\(option\)/);
  assert.match(discountEditor, /aria-pressed=\{selectedReason === option\}/);
  assert.match(discountEditor, /copy\.discountReasonAddNote/);
  assert.match(discountEditor, /note\.trim\(\) === ''\s*\? selectedReason/);
  assert.match(enhancementCopy, /discountReasonRequired: 'اختر سبب الخصم قبل تأكيد البيع\.'/);
  assert.match(enhancementCopy, /discountReasonRequired: 'Choose a discount reason before confirming the sale\.'/);
});

test('functional freeze keeps discount numeric entry unit-free and checkout-scoped', () => {
  assert.match(discountEditor, /placeholder="0"/);
  assert.doesNotMatch(discountEditor, /kind === 'percentage' \? '%' : currencyCode/);
  assert.doesNotMatch(discountEditor, /pointer-events-none absolute inset-y-0/);
  assert.match(discountCheckout, /previousOperationIdRef/);
  assert.match(
    discountCheckout,
    /input\.operationId && input\.operationId !== previousOperationId/,
  );
  assert.match(discountCheckout, /resetDraft\(\)/);
});

test('functional freeze keeps checkout money hierarchy touch-readable and validation truthful', () => {
  assert.match(checkout, /function MoneyValue/);
  assert.match(checkout, /text-base font-black leading-6 text-slate-100/);
  assert.match(checkout, /text-\[2rem\] font-black leading-none tracking-tight text-white/);
  assert.match(checkout, /text-lg font-extrabold text-slate-300/);
  assert.match(checkout, /space-y-2 border-t border-white\/10 pt-3/);
  assert.match(checkout, /text-\[15px\] font-extrabold/);
  assert.match(checkout, /amountClassName="text-lg font-black"/);
  assert.match(
    checkout,
    /parts\.currency[\s\S]*negative \?[\s\S]*parts\.amount/,
  );
  assert.match(
    discountEditor,
    /h-11 w-full rounded-xl border[\s\S]*px-3 text-sm font-bold[\s\S]*transition/,
  );
  assert.match(discountEditor, /h-12 w-full rounded-xl[\s\S]*text-xl font-black/);
  assert.match(discountEditor, /min-h-11 rounded-xl border/);
  assert.match(discountEditor, /rounded-lg border border-orange-100 bg-white\/80/);
  assert.match(discountEditor, /option === copy\.discountReasonOther \? 'col-span-2 sm:col-span-3 '/);
  assert.match(discountEditor, /inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200/);
  assert.match(discountEditor, /inline-flex items-baseline gap-0\.5/);
  assert.match(
    discountEditor,
    /amountLimitParts\.currency[\s\S]*amountLimitParts\.amount/,
  );
  assert.match(
    discountEditor,
    /resolvedDiscountParts\.currency[\s\S]*resolvedDiscountParts\.amount/,
  );
  assert.match(
    discountEditor,
    /reasonMissing \? copy\.discountReasonRequired : copy\.discountValueInvalid/,
  );
  assert.match(
    enhancementCopy,
    /discountValueInvalid: 'تحقق من قيمة الخصم قبل تأكيد البيع\.'/,
  );
  assert.match(
    enhancementCopy,
    /discountValueInvalid: 'Check the discount value before confirming the sale\.'/,
  );
});

test('functional freeze keeps manager ceiling rejection explicit and fail-closed', () => {
  assert.match(
    overrideEditor,
    /CASHIER_DISCOUNT_OVERRIDE_MANAGER_LIMIT_EXCEEDED/,
  );
  assert.match(overrideEditor, /copy\.managerApprovalManagerLimitExceeded/);
  assert.match(
    enhancementCopy,
    /managerApprovalManagerLimitExceeded: 'هذا الخصم يتجاوز حد صلاحية المدير لهذا النوع من الخصم\.'/,
  );
  assert.match(
    enhancementCopy,
    /managerApprovalManagerLimitExceeded: 'This discount exceeds this manager’s allowed limit for this discount type\.'/,
  );
});

test('functional freeze keeps manager approval visually aligned with checkout', () => {
  assert.match(overrideEditor, /rounded-2xl border border-orange-200 bg-orange-50\/50 p-3\.5/);
  assert.match(overrideEditor, /text-base font-black text-slate-900/);
  assert.match(overrideEditor, /text-\[13px\] font-medium leading-5 text-slate-600/);
  assert.match(overrideEditor, /h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white/);
  assert.match(overrideEditor, /SELECT_CHEVRON_BACKGROUND/);
  assert.match(
    overrideEditor,
    /backgroundPosition: rtl \? 'left 0\.65rem center' : 'right 0\.65rem center'/,
  );
  assert.match(
    overrideEditor,
    /rtl \? 'pl-8 pr-3 text-right' : 'pl-3 pr-8 text-left'/,
  );
  assert.match(overrideEditor, /text-center text-xl font-black tracking-\[0\.35em\]/);
  assert.match(overrideEditor, /rounded-lg border border-red-100 bg-red-50/);
  assert.match(overrideEditor, /h-12 w-full rounded-xl bg-orange-600/);
});

test('functional freeze keeps server-verified cashier reachability and physical checkout action sides', () => {
  assert.match(connectivity, /CASHIER_REACHABILITY_PATH = '\/healthz'/);
  assert.match(connectivity, /return currentState\.online \|\| readNativeNavigatorOnline\(\)/);
  assert.match(connectivity, /function browserOffline\(\)[\s\S]*probeCashierConnectivity\(\)/);
  assert.match(connectivity, /if \(!currentState\.online\) void probeCashierConnectivity\(\)/);
  assert.match(checkout, /<footer\s+dir="ltr"/);

  const footerIndex = checkout.indexOf('<footer');
  const backIndex = checkout.indexOf('{extra.cancelCheckout}', footerIndex);
  const confirmIndex = checkout.indexOf('extra.confirmSale', footerIndex);
  assert.ok(footerIndex >= 0, 'checkout footer must exist');
  assert.ok(backIndex > footerIndex, 'back action must remain the physical left footer action');
  assert.ok(confirmIndex > backIndex, 'confirm action must remain the physical right footer action');
});

test('functional freeze keeps sale commit single-flight and manager approval fail-closed', () => {
  assert.match(operatorRuntime, /cashierSaleCommitSingleFlight\.run/);
  assert.match(operatorRuntime, /resolveCashierDiscountOverrideSaleInput\(input\)/);
  assert.match(operatorRuntime, /ensureCashierOperatorLocalDatabaseReady\(\)/);
  assert.match(operatorRuntime, /assertManualDiscountPermission/);
  assert.match(operatorRuntime, /CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED/);
  assert.match(operatorRuntime, /bindCashierOperationToCurrentOperator/);
});

test('functional freeze keeps receipt printing isolated, thermal and device-scoped', () => {
  assert.match(receipt, /CashierReceiptPaperWidthMm = 58 \| 80/);
  assert.match(receipt, /@page \{ size: auto; margin: 0; \}/);
  assert.match(receipt, /document\.createElement\('iframe'\)/);
  assert.match(receipt, /printWindow\.print\(\)/);
  assert.doesNotMatch(receipt, /window\.print\(\)/);
  assert.match(pos, /writeCashierReceiptPrintSettings\(runtime\.deviceId/);
  assert.match(pos, /if \(receiptAutoPrint\) printReceipt\(result\.sale\)/);
  assert.match(keyboard, /CASHIER_RECEIPT_PRINT_KEY = 'F9'/);
  assert.match(keyboard, /event\.key\.toLowerCase\(\) === 'p'/);
  assert.match(receiptProfile, /writeCachedCashierReceiptProfile\(session\.context\.device_id, profile\)/);
});

test('functional freeze keeps historical reprint read-only and visibly marked', () => {
  assert.match(history, /sale: selectedSale/);
  assert.match(history, /reprint: true/);
  assert.match(history, /readCashierReceiptPrintSettings\(runtime\.deviceId\)/);
  assert.match(history, /readCachedCashierReceiptProfile\(runtime\.deviceId\)/);
  assert.match(history, /event\.key !== 'F9'/);
  const start = history.indexOf('const reprintSelectedReceipt = useCallback');
  const end = history.indexOf('\n\n  useEffect(() => {', start);
  assert.ok(start >= 0 && end > start);
  const handler = history.slice(start, end);
  assert.doesNotMatch(handler, /returnSale|voidSale|syncPending|commitSale|requestCashierSync/);
});

test('functional freeze keeps operation sync independent from catalog refresh failures', () => {
  assert.match(main, /let nextOutboxAttemptAt = 0;/);
  assert.match(main, /let nextRefreshAttemptAt = 0;/);
  const outboxIndex = main.indexOf('result = await syncCashierOperatorOutboxToCloud()');
  const policyIndex = main.indexOf('await refreshCashierOperatorPolicyFromCloud()', outboxIndex);
  const catalogIndex = main.indexOf('await syncCashierOperatorCatalogFromCloud()', policyIndex);
  assert.ok(outboxIndex >= 0);
  assert.ok(policyIndex > outboxIndex);
  assert.ok(catalogIndex > policyIndex);
  assert.match(main, /nextOutboxAttemptAt = Date\.now\(\) \+ AUTO_SYNC_RETRY_BACKOFF_MS/);
  assert.match(main, /nextRefreshAttemptAt = Date\.now\(\) \+ AUTO_REFRESH_RETRY_BACKOFF_MS/);
});

test('functional freeze keeps Arabic Kurdish and English cashier authorities present', () => {
  assert.match(copy, /ar:\s*\{/);
  assert.match(copy, /ku:\s*\{/);
  assert.match(copy, /en:\s*\{/);
  assert.match(pos, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(history, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(pos, /dir=\{dir\}/);
  assert.match(history, /dir=\{dir\}/);
});
