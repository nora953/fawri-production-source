import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiRoot = new URL('../', import.meta.url);
const webRoot = new URL('../../fawri/', import.meta.url);

async function api(path) { return readFile(new URL(path, apiRoot), 'utf8'); }
async function web(path) { return readFile(new URL(path, webRoot), 'utf8'); }

test('discount policy router is mounted before cashier commerce/sync', async () => {
  const app = await api('src/app.ts');
  const importAt = app.indexOf('cashierDiscountPolicyOperationsRouter');
  const mountAt = app.indexOf('app.use("/api", cashierDiscountPolicyOperationsRouter)');
  const commerceAt = app.indexOf('app.use("/api", cashierOperatorCommerceRouter)');
  assert.ok(importAt >= 0 && mountAt > importAt && commerceAt > mountAt);
});

test('merchant policy update is versioned and rewrites only discount permissions', async () => {
  const route = await api('src/routes/cashier-discount-policy-operations.ts');
  assert.match(route, /expected_version/);
  assert.match(route, /FOR UPDATE/);
  assert.match(route, /CASHIER_STAFF_VERSION_CONFLICT/);
  assert.match(route, /permission IN \('sale\.discount', 'sale\.discount_override'\)/);
  assert.match(route, /'sale\.discount'/);
  assert.match(route, /'sale\.discount_override'/);
  assert.match(route, /SET version = version \+ 1/);
  assert.match(route, /permission_snapshot = \$3::jsonb/);
});

test('merchant policy update derives override approval from the stored staff role', async () => {
  const route = await api('src/routes/cashier-discount-policy-operations.ts');
  assert.match(route, /SELECT id, version, status, role/);
  assert.match(route, /restrictCashierManualDiscountPolicyForRole/);
  assert.match(route, /current\.role/);
  assert.match(route, /effectivePolicy\.can_approve_override/);
  assert.match(route, /policy: effectivePolicy/);
});

test('operator can read only policy bound to authenticated merchant and staff', async () => {
  const route = await api('src/routes/cashier-discount-policy-operations.ts');
  const start = route.indexOf("'/cashier/operator/discount-policy'");
  const body = route.slice(start);
  assert.ok(start >= 0);
  assert.match(body, /requireCashierOperatorSession/);
  assert.match(body, /context\.merchant_id/);
  assert.match(body, /context\.staff_id/);
  assert.match(body, /context\.permissions\.includes\('sale\.discount'\)/);
  assert.match(body, /discount_setting: discountSetting/);
});

test('merchant-wide discount kind is versioned and invalidates pending approvals when it changes', async () => {
  const route = await api('src/routes/cashier-discount-policy-operations.ts');
  const authority = await api('src/services/cashierMerchantDiscountSettingsAuthority.ts');

  assert.match(route, /'\/cashier\/management\/discount-kind'/);
  assert.match(route, /expectedVersion: req\.body\?\.expected_version/);
  assert.match(route, /discountKind: req\.body\?\.discount_kind/);
  assert.match(route, /discount_setting: discountSetting/);

  assert.match(authority, /DEFAULT_MERCHANT_CASHIER_DISCOUNT_KIND[^\n]*'amount'/);
  assert.match(authority, /CASHIER_DISCOUNT_KIND_VERSION_CONFLICT/);
  assert.match(authority, /pg_advisory_xact_lock/);
  assert.match(authority, /DELETE FROM merchant_cashier_discount_override_approvals/);
  assert.match(authority, /current\.discount_kind !== discountKind/);
});

test('normal cashier sale rejects a discount kind that differs from the merchant setting', async () => {
  const authority = await api('src/services/cashierOperatorDiscountAuthority.ts');
  assert.match(authority, /requestedKind !== discountSetting\.discount_kind/);
  assert.match(authority, /CASHIER_DISCOUNT_KIND_MISMATCH/);
  assert.match(authority, /configured_discount_kind: discountSetting\.discount_kind/);
  assert.match(authority, /kind = discountSetting\.discount_kind/);
});

