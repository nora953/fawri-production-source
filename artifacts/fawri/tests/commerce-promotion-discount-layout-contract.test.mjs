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

const promotionActionCss = await readFile(
  new URL('../src/pages/dashboard/promotionCardActionAlignment.css', import.meta.url),
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

test('promotion editor hides the duplicate modal title badge without changing the page title', () => {
  assert.ok(
    harmonyCss.includes(
      '.products-workspace-polish [class~="z-[110]"] > div > div:first-child > div > div:last-child {',
    ),
  );
  assert.match(harmonyCss, /Promotion modal: hide the duplicate Promotions badge/);
  assert.match(promotionSource, /<h1 className="text-3xl font-extrabold tracking-tight">\{copy\.title\}<\/h1>/);
});

test('promotion summary cards mirror product-card density and vertical rhythm without changing promotion authority', () => {
  assert.match(harmonyCss, /Promotion summary cards mirror the compact Product summary-card rhythm/);
  assert.match(harmonyCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(harmonyCss, /height:\s*18\.75rem !important/);
  assert.match(harmonyCss, /min-height:\s*18\.75rem !important/);
  assert.match(harmonyCss, /bottom:\s*3\.75rem/);
  assert.match(harmonyCss, /grid-template-columns:\s*minmax\(0, 1fr\) 2\.25rem/);
  assert.match(harmonyCss, /content:\s*attr\(title\)/);
  assert.match(harmonyCss, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(harmonyCss, /> article > \.border-t\.px-5\.py-3 \{\s*display:\s*none !important/);

  assert.match(promotionSource, /listCatalogPromotions/);
  assert.match(promotionSource, /createCatalogPromotion/);
  assert.match(promotionSource, /updateCatalogPromotion/);
  assert.match(promotionSource, /deleteCatalogPromotion/);
  assert.match(promotionSource, /promotionValueText\(promotion, context\)/);
  assert.match(promotionSource, /displayLocalDateTime\(promotion\.starts_local\)/);
  assert.match(promotionSource, /displayLocalDateTime\(promotion\.ends_local\)/);
});

test('promotion summary polish matches product action size, discount weight, and metric breathing room', () => {
  assert.match(harmonyCss, /> article > \.p-5 \{\s*min-height:\s*9rem/);
  assert.match(harmonyCss, /> article > \.p-5 > \.flex \{\s*min-height:\s*6\.6rem/);
  assert.match(harmonyCss, /grid-template-columns:\s*minmax\(0, 1fr\) 2\.25rem/);
  assert.match(harmonyCss, /> button \{\s*height:\s*2\.25rem !important;\s*min-height:\s*2\.25rem !important;\s*border-radius:\s*0\.75rem !important/);
  assert.match(harmonyCss, /> article > \.p-5 > \.inline-flex \{[\s\S]*?height:\s*2\.25rem/);
  assert.match(harmonyCss, /background:\s*rgb\(249 115 22 \/ 0\.04\) !important/);
  assert.match(harmonyCss, /> article > \.grid\.border-t \{[\s\S]*?bottom:\s*4\.5rem/);
  assert.match(harmonyCss, /> article > \.grid\.border-t > div \{[\s\S]*?height:\s*4rem/);
});

test('promotion edit action keeps the pencil and localized label separated on desktop', () => {
  assert.match(promotionActionCss, /display:\s*inline-flex !important/);
  assert.match(promotionActionCss, /align-items:\s*center !important/);
  assert.match(promotionActionCss, /justify-content:\s*center !important/);
  assert.match(promotionActionCss, /gap:\s*0\.45rem !important/);
  assert.match(promotionActionCss, /> button:first-child > svg \{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(promotionActionCss, /> button:first-child::after \{[\s\S]*?margin:\s*0 !important/);
});
