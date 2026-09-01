import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const promotionSource = await readFile(
  new URL('../src/pages/dashboard/CatalogPromotionsPage.tsx', import.meta.url),
  'utf8',
);

const catalogSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
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

test('promotion edit action is icon-only and matches the product card control size on desktop', () => {
  assert.match(
    promotionActionCss,
    /> \.flex\.shrink-0\.gap-2 \{[\s\S]*?display:\s*flex !important;[\s\S]*?grid-template-columns:\s*none !important/,
  );
  assert.match(
    promotionActionCss,
    /> button:first-child,[\s\S]*?> button:last-child \{[\s\S]*?width:\s*2\.5rem !important;[\s\S]*?height:\s*2\.5rem !important;[\s\S]*?min-width:\s*2\.5rem !important;[\s\S]*?min-height:\s*2\.5rem !important/,
  );
  assert.match(promotionActionCss, /> button:first-child > svg \{[\s\S]*?margin:\s*0 !important/);
  assert.match(
    promotionActionCss,
    /> button:first-child::after \{[\s\S]*?content:\s*none !important;[\s\S]*?display:\s*none !important/,
  );
});

test('promotion scope icon keeps breathing room and discount summary lifts away from timing metrics', () => {
  assert.match(
    promotionActionCss,
    /\.rounded-full\.bg-background \{[\s\S]*?display:\s*inline-flex !important;[\s\S]*?gap:\s*0\.35rem !important/,
  );
  assert.match(
    promotionActionCss,
    /\.rounded-full\.bg-background > svg \{[\s\S]*?margin:\s*0 !important/,
  );
  assert.match(
    promotionActionCss,
    /> article > \.p-5 > \.inline-flex \{\s*transform:\s*translateY\(-0\.35rem\)/,
  );
});

test('promotion header separates the pricing notice from grouped store currency and timezone facts', () => {
  assert.match(
    promotionSource,
    /originalSafe:\s*'السعر الأصلي لا يتغير، فوري يستخدم السعر الفعّال فقط أثناء فترة العرض\.'/,
  );
  assert.match(
    promotionSource,
    /sm:flex-row sm:items-center sm:justify-between[\s\S]*?<span>\{copy\.originalSafe\}<\/span>/,
  );
  assert.match(
    promotionSource,
    /<span className="inline-flex items-center gap-1\.5">[\s\S]*?\{copy\.currency\}:[\s\S]*?<strong dir="ltr" className="font-extrabold text-foreground">\{context\.currency_code\}<\/strong>/,
  );
  assert.match(promotionSource, /<span aria-hidden="true" className="text-orange-400">•<\/span>/);
  assert.match(
    promotionSource,
    /<span className="inline-flex items-center gap-1\.5">[\s\S]*?\{copy\.timezone\}:[\s\S]*?<strong dir="ltr" className="font-extrabold text-foreground">\{context\.timezone\}<\/strong>/,
  );
  assert.match(promotionActionCss, /Promotion header context:/);
  assert.match(promotionActionCss, /column-gap:\s*1\.5rem !important/);
  assert.match(promotionActionCss, /> span:first-child \{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?font-weight:\s*500/);
  assert.match(promotionActionCss, /> span:last-child \{[\s\S]*?white-space:\s*nowrap/);
  assert.match(promotionActionCss, /> span:last-child \[dir="ltr"\] \{[\s\S]*?font-weight:\s*800/);
  assert.match(promotionActionCss, /@media \(max-width: 639px\)[\s\S]*?border-top:\s*1px solid rgb\(249 115 22 \/ 0\.14\)/);
});

test('promotion add button gives the plus a visible chip and balanced CTA rhythm in RTL and LTR', () => {
  const buttonRule = promotionActionCss.match(
    /header > \.flex:first-child > button \{[\s\S]*?\n\}/,
  )?.[0] || '';
  const iconRule = promotionActionCss.match(
    /header > \.flex:first-child > button > svg \{[\s\S]*?\n\}/,
  )?.[0] || '';

  assert.match(promotionActionCss, /plus gets its own soft chip/);
  assert.match(buttonRule, /display:\s*inline-flex !important/);
  assert.match(buttonRule, /align-items:\s*center !important/);
  assert.match(buttonRule, /justify-content:\s*center !important/);
  assert.match(buttonRule, /gap:\s*0\.7rem !important/);
  assert.match(buttonRule, /height:\s*3rem !important/);
  assert.match(buttonRule, /border-radius:\s*1rem !important/);
  assert.match(buttonRule, /box-shadow:\s*0 8px 18px rgb\(249 115 22 \/ 0\.16\) !important/);

  assert.match(iconRule, /width:\s*1\.8rem !important/);
  assert.match(iconRule, /height:\s*1\.8rem !important/);
  assert.match(iconRule, /padding:\s*0\.34rem !important/);
  assert.match(iconRule, /margin:\s*0 !important/);
  assert.match(iconRule, /border-radius:\s*0\.6rem !important/);
  assert.match(iconRule, /background:\s*rgb\(255 255 255 \/ 0\.16\) !important/);
  assert.match(iconRule, /box-shadow:\s*inset 0 0 0 1px rgb\(255 255 255 \/ 0\.22\) !important/);
});

test('catalog add product/service button mirrors the visible Add promotion CTA without changing Import', () => {
  const catalogButtonRule = promotionActionCss.match(
    /header > \.flex:first-child > \.flex\.shrink-0 > button:first-child \{[\s\S]*?\n\}/,
  )?.[0] || '';
  const catalogIconRule = promotionActionCss.match(
    /header > \.flex:first-child > \.flex\.shrink-0 > button:first-child > svg \{[\s\S]*?\n\}/,
  )?.[0] || '';

  assert.match(catalogSource, /<div className="flex shrink-0 flex-col gap-2 sm:flex-row">/);
  assert.match(catalogSource, /<Plus className=\{isRTL \? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'\} \/>\{copy\.add\}<\/Button>/);
  assert.match(promotionActionCss, /catalog Add product\/service CTA visually identical to Add promotion/);

  for (const pattern of [
    /display:\s*inline-flex !important/,
    /align-items:\s*center !important/,
    /justify-content:\s*center !important/,
    /gap:\s*0\.7rem !important/,
    /height:\s*3rem !important/,
    /min-height:\s*3rem !important/,
    /padding-inline:\s*0\.8rem 1\.05rem !important/,
    /border-radius:\s*1rem !important/,
    /box-shadow:\s*0 8px 18px rgb\(249 115 22 \/ 0\.16\) !important/,
  ]) {
    assert.match(catalogButtonRule, pattern);
  }

  for (const pattern of [
    /width:\s*1\.8rem !important/,
    /height:\s*1\.8rem !important/,
    /padding:\s*0\.34rem !important/,
    /margin:\s*0 !important/,
    /border-radius:\s*0\.6rem !important/,
    /background:\s*rgb\(255 255 255 \/ 0\.16\) !important/,
    /box-shadow:\s*inset 0 0 0 1px rgb\(255 255 255 \/ 0\.22\) !important/,
  ]) {
    assert.match(catalogIconRule, pattern);
  }

  assert.doesNotMatch(
    promotionActionCss,
    /header > \.flex:first-child > \.flex\.shrink-0 > button:last-child \{/,
  );
});

test('catalog header subtitle stays on one desktop line without forcing narrow layouts', () => {
  assert.match(
    promotionActionCss,
    /@media \(min-width: 1280px\)[\s\S]*?Keep the catalog header description on one desktop line[\s\S]*?> header > \.flex:first-child > div:first-child > p \{[\s\S]*?max-width:\s*none !important;[\s\S]*?white-space:\s*nowrap !important/,
  );
  assert.match(
    catalogSource,
    /<p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">\{copy\.subtitle\}<\/p>/,
  );
});
