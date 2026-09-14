import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const uiCopy = fs.readFileSync(
  new URL('../src/lib/cashierUiCopy.ts', import.meta.url),
  'utf8',
);

test('reviewed cashier history Arabic English and Sorani wording stays aligned', () => {
  // Arabic canonical reference.
  assert.match(uiCopy, /title: 'سجل الكاشير'/);
  assert.match(uiCopy, /subtitle: 'راجع المبيعات والإرجاعات والإلغاءات\.'/);
  assert.match(uiCopy, /offlineNotice: 'غير متصل\. يمكنك الاستمرار، وستتم المزامنة عند عودة الاتصال\.'/);
  assert.match(uiCopy, /saleDetails: 'تفاصيل البيع'/);
  assert.match(uiCopy, /synced: 'متزامن'/);
  assert.match(uiCopy, /returnAll: 'إرجاع الكل'/);
  assert.match(uiCopy, /voidSale: 'إلغاء البيع'/);
  assert.match(uiCopy, /returnSelected: 'إرجاع المحدد'/);

  // Kurdish Sorani (ckb-IQ), not Kurmanji or another Kurdish locale.
  assert.match(uiCopy, /title: 'تۆماری کاشێر'/);
  assert.match(uiCopy, /subtitle: 'فرۆشتن، گەڕاندنەوە و هەڵوەشاندنەوەکان ببینە\.'/);
  assert.match(uiCopy, /offline: 'پەیوەست نییە'/);
  assert.match(uiCopy, /back: 'گەڕانەوە بۆ کاشێر'/);
  assert.match(uiCopy, /offlineNotice: 'پەیوەست نیت\. دەتوانیت بەردەوام بیت و کاتێک پەیوەندی گەڕایەوە هاوکات دەکرێت\.'/);
  assert.match(uiCopy, /sales: 'فرۆشتنەکان'/);
  assert.match(uiCopy, /saleDetails: 'وردەکاری فرۆشتن'/);
  assert.match(uiCopy, /paymentMethod: 'شێوازی پارەدان'/);
  assert.match(uiCopy, /paymentStatus: 'دۆخی پارەدان'/);
  assert.match(uiCopy, /products: 'بەرهەمەکان'/);
  assert.match(uiCopy, /synced: 'هاوکات کراوە'/);
  assert.match(uiCopy, /returnAll: 'گەڕاندنەوەی هەموو'/);
  assert.match(uiCopy, /voidSale: 'هەڵوەشاندنەوەی فرۆشتن'/);
  assert.match(uiCopy, /returnSelected: 'گەڕاندنەوەی هەڵبژێردراو'/);
  assert.match(uiCopy, /stateCompleted: 'تەواوبوو'/);
  assert.match(uiCopy, /if \(lang === 'ku'\) return 'ckb-IQ'/);

  // English mirrors the same operational meaning.
  assert.match(uiCopy, /title: 'Cashier history'/);
  assert.match(uiCopy, /subtitle: 'Review sales, returns, and voids\.'/);
  assert.match(uiCopy, /offlineNotice: 'You are offline\. You can continue; syncing will resume when the connection returns\.'/);
  assert.match(uiCopy, /saleDetails: 'Sale details'/);
  assert.match(uiCopy, /synced: 'Synced'/);
  assert.match(uiCopy, /returnAll: 'Return all'/);
  assert.match(uiCopy, /voidSale: 'Void sale'/);
  assert.match(uiCopy, /returnSelected: 'Return selected'/);
});
