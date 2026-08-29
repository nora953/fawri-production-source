import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const cardCss = await readFile(
  new URL('../src/pages/dashboard/productCardCompact.css', import.meta.url),
  'utf8',
);
const pageSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
  'utf8',
);

test('collapsed merchant product cards use one stable visual skeleton', () => {
  assert.match(cardCss, /Merchant product-card skeleton/);
  assert.match(cardCss, /align-items:\s*stretch !important/);
  assert.match(cardCss, /align-self:\s*stretch/);
  assert.match(cardCss, /height:\s*100% !important/);
  assert.match(cardCss, /min-height:\s*22rem !important/);

  assert.match(cardCss, /inset-inline-end:\s*1rem/);
  assert.match(cardCss, /> \.h-44[\s\S]*width:\s*7rem !important/);
  assert.match(cardCss, /> \.h-44[\s\S]*height:\s*7rem !important/);
  assert.match(cardCss, /padding-inline-end:\s*8\.75rem !important/);
  assert.doesNotMatch(cardCss, /inset-inline-start:\s*1rem/);

  assert.match(cardCss, /min-height:\s*3rem/);
  assert.match(cardCss, /min-height:\s*11\.75rem/);
  assert.match(cardCss, /min-height:\s*5\.25rem/);
  assert.match(cardCss, /text-align:\s*start/);

  assert.match(cardCss, /button\[aria-controls\^='catalog-inventory-'\]/);
  assert.match(cardCss, /html\[lang='ar'\][\s\S]*content:\s*'التفاصيل'/);
  assert.match(cardCss, /html\[lang='ku'\][\s\S]*content:\s*'وردەکارییەکان'/);
  assert.match(cardCss, /html\[lang='en'\][\s\S]*content:\s*'Details'/);
  assert.match(cardCss, /:has\(svg\.lucide-image\)[\s\S]*display:\s*none !important/);

  assert.match(cardCss, /:has\(> p\.rounded-2xl\) \{[\s\S]*display:\s*none/);
  assert.match(cardCss, /:has\(\[id\^='catalog-inventory-'\]\)[\s\S]*display:\s*block/);
  assert.doesNotMatch(cardCss, /-webkit-line-clamp:\s*2/);

  assert.match(pageSource, /CatalogProtectedImage/);
  assert.match(pageSource, /image=\{product\.image_refs\[0\]\}/);
  assert.match(pageSource, /formatMerchantMoneyMinor\(product\.price_iqd/);
  assert.match(pageSource, /tracksInventory\(product\) \? product\.stock_quantity/);
  assert.match(pageSource, /toggleInventoryDetails\(product\.id\)/);
});
