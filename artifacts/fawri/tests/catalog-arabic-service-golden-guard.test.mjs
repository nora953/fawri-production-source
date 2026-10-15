import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const guard = fs.readFileSync(new URL('../src/lib/catalogArabicServiceGoldenGuard.ts', import.meta.url), 'utf8');
const copy = fs.readFileSync(new URL('../src/lib/translations/features/catalog/catalogEditorCopy.ts', import.meta.url), 'utf8');

test('Arabic service golden guard keeps approved availability wording', () => {
  assert.match(guard, /ARABIC_SERVICE_AVAILABILITY_TITLE = 'متاح للطلب'/);
  assert.match(guard, /ARABIC_SERVICE_AVAILABILITY_HINT = 'حدد ما إذا كانت هذه الخدمة متاحة حاليًا للعملاء\.'/);
});

test('Arabic booking title keeps approved spelling', () => {
  assert.match(guard, /ARABIC_SERVICE_BOOKING_TITLE = 'تحتاج إلى حجز'/);
  assert.match(copy, /bookingRequired: 'تحتاج إلى حجز'/);
});

test('golden guard is service-scoped and Arabic-scoped', () => {
  assert.match(guard, /document\.documentElement\.lang !== 'ar'/);
  assert.match(guard, /data-catalog-service-details/);
});
