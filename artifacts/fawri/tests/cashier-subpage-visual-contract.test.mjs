import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const visualQa = read('../public/assets/cashier-visual-qa.css');
const historyPolish = read('../public/assets/cashier-history-polish.css');
const history = read('../src/pages/CashierHistoryPage.tsx');
const reports = read('../src/pages/CashierReportsPage.tsx');
const cashierHtml = read('../cashier.html');

test('cashier history and reports do not expose the floating shift dock', () => {
  assert.match(
    visualQa,
    /html\[data-cashier-view='history'\][\s\S]*#cashier-root > div\.relative > div\.fixed:first-child,[\s\S]*html\[data-cashier-view='reports'\][\s\S]*display: none !important;/,
  );
});

test('cashier history keeps connectivity beside identity and navigation at the far edge', () => {
  assert.match(history, /online \? labels\.online : labels\.offline/);
  assert.match(visualQa, /data-cashier-view='history'[\s\S]*header > div:last-child \{[\s\S]*display: contents !important;/);
  assert.match(visualQa, /data-cashier-view='history'[\s\S]*header > div:last-child > a \{[\s\S]*margin-inline-start: auto !important;/);
  assert.match(visualQa, /data-cashier-view='history'[\s\S]*span\.bg-emerald-50[\s\S]*border: 1px solid #a7f3d0 !important;/);
});

test('cashier reports exposes live connectivity with the POS badge hierarchy', () => {
  assert.match(reports, /const \[online, setOnline\] = useState\(\(\) => navigator\.onLine\)/);
  assert.match(reports, /window\.addEventListener\('online', updateOnline\)/);
  assert.match(reports, /window\.addEventListener\('offline', updateOnline\)/);
  assert.match(reports, /online \? labels\.online : labels\.offline/);
  assert.match(reports, /inline-flex h-8 items-center justify-center rounded-\[0\.625rem\]/);
  assert.match(reports, /online: 'متصل'/);
  assert.match(reports, /offline: 'غير متصل'/);
});

test('cashier operational subpages share the POS desktop canvas and quiet back action', () => {
  assert.match(visualQa, /data-cashier-view='history'[\s\S]*data-cashier-view='reports'[\s\S]*max-width: 1500px !important;/);
  assert.match(visualQa, /data-cashier-view='reports'[\s\S]*a\[href='\/cashier\.html'\][\s\S]*background: #fff !important;/);
  assert.match(reports, /max-w-\[1500px\] p-3 lg:p-4/);
  assert.match(reports, /href="\/cashier\.html" className="rounded-xl border border-slate-200 bg-white/);
});

test('cashier history return controls remain touch-sized', () => {
  assert.match(visualQa, /section button\.text-orange-600[\s\S]*min-height: 38px;/);
  assert.match(visualQa, /button\.h-8\.w-8[\s\S]*width: 2\.5rem !important;[\s\S]*height: 2\.5rem !important;/);
});

test('cashier history keeps mixed sale references readable and evidence metadata clear', () => {
  assert.match(historyPolish, /unicode-bidi: plaintext;/);
  assert.match(historyPolish, /font-variant-numeric: tabular-nums;/);
  assert.match(historyPolish, /font-size: 0\.75rem !important;/);
  assert.match(historyPolish, /scrollbar-width: thin;/);
  assert.match(historyPolish, /width: 7px;/);
});

test('cashier shell cache-busts the polished visual contracts', () => {
  assert.match(cashierHtml, /cashier-visual-qa\.css\?v=subpage-polish-v1/);
  assert.match(cashierHtml, /cashier-history-polish\.css\?v=history-readability-v1/);
});
