import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const visualQa = read('../public/assets/cashier-visual-qa.css');
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

test('cashier operational subpages share the POS desktop canvas and quiet back action', () => {
  assert.match(visualQa, /data-cashier-view='history'[\s\S]*data-cashier-view='reports'[\s\S]*max-width: 1500px !important;/);
  assert.match(visualQa, /data-cashier-view='reports'[\s\S]*a\[href='\/cashier\.html'\][\s\S]*background: #fff !important;/);
  assert.match(reports, /href="\/cashier\.html"/);
});

test('cashier history return controls remain touch-sized', () => {
  assert.match(visualQa, /section button\.text-orange-600[\s\S]*min-height: 38px;/);
  assert.match(visualQa, /button\.h-8\.w-8[\s\S]*width: 2\.5rem !important;[\s\S]*height: 2\.5rem !important;/);
});

test('cashier shell cache-busts the polished visual contract', () => {
  assert.match(cashierHtml, /cashier-visual-qa\.css\?v=subpage-polish-v1/);
});
