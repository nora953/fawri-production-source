import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const page = fs.readFileSync(
  path.join(root, 'src/pages/dashboard/CashierManagementPage.tsx'),
  'utf8',
);

test('station edit exposes explicit disable and enable controls', () => {
  assert.match(page, /stationStatus:\s*'حالة المحطة'/);
  assert.match(page, /disableStation:\s*'تعطيل المحطة'/);
  assert.match(page, /enableStation:\s*'تفعيل المحطة'/);
  assert.match(page, /const toggleStationStatus = async \(station: StationView\)/);
  assert.match(page, /\/api\/cashier\/management\/stations\/\$\{encodeURIComponent\(station\.id\)\}/);
  assert.match(page, /status: disabling \? 'disabled' : 'active'/);
});

test('disabling a station warns that pairing is revoked and offline authority cannot be edited while disabled', () => {
  assert.match(page, /window\.confirm\(l\.disableStationWarning\)/);
  assert.match(page, /تعطيل هذه المحطة سيفك ربط الجهاز فورًا/);
  assert.match(page, /editingStation\.status !== 'active'/);
  assert.match(page, /disabled=\{editingStation\.status !== 'active'\}/);
});
