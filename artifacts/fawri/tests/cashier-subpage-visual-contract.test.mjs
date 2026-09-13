import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const visualQa = read('../public/assets/cashier-visual-qa.css');
const historyPolish = read('../public/assets/cashier-history-polish.css');
const reportsPolish = read('../public/assets/cashier-reports-polish.css');
const history = read('../src/pages/CashierHistoryPage.tsx');
const reports = read('../src/pages/CashierReportsPage.tsx');
const operatorGate = read('../src/components/cashier/CashierOperatorGate.tsx');
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

test('cashier reports isolates top-product rank and mixed-direction names', () => {
  assert.match(reports, /<span className="shrink-0 text-slate-400" dir="ltr">#\{index \+ 1\}<\/span>/);
  assert.match(reports, /<bdi dir="auto" className="min-w-0 break-words">\{product\.product_name\}<\/bdi>/);
  assert.match(reports, /<bdi dir="auto">\{product\.variant_name\}<\/bdi>/);
  assert.doesNotMatch(reports, /<span className="me-2 text-slate-400">#\{index \+ 1\}<\/span>\{product\.product_name\}/);
});

test('cashier report metric values follow the page direction without losing numeric isolation', () => {
  assert.match(reportsPolish, /main\[dir='rtl'\][\s\S]*section > div\.grid > div > p\.mt-2 \{[\s\S]*text-align: right !important;/);
  assert.match(reportsPolish, /main\[dir='ltr'\][\s\S]*section > div\.grid > div > p\.mt-2 \{[\s\S]*text-align: left !important;/);
  assert.match(reportsPolish, /font-variant-numeric: tabular-nums;/);
  assert.match(reportsPolish, /unicode-bidi: isolate;/);
  assert.match(reports, /<p className="mt-2 truncate text-xl font-extrabold"><bdi dir="ltr">\{value\}<\/bdi><\/p>/);
  assert.doesNotMatch(reports, /<p className="mt-2 truncate text-xl font-extrabold" dir="ltr">\{value\}<\/p>/);
});

test('cashier reports groups return and void counts inside their monetary metric', () => {
  assert.match(reports, /refunds: 'قيمة المرتجعات والإلغاءات'/);
  assert.match(reports, /refunds: 'Returns & voids value'/);
  assert.match(reports, /title=\{labels\.refunds\}[\s\S]*value=\{money\(currency\.refunds_minor\)\}[\s\S]*meta=\{/);
  assert.match(reports, /\{labels\.returns\}: <bdi dir="ltr" className="font-bold text-slate-700">\{currency\.return_count\}<\/bdi>/);
  assert.match(reports, /\{labels\.voids\}: <bdi dir="ltr" className="font-bold text-slate-700">\{currency\.voided_sale_count\}<\/bdi>/);
  assert.match(reports, /\{meta \? <div className="mt-2 border-t border-slate-100 pt-2">\{meta\}<\/div> : null\}/);
  assert.doesNotMatch(reports, /<div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">/);
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
});

test('cashier history gives scrolling only to the bounded sales list on desktop', () => {
  assert.match(historyPolish, /one bounded scroll surface only: the potentially long[\s\S]*sales list/);
  assert.match(historyPolish, /section:first-child \{[\s\S]*height: clamp\(22rem, calc\(100dvh - 10rem\), 44rem\);[\s\S]*overflow: hidden !important;/);
  assert.match(historyPolish, /section:first-child > div\.p-2 \{[\s\S]*overflow-y: auto !important;[\s\S]*overscroll-behavior: contain;/);
  assert.match(historyPolish, /::-webkit-scrollbar \{[\s\S]*width: 7px;[\s\S]*background: transparent;/);
  assert.match(historyPolish, /::-webkit-scrollbar-button[\s\S]*display: none !important;[\s\S]*width: 0 !important;[\s\S]*height: 0 !important;/);
  assert.match(historyPolish, /@supports not selector\(::-webkit-scrollbar\) \{[\s\S]*scrollbar-width: thin;[\s\S]*scrollbar-color: #cbd5e1 transparent;/);
  assert.match(historyPolish, /section:last-child \{[\s\S]*overflow: visible !important;/);
});

test('cashier history keeps sale details compact without a nested scroll surface', () => {
  assert.match(historyPolish, /Detail card: no internal scrolling/);
  assert.match(historyPolish, /section:last-child > div > div:first-child \{[\s\S]*padding-block: 0\.75rem !important;/);
  assert.match(historyPolish, /section:last-child > div > div\.grid \{[\s\S]*gap: 0\.5rem !important;[\s\S]*padding-block: 0\.75rem !important;/);
  assert.match(historyPolish, /section:last-child > div > div\.p-4 \{[\s\S]*padding-block: 0\.75rem !important;/);
});

test('cashier operator gate uses route-aware loading copy without catalog flash on subpages', () => {
  assert.match(operatorGate, /historyPreparing: 'جارٍ فتح سجل المبيعات\.\.\.'/);
  assert.match(operatorGate, /reportsPreparing: 'جارٍ فتح تقارير المبيعات\.\.\.'/);
  assert.match(operatorGate, /if \(params\.get\('history'\) === '1'\) return labels\.historyPreparing;/);
  assert.match(operatorGate, /if \(params\.get\('reports'\) === '1'\) return labels\.reportsPreparing;/);
  assert.match(operatorGate, /cashier-operator-gate-loading/);
  assert.match(operatorGate, /\{pageLoadingLabel\(labels\)\}/);
});

test('cashier history page-height polish cannot stretch the operator gate loader', () => {
  assert.match(historyPolish, /#cashier-root > div\.relative > main \{[\s\S]*min-height: 100vh !important;/);
  assert.match(historyPolish, /#cashier-root > div\.relative > main > div \{[\s\S]*min-height: 100vh !important;/);
  assert.doesNotMatch(historyPolish, /html\[data-cashier-view='history'\] main > div \{[\s\S]*min-height: 100vh !important;/);
});

test('cashier shell cache-busts the polished visual contracts', () => {
  assert.match(cashierHtml, /cashier-visual-qa\.css\?v=subpage-polish-v1/);
  assert.match(cashierHtml, /cashier-history-polish\.css\?v=history-sales-scroll-v5/);
  assert.match(cashierHtml, /cashier-reports-polish\.css\?v=reports-metric-align-v1/);
});
