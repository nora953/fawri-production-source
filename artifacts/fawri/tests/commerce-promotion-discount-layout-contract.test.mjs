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
  assert.match(harmonyCss, /Promotion discount editor: visual-only alignment/);
  assert.match(harmonyCss, /section:nth-of-type\(2\) > \.grid > label/);
  assert.match(harmonyCss, /grid-template-rows:\s*auto 2\.75rem 1\.15rem/);
  assert.match(harmonyCss, /padding-right:\s*3\.35rem/);
  assert.match(harmonyCss, /background:\s*rgb\(249 115 22 \/ 0\.08\)/);

  assert.match(promotionSource, /effect:\s*event\.target\.value as CatalogPromotionEffect/);
  assert.match(promotionSource, /const bps = percentageBps\(draft\.value\)/);
  assert.match(promotionSource, /event\.target\.value\.replace\(\/%\/g, ''\)\.trim\(\)/);
});
