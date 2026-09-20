import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const managementSource = await readFile(
  new URL('../src/pages/dashboard/CashierManagementPage.tsx', import.meta.url),
  'utf8',
);
const policySource = await readFile(
  new URL('../src/pages/dashboard/CashierDiscountPoliciesPage.tsx', import.meta.url),
  'utf8',
);
const operatorSessionSource = await readFile(
  new URL('../src/lib/cashierOperatorSessionRuntime.ts', import.meta.url),
  'utf8',
);

test('merchant staff UI exposes explicit manual discount authority without role auto-grants', () => {
  assert.match(managementSource, /\| 'sale\.discount'/);
  assert.match(managementSource, /\| 'sale\.discount_override'/);
  assert.match(managementSource, /\['sale\.discount', l\.manualDiscount\]/);
  assert.match(managementSource, /\['sale\.discount_override', l\.discountOverride\]/);
  assert.match(managementSource, /href="\/dashboard\/cashiers\/discounts"/);
  assert.match(managementSource, /Discount permission is not granted automatically\. After enabling it, set the employee limit in Discount policies\. Any discount over the limit requires approval from an authorized manager\./);
});

test('override permission control is manager-only in merchant staff UI', () => {
  assert.match(
    managementSource,
    /permission === 'sale\.discount_override' && staffRole !== 'manager'/,
  );
  assert.match(managementSource, /staffRole=\{role\}/);
  assert.match(managementSource, /staffRole=\{editRole\}/);
});

test('discount policy UI cannot persist override approval for a cashier', () => {
  assert.match(
    policySource,
    /member\.role === 'manager' && draft\.enabled && draft\.canApproveOverride/,
  );
  assert.match(
    policySource,
    /member\.role === 'manager' \? \([\s\S]*?<label[\s\S]*?checked=\{draft\.canApproveOverride\}[\s\S]*?<\/label>[\s\S]*?\) : null/,
  );
});

test('discount policy UI keeps one merchant-wide discount kind while preserving type-specific employee limits', () => {
  assert.match(
    policySource,
    /يُطبّق على جميع الكاشير والمديرين ولا يمكن تغييره من شاشة البيع\./,
  );
  assert.match(
    policySource,
    /Applies to all cashiers and managers and cannot be changed at checkout\./,
  );
  assert.match(policySource, /discountKindDraft === 'percentage'/);
  assert.match(policySource, /discountSetting\.discount_kind === 'percentage'/);
  assert.match(policySource, /discountSetting\.discount_kind === 'amount'/);
  assert.match(
    policySource,
    /Saving updates permissions automatically, and the other type’s limits stay saved\./,
  );
  assert.doesNotMatch(policySource, /الحد الأقل بين النسبة والحد المالي/);
  assert.doesNotMatch(policySource, /The lower of the percentage and amount limits/);
});

test('cashier client permission type matches discount server authority', () => {
  assert.match(operatorSessionSource, /\| 'sale\.discount'/);
  assert.match(operatorSessionSource, /\| 'sale\.discount_override'/);
});
