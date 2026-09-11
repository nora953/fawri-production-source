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

test('RTL cashier shift control sits close to the brand without touching it', () => {
  assert.match(css, /html\[data-cashier-view='pos'\] main > div > header \{[\s\S]*position: relative;/);
  assert.match(
    css,
    /#cashier-root > div\.relative > div\.fixed:first-child[\s\S]*position: absolute !important;/,
  );
  assert.match(css, /top: 2rem !important;/);
  assert.match(css, /inset-inline-start: 8rem !important;/);
  assert.match(css, /> button \{[\s\S]*align-items: center !important;[\s\S]*justify-content: center !important;/);
  assert.match(css, /> span \{[\s\S]*display: none !important;/);
  assert.doesNotMatch(css, /height: calc\(100dvh - 46px\) !important;/);
  assert.doesNotMatch(css, /position: sticky !important;/);
});

test('runtime connectivity badge is left of end shift in RTL and stays softly rectangular', () => {
  assert.match(
    css,
    /header > div:last-child > div:first-child > span:first-child \{[\s\S]*position: absolute;/,
  );
  assert.match(css, /inset-inline-start: 16\.25rem;/);
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
