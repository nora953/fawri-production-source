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

test('operator can read only policy bound to authenticated merchant and staff', async () => {
  const route = await api('src/routes/cashier-discount-policy-operations.ts');
  const start = route.indexOf("'/cashier/operator/discount-policy'");
  const body = route.slice(start);
  assert.ok(start >= 0);
  assert.match(body, /requireCashierOperatorSession/);
  assert.match(body, /context\.merchant_id/);
  assert.match(body, /context\.staff_id/);
  assert.match(body, /context\.permissions\.includes\('sale\.discount'\)/);
});

test('merchant discount policy UI exposes percent amount and override controls', async () => {
  const page = await web('src/pages/dashboard/CashierDiscountPoliciesPage.tsx');
  assert.match(page, /max_percentage_bps/);
  assert.match(page, /max_amount_minor/);
  assert.match(page, /can_approve_override/);
  assert.match(page, /expected_version/);
  assert.match(page, /\/api\/cashier\/management\/discount-policies/);
  assert.match(page, /\/discount-policy/);
  assert.match(page, /صلاحيات خصم موظفي الكاشير/);
  assert.match(page, /Cashier employee discount authority/);
  assert.match(page, /دەسەڵاتی داشکاندنی کارمەندانی کاشێر/);
});
