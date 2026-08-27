import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const promotionSource = await readFile(
  new URL('../src/pages/dashboard/CatalogPromotionsPage.tsx', import.meta.url),
  'utf8',
);

const harmonyCss = await readFile(
  new URL('../src/pages/dashboard/catalogEditorCardHarmony.css', import.meta.url),
  'utf8',
);

test('promotion discount type and value stay visually aligned without changing discount authority', () => {
  assert.match(harmonyCss, /Present Discount type and/);
  assert.match(harmonyCss, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(harmonyCss, /gap:\s*0 !important/);
  assert.match(harmonyCss, /label \+ label/);
  assert.match(harmonyCss, /border-inline-start:\s*1px solid/);
  assert.match(harmonyCss, /height:\s*2\.875rem !important/);
  assert.match(harmonyCss, /padding-right:\s*3\.25rem/);
  assert.match(harmonyCss, /display:\s*none !important/);

  assert.match(promotionSource, /effect:\s*event\.target\.value as CatalogPromotionEffect/);
  assert.match(promotionSource, /const bps = percentageBps\(draft\.value\)/);
  assert.match(promotionSource, /event\.target\.value\.replace\(\/%\/g, ''\)\.trim\(\)/);
  assert.match(promotionSource, /draft\.effect === 'percentage_off' \? '0\.01 – 100'/);
});
