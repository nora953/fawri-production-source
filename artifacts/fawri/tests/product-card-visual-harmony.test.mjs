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

  // Product images must stay compact and must not control the whole card height.
  assert.match(cardCss, /> \.h-44[\s\S]*width:\s*4\.75rem !important/);
  assert.match(cardCss, /> \.h-44[\s\S]*height:\s*4\.75rem !important/);
  assert.match(cardCss, /::before[\s\S]*background:\s*hsl\(var\(--muted\) \/ 0\.22\)/);

  // Identity, status and metrics reserve predictable vertical rhythm.
  assert.match(cardCss, /min-height:\s*3rem/);
  assert.match(cardCss, /min-height:\s*10\.25rem/);
  assert.match(cardCss, /min-height:\s*5\.25rem/);
  assert.match(cardCss, /-webkit-line-clamp:\s*2/);

  // Keep the authenticated image transport that prevents session/device regressions.
  assert.match(pageSource, /CatalogProtectedImage/);
  assert.match(pageSource, /image=\{product\.image_refs\[0\]\}/);

  // Visual harmonization must not change catalog money or inventory authority.
  assert.match(pageSource, /formatMerchantMoneyMinor\(product\.price_iqd/);
  assert.match(pageSource, /tracksInventory\(product\) \? product\.stock_quantity/);
  assert.match(pageSource, /toggleInventoryDetails\(product\.id\)/);
});
