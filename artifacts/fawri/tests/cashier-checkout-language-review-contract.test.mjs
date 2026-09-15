import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../src/lib/cashierPosEnhancementCopy.ts', import.meta.url),
  'utf8',
);

const arabic = source.slice(source.indexOf('  ar: {'), source.indexOf('  ku: {'));
const sorani = source.slice(source.indexOf('  ku: {'), source.indexOf('  en: {'));
const english = source.slice(source.indexOf('  en: {'));

test('customer compensation discount reason stays semantically aligned across cashier languages', () => {
  assert.match(arabic, /discountReasonCustomerRecovery: 'تعويض عميل'/);
  assert.match(sorani, /discountReasonCustomerRecovery: 'قەرەبووی کڕیار'/);
  assert.match(english, /discountReasonCustomerRecovery: 'Customer compensation'/);
  assert.doesNotMatch(english, /discountReasonCustomerRecovery: 'Customer recovery'/);
});

test('manager approval success message states the same completed action across cashier languages', () => {
  assert.match(arabic, /managerApprovalApproved: 'تمت موافقة المدير على هذا الخصم\.'/);
  assert.match(sorani, /managerApprovalApproved: 'بەڕێوەبەر ئەم داشکاندنەی پەسەند کرد\.'/);
  assert.match(english, /managerApprovalApproved: 'The manager approved this discount\.'/);
  assert.doesNotMatch(english, /managerApprovalApproved: 'Manager approval is recorded for this discount\.'/);
});
