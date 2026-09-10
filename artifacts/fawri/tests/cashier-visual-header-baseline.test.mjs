import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../cashier.html', import.meta.url), 'utf8');
const css = fs.readFileSync(
  new URL('../public/assets/cashier-visual-qa.css', import.meta.url),
  'utf8',
);
const serviceWorker = fs.readFileSync(
  new URL('../public/cashier-sw.js', import.meta.url),
  'utf8',
);

test('cashier visual QA stylesheet participates in the offline asset graph', () => {
  assert.match(html, /href="\/assets\/cashier-visual-qa\.css"/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/assets\/'\)/);
  assert.match(serviceWorker, /htmlAssetPaths\(shellText\)/);
});

test('operator session controls occupy their own layout row instead of covering the cashier header', () => {
  assert.match(
    css,
    /#cashier-root > div\.relative > div\.fixed:first-child[\s\S]*position: sticky !important;/,
  );
  assert.match(css, /height: calc\(100dvh - 46px\) !important;/);
  assert.match(css, /border-bottom: 1px solid #e2e8f0 !important;/);
});

test('POS header controls keep a consistent translated-label friendly baseline', () => {
  assert.match(css, /html\[data-cashier-view='pos'\] main > div > header/);
  assert.match(css, /min-height: 36px;/);
  assert.match(css, /white-space: nowrap;/);
  assert.match(css, /row-gap: 0\.5rem !important;/);
});
