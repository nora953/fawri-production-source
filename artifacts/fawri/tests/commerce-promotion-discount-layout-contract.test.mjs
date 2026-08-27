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
  assert.match(harmonyCss, /position:\s*relative/);
  assert.match(harmonyCss, /padding-bottom:\s*1\.5rem/);
  assert.match(harmonyCss, /padding:\s*0 !important/);
  assert.match(harmonyCss, /border:\s*0 !important/);
  assert.match(harmonyCss, /background:\s*transparent !important/);
  assert.match(harmonyCss, /height:\s*2\.875rem !important/);
  assert.match(harmonyCss, /padding-right:\s*3\.35rem/);
  assert.match(harmonyCss, /position:\s*absolute/);
  assert.match(harmonyCss, /text-align:\s*center/);

  assert.match(promotionSource, /effect:\s*event\.target\.value as CatalogPromotionEffect/);
  assert.match(promotionSource, /const bps = percentageBps\(draft\.value\)/);
  assert.match(promotionSource, /event\.target\.value\.replace\(\/%\/g, ''\)\.trim\(\)/);
});
