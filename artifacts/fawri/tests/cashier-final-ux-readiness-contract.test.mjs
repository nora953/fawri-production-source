import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gate = await readFile(new URL('../src/components/cashier/CashierOperatorGate.tsx', import.meta.url), 'utf8');
const history = await readFile(new URL('../src/pages/CashierHistoryPage.tsx', import.meta.url), 'utf8');
const posCss = await readFile(new URL('../src/styles/cashierPos.css', import.meta.url), 'utf8');
const preview = await readFile(new URL('../../../scripts/run-fawri-preview.mjs', import.meta.url), 'utf8');
const readiness = await readFile(new URL('../../../lib/db/scripts/cashier-staff-authority-readiness.mjs', import.meta.url), 'utf8');

test('cashier operator UI uses localized shift wording and the shared select component', () => {
  assert.match(gate, /loginTitle: 'بدء مناوبة الكاشير'/);
  assert.match(gate, /logout: 'إنهاء المناوبة'/);
  assert.doesNotMatch(gate, /وردية/);
  assert.match(gate, /from '@\/components\/ui\/select'/);
  assert.match(gate, /<SelectTrigger/);
});

test('active operator identity is displayed away from the checkout CTA using employee role and station', () => {
  assert.match(gate, /operatorName/);
  assert.match(gate, /selectedStaff\?\.display_name/);
  assert.match(gate, /top-3/);
  assert.match(gate, /state\.binding\.station_name/);
  assert.match(gate, /roleLabel\(state\.session\.context\.role\)/);
  assert.doesNotMatch(gate, /bottom-3/);
});

test('cashier POS hides report navigation when reports permission is denied', () => {
  assert.match(posCss, /data-cashier-can-reports='0'/);
  assert.match(posCss, /a\[href\*='reports=1'\]/);
  assert.match(posCss, /display: none !important/);
});

test('voided cashier sales never advertise returnable quantity', () => {
  assert.match(history, /if \(sale\.status === 'voided' \|\| sale\.void\) return 0/);
  assert.match(history, /selectedSale\.status !== 'voided' && !selectedSale\.void \? <span>\{labels\.returnable\(remaining\)\}<\/span> : null/);
});

test('preview fails closed when multi-cashier PostgreSQL authority is not ready', () => {
  assert.match(preview, /cashier-staff-authority-readiness\.mjs/);
  assert.match(preview, /Verifying PostgreSQL multi-cashier staff\/station authority/);
  assert.match(preview, /await runCommand\(process\.execPath, \[cashierStaffReadinessScript\]\)/);
  assert.match(readiness, /BEGIN READ ONLY/);
  assert.match(readiness, /merchant_cashier_staff/);
  assert.match(readiness, /merchant_cashier_stations/);
  assert.match(readiness, /cashier_operator_sessions/);
  assert.match(readiness, /cashier_operation_attribution/);
  assert.match(readiness, /database_writes_performed: false/);
  assert.doesNotMatch(readiness, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALTER\b|\bCREATE\b/i);
});
