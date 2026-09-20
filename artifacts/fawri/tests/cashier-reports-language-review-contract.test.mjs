import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../src/pages/CashierReportsPage.tsx', import.meta.url),
  'utf8',
);

const arabic = source.slice(source.indexOf('  ar: {'), source.indexOf('  ku: {'));
const sorani = source.slice(source.indexOf('  ku: {'), source.indexOf('  en: {'));

const centralSource = fs.readFileSync(
  new URL('../src/pages/dashboard/CashierCentralReportsPage.tsx', import.meta.url),
  'utf8',
);
const centralArabic = centralSource.slice(
  centralSource.indexOf('  ar: {'),
  centralSource.indexOf('  ku: {'),
);
const centralSorani = centralSource.slice(
  centralSource.indexOf('  ku: {'),
  centralSource.indexOf('  en: {'),
);
const centralEnglish = centralSource.slice(
  centralSource.indexOf('  en: {'),
  centralSource.indexOf('\n};', centralSource.indexOf('  en: {')),
);

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

test('Sorani sales reports match the reviewed Arabic meaning without English offline wording', () => {
  assert.match(
    sorani,
    /subtitle: 'ڕاپۆرتەکان لەسەر بنەمای کاتی جێبەجێکردنی کردارەکانی فرۆشتن، گەڕاندنەوە و هەڵوەشاندنەوە لە چوارچێوەی دەسەڵاتی کارمەند\.'/,
  );
  assert.match(sorani, /refunds: 'بەهای گەڕاندنەوە و هەڵوەشاندنەوە'/);
  assert.match(sorani, /average: 'تێکڕای بەهای مامەڵەی فرۆشتن'/);
  assert.match(sorani, /returns: 'کرداری گەڕاندنەوە'/);
  assert.match(sorani, /localSource: 'سەرچاوە: تۆماری متمانەپێکراوی ناوخۆیی کاشێر — دۆخی بێ پەیوەندی'/);

  assert.doesNotMatch(sorani, /Offline|ناوەندی مامەڵەی فرۆشتن/);
});


test('central Arabic cashier report follows the reviewed Arabic sales terminology', () => {
  assert.match(
    centralArabic,
    /subtitle: 'المبيعات والإرجاعات والإلغاءات حسب المواقع والموظفين والمحطات من السجل المركزي الموثوق\.'/,
  );
  assert.match(centralArabic, /refunds: 'قيمة الإرجاعات والإلغاءات'/);
  assert.match(centralArabic, /average: 'متوسط قيمة عملية البيع'/);
  assert.match(centralArabic, /returns: 'عمليات الإرجاع'/);
  assert.match(centralArabic, /returnOps: 'إرجاع'/);
  assert.match(centralArabic, /salesByLocation: 'الأثر المالي حسب الموقع'/);
  assert.match(centralArabic, /activityByLocation: 'العمليات المنفذة حسب الموقع'/);
  assert.match(centralArabic, /locationFilter: 'الموقع'/);
  assert.match(centralArabic, /allLocations: 'كل المواقع'/);
  assert.match(centralArabic, /location: 'الموقع'/);
  assert.doesNotMatch(centralArabic, /فرع|الفروع/);
  assert.doesNotMatch(centralArabic, /المرتجع|المرتجعات/);
});

test('central Sorani and English reports preserve the same reviewed metric meaning', () => {
  assert.match(centralSorani, /refunds: 'بەهای گەڕاندنەوە و هەڵوەشاندنەوە'/);
  assert.match(centralSorani, /average: 'تێکڕای بەهای مامەڵەی فرۆشتن'/);
  assert.match(centralSorani, /salesByLocation: 'کاریگەری دارایی بەپێی شوێن'/);
  assert.match(centralSorani, /locationFilter: 'شوێن'/);
  assert.match(centralSorani, /allLocations: 'هەموو شوێنەکان'/);
  assert.doesNotMatch(centralSorani, /\bلق\b|لقەکان/);
  assert.doesNotMatch(centralSorani, /average: 'ناوەندی مامەڵەی فرۆشتن'/);

  assert.match(centralEnglish, /units: 'Net units sold'/);
  assert.match(centralEnglish, /refunds: 'Returns & voids value'/);
  assert.match(centralEnglish, /average: 'Average sale ticket'/);
});


test('central cashier report never renders legacy branch metadata as merchant-facing station context', () => {
  assert.doesNotMatch(
    centralSource,
    /secondary=\{group\.branch_label \|\| \(group\.branch_key/,
  );
  assert.match(centralSource, /detail_location_id/);
  assert.match(centralSource, /result\.by_location/);
  assert.match(centralSource, /result\.activity\.by_location/);
});
