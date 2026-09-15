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
  assert.match(managementSource, /Discount authority is sensitive and is never granted automatically by role/);
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
    /member\.role === 'manager' \? <label[^>]*>.*checked=\{draft\.canApproveOverride\}/,
  );
});

test('discount policy UI presents fixed amount and percentage as independent limits', () => {
  assert.match(
    policySource,
    /يُطبَّق حد النوع الذي يختاره الموظف فقط\. تجاوز هذا الحد يتطلب موافقة مدير\./,
  );
  assert.match(
    policySource,
    /Only the limit for the discount type selected by the employee applies\. Exceeding that limit requires manager approval\./,
  );
  assert.match(policySource, /المبلغ: حتى \{amount\} · النسبة: حتى \{percent\}%\./);
  assert.doesNotMatch(policySource, /الحد الأقل بين النسبة والحد المالي/);
  assert.doesNotMatch(policySource, /The lower of the percentage and amount limits/);
});

test('cashier client permission type matches discount server authority', () => {
  assert.match(operatorSessionSource, /\| 'sale\.discount'/);
  assert.match(operatorSessionSource, /\| 'sale\.discount_override'/);
});
