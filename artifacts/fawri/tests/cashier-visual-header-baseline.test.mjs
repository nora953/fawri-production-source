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

test('RTL cashier identity cluster stays inside the POS header footprint', () => {
  assert.match(css, /html\[data-cashier-view='pos'\] main > div > header \{[\s\S]*position: relative;/);
  assert.match(
    css,
    /#cashier-root > div\.relative > div\.fixed:first-child[\s\S]*position: absolute !important;/,
  );
  assert.match(css, /top: 2rem !important;/);
  assert.match(css, /inset-inline-start: 13\.4rem !important;/);
  assert.match(css, /> button \{[\s\S]*order: 1;[\s\S]*align-items: center !important;[\s\S]*justify-content: center !important;/);
  assert.match(css, /> span \{[\s\S]*order: 2;[\s\S]*align-items: center;/);
  assert.match(css, /unicode-bidi: isolate;/);
  assert.doesNotMatch(css, /height: calc\(100dvh - 46px\) !important;/);
  assert.doesNotMatch(css, /position: sticky !important;/);
});

test('runtime connectivity badge is a soft rectangular status beside the cashier brand', () => {
  assert.match(
    css,
    /header > div:last-child > div:first-child > span:first-child \{[\s\S]*position: absolute;/,
  );
  assert.match(css, /inset-inline-start: 8\.45rem;/);
  assert.match(css, /transform: translateY\(-50%\);/);
  assert.match(css, /border-radius: 0\.625rem !important;/);
  assert.match(css, /span:first-child\.bg-emerald-50 \{[\s\S]*border: 1px solid #a7f3d0 !important;[\s\S]*background: #ecfdf5 !important;/);
  assert.match(css, /span:first-child\.bg-slate-100 \{[\s\S]*border: 1px solid #cbd5e1 !important;[\s\S]*background: #f8fafc !important;/);
});

test('POS header controls keep a consistent translated-label friendly baseline', () => {
  assert.match(css, /min-height: 36px;/);
  assert.match(css, /white-space: nowrap;/);
  assert.match(css, /row-gap: 0\.5rem !important;/);
});