test('manager override issuance and consumption both enforce the current merchant discount kind', async () => {
  const authority = await api('src/services/cashierDiscountOverrideAuthority.ts');
  const matches = authority.match(/assertMerchantCashierDiscountKind/g) || [];

  assert.ok(matches.length >= 2);
  assert.match(authority, /lockMerchantCashierDiscountKindMutation/);
  assert.match(authority, /loadMerchantCashierDiscountSetting\([\s\S]*?true/);
  assert.match(authority, /managerLimitMinor/);
  assert.match(authority, /CASHIER_DISCOUNT_OVERRIDE_MANAGER_LIMIT_EXCEEDED/);
});

test('merchant discount policy UI exposes one merchant-wide type and preserves both stored staff limits', async () => {
  const page = await web('src/pages/dashboard/CashierDiscountPoliciesPage.tsx');
  assert.match(page, /max_percentage_bps/);
  assert.match(page, /max_amount_minor/);
  assert.match(page, /can_approve_override/);
  assert.match(page, /expected_version/);
  assert.match(page, /\/api\/cashier\/management\/discount-policies/);
  assert.match(page, /\/api\/cashier\/management\/discount-kind/);
  assert.match(page, /discountKindDraft/);
  assert.match(page, /discountSetting\.discount_kind === 'percentage'/);
  assert.match(page, /discountSetting\.discount_kind === 'amount'/);
  assert.match(page, /let percentageBps = row\.discount_policy\.max_percentage_bps/);
  assert.match(page, /let amountMinor = row\.discount_policy\.max_amount_minor/);
  assert.match(page, /صلاحيات خصم الكاشير/);
  assert.match(page, /Cashier discount permissions/);
  assert.match(page, /دەسەڵاتی داشکاندنی کارمەندانی کاشێر/);
});

test('merchant discount policy UI previews the selected type before saving it and blocks staff saves until the type is committed', async () => {
  const page = await web('src/pages/dashboard/CashierDiscountPoliciesPage.tsx');
  assert.match(page, /discountKindDraft === 'percentage' \? \(/);
  assert.match(page, /discountKindDraft === 'amount'/);
  assert.match(page, /discountKindDraft !== discountSetting\.discount_kind/);
  assert.match(page, /value=\{draft\.maxPercent\}/);
  assert.match(page, /value=\{draft\.maxAmount\}/);
});

test('cashier checkout cannot switch the merchant-selected discount kind', async () => {
  const editor = await web('src/components/cashier/CashierManualDiscountEditor.tsx');
  const checkout = await web('src/lib/useCashierManualDiscountCheckout.ts');

  assert.doesNotMatch(editor, /onKindChange\('amount'\)/);
  assert.doesNotMatch(editor, /onKindChange\('percentage'\)/);
  assert.match(editor, /kind === 'amount' \? copy\.discountAmount : copy\.discountPercent/);
  assert.match(checkout, /setKindState\(next\.discount_kind\)/);
  assert.match(checkout, /setKind: \(\) => undefined/);
});

test('merchant discount policy UI validates the active limit and explains permission sync truthfully', async () => {
  const page = await web('src/pages/dashboard/CashierDiscountPoliciesPage.tsx');
  assert.match(page, /draft\.maxPercent\.trim\(\)/);
  assert.match(page, /copy\.percentRequired/);
  assert.match(page, /copy\.amountRequired/);
  assert.doesNotMatch(page, /هذه السياسة لا تمنح الصلاحية وحدها/);
  assert.doesNotMatch(page, /Policy alone does not grant authority/);
  assert.match(page, /الحفظ يحدّث الصلاحيات تلقائيًا/);
  assert.match(page, /Saving updates permissions automatically/);
  assert.match(page, /تبقى حدود النوع الآخر محفوظة/);
  assert.match(page, /other type’s limits stay saved/);
});

test('English cashier management copy matches the Arabic reference meaning', async () => {
  const page = await web('src/pages/dashboard/CashierManagementPage.tsx');
  assert.match(page, /Manage cashier devices, staff, permissions and secure pairing\./);
  assert.match(page, /Discount permission is not granted automatically\./);
  assert.match(page, /Any discount over the limit requires approval from an authorized manager\./);
  assert.match(page, /branchKey: 'Branch code'/);
  assert.match(page, /Only one station per branch can have this authority\./);
  assert.match(page, /While offline, other stations cannot sell tracked inventory, preventing stock conflicts\./);
  assert.doesNotMatch(page, /Discount authority is sensitive and is never granted automatically by role/);
});

test('cashier edit actions follow page direction instead of a language-name special case', async () => {
  const page = await web('src/pages/dashboard/CashierManagementPage.tsx');
  const saveOrders = page.match(/className="order-1 flex-1 rounded-lg bg-primary/g) || [];
  const cancelOrders = page.match(/className="order-2 flex-1 rounded-lg border/g) || [];

  assert.equal(saveOrders.length, 2);
  assert.equal(cancelOrders.length, 2);
  assert.doesNotMatch(page, /lang === 'ar' \? 'order-1' : 'order-2'/);
  assert.doesNotMatch(page, /lang === 'ar' \? 'order-2' : 'order-1'/);
});

test('pairing code stays Latin and LTR in every interface language', async () => {
  const page = await web('src/pages/dashboard/CashierManagementPage.tsx');
  assert.match(page, /\{pairing\.code\}<\/div>/);
  assert.match(page, /dir="ltr" lang="en" style=\{\{ unicodeBidi: 'isolate' \}\}/);
  assert.match(page, /navigator\.clipboard\?\.writeText/);
  assert.match(page, /writeText\(pairing\.code\)/);
});
