import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../src/pages/CashierReportsPage.tsx', import.meta.url),
  'utf8',
);

const arabic = source.slice(source.indexOf('  ar: {'), source.indexOf('  ku: {'));

test('Arabic sales reports use the reviewed return and average-value terminology', () => {
  assert.match(
    arabic,
    /subtitle: 'تقارير مبنية على وقت تنفيذ عمليات البيع والإرجاع والإلغاء ضمن نطاق صلاحيات الموظف\.'/,
  );
  assert.match(arabic, /refunds: 'قيمة الإرجاعات والإلغاءات'/);
  assert.match(arabic, /average: 'متوسط قيمة عملية البيع'/);
  assert.match(arabic, /returns: 'عمليات الإرجاع'/);
  assert.match(arabic, /localSource: 'المصدر: سجل الكاشير المحلي الموثوق — وضع عدم الاتصال'/);

  assert.doesNotMatch(arabic, /المرتجع|المرتجعات|Offline/);
});
