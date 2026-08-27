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

test('promotion discount controls mirror promotion-period card styling without changing discount authority', () => {
  assert.match(harmonyCss, /mirror the visual language already used by the/);
  assert.match(harmonyCss, /gap:\s*1rem !important/);
  assert.match(harmonyCss, /padding:\s*0\.75rem !important/);
  assert.match(harmonyCss, /border:\s*1px solid hsl\(var\(--border\)\) !important/);
  assert.match(harmonyCss, /border-radius:\s*1rem !important/);
  assert.match(harmonyCss, /background:\s*hsl\(var\(--muted\) \/ 0\.1\) !important/);
  assert.match(harmonyCss, /height:\s*2\.75rem !important/);
  assert.match(harmonyCss, /display:\s*none !important/);

  assert.match(promotionSource, /rounded-2xl border bg-muted\/10 p-3/);
  assert.match(promotionSource, /effect:\s*event\.target\.value as CatalogPromotionEffect/);
  assert.match(promotionSource, /const bps = percentageBps\(draft\.value\)/);
  assert.match(promotionSource, /event\.target\.value\.replace\(\/%\/g, ''\)\.trim\(\)/);
});
