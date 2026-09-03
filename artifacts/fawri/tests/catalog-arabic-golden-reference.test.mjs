import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const copy = read('../src/lib/translations/features/catalog/catalogEditorCopy.ts');
const serviceGuard = read('../src/lib/catalogArabicServiceGoldenGuard.ts');
const englishParity = read('../src/lib/catalogEditorEnglishSemanticParity.ts');
const languageParityCss = read('../src/pages/dashboard/catalogEditorLanguageParity.css');
const merchantCss = read('../src/pages/dashboard/catalogMerchantWordingPolish.css');
const singleOptionCss = read('../src/pages/dashboard/catalogSingleOptionVariants.css');
const alignmentCss = read('../src/pages/dashboard/catalogAvailabilityToggleAlignment.css');
const itemTypeEditor = read('../src/components/catalog/CatalogItemTypeEditor.tsx');

test('Arabic product editor keeps approved merchant terminology and compact table behavior', () => {
  assert.match(copy, /baseData: 'بيانات المنتج'/);
  assert.match(copy, /multiProduct: 'منتج متعدد الخيارات'/);
  assert.match(copy, /options: 'خيارات المنتج'/);
  assert.match(copy, /generate: 'إنشاء \/ تحديث الأنواع'/);
  assert.match(copy, /combinations: 'أنواع المنتج'/);
  assert.match(copy, /combination: 'النوع'/);
  assert.match(copy, /bulkStock: 'كمية لكل نوع'/);
  assert.match(copy, /generateSku: 'توليد SKU للأنواع'/);
  assert.match(copy, /images: 'صورة النوع — اختياري'/);
  assert.match(singleOptionCss, /content: 'النوع'/);
  assert.match(merchantCss, /content: "حذف"/);
  assert.match(singleOptionCss, /overflow-x: hidden !important/);
  assert.match(singleOptionCss, /font-family: "Inter", Arial, sans-serif !important/);
});

test('Arabic service editor keeps approved wording and service-specific semantics', () => {
  assert.match(serviceGuard, /ARABIC_SERVICE_AVAILABILITY_TITLE = 'متاح للطلب'/);
  assert.match(serviceGuard, /ARABIC_SERVICE_AVAILABILITY_HINT = 'حدد ما إذا كانت هذه الخدمة متاحة حاليًا للعملاء\.'/);
  assert.match(serviceGuard, /ARABIC_SERVICE_BOOKING_TITLE = 'تحتاج إلى حجز'/);
  assert.match(copy, /bookingRequired: 'تحتاج إلى حجز'/);
  assert.match(merchantCss, /أضف معلومات الخدمة مرة واحدة، ويستخدمها فوري في الكاشير والردود ومساعدة العملاء\./);
  assert.match(merchantCss, /content: "السعر"/);
  assert.match(merchantCss, /content: "السعر يبدأ من"/);
  assert.match(merchantCss, /content: "وقت فاصل بعد الخدمة \(بالدقائق\)"/);
  assert.match(itemTypeEditor, /locationFlexible: 'أكثر من مكان لتقديم الخدمة'/);
  assert.match(itemTypeEditor, /locationFlexibleHint: 'اختر مكانين على الأقل من الأماكن التي يمكن تقديم هذه الخدمة فيها\.'/);
  assert.match(itemTypeEditor, /service_location_modes/);
});

test('Arabic service geometry keeps approved ordering and control alignment', () => {
  assert.match(merchantCss, /\[data-catalog-item-type-editor="true"\][^{]*\{\s*order: 0;/s);
  assert.match(merchantCss, /md\\:grid-cols-3:has\(\[data-catalog-primary-input="true"\]\)[^{]*\{\s*order: 1;/s);
  assert.match(merchantCss, /\[data-catalog-service-details="true"\][^{]*\{\s*order: 2;/s);
  assert.match(alignmentCss, /width: 3rem !important/);
  assert.match(alignmentCss, /height: 1\.75rem !important/);
  assert.match(alignmentCss, /margin-top: 0\.5rem !important/);
});

test('English and Sorani parity layers cannot directly mutate the Arabic golden reference', () => {
  assert.doesNotMatch(languageParityCss, /html\[lang=["']ar["']\]/);
  assert.doesNotMatch(englishParity, /COMMERCE_CATALOG_COPY\.ar/);
  assert.doesNotMatch(englishParity, /CATALOG_PRODUCT_DETAILS_COPY\.ar/);
  assert.doesNotMatch(englishParity, /CATALOG_ITEM_TYPE_COPY\.ar/);
});
