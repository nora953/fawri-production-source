import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const management = await readFile(
  new URL('../src/pages/dashboard/CashierManagementPage.tsx', import.meta.url),
  'utf8',
);

test('merchant cashier staff UI offers only currently implemented employee permissions', () => {
  assert.match(management, /'sale\.view_all'/);
  assert.match(management, /'sale\.return'/);
  assert.match(management, /'sale\.void'/);
  assert.match(management, /'reports\.sales'/);
  assert.match(management, /'reports\.profit'/);
  assert.doesNotMatch(management, /'inventory\.adjust'/);
  assert.doesNotMatch(management, /'shifts\.manage'/);
  assert.doesNotMatch(management, /'catalog\.cost'/);
  assert.doesNotMatch(management, /'staff\.manage'/);
  assert.doesNotMatch(management, /'stations\.manage'/);
});

test('profit grant always implies sales-report permission in merchant UI', () => {
  assert.match(management, /permission === 'reports\.profit'[\s\S]*next\.add\('reports\.sales'\)/);
  assert.match(management, /permission === 'reports\.sales'[\s\S]*next\.delete\('reports\.profit'\)/);
});

test('staff cards localize permission codes instead of rendering internal permission strings', () => {
  assert.match(management, /function permissionLabel|const permissionLabel/);
  assert.match(management, /'sale\.create': l\.createSales/);
  assert.match(management, /'sale\.view_own': l\.ownSales/);
  assert.match(management, /'reports\.profit': l\.profitReports/);
  assert.match(management, /member\.permissions\.map\(permission =>[\s\S]*permissionLabel\(permission\)/);
  assert.doesNotMatch(management, /member\.permissions\.map\(permission =>\s*<span[^>]*>\{permission\}/);
});

test('merchant can edit existing staff permissions and optional PIN with optimistic versioning', () => {
  assert.match(management, /editingStaffId/);
  assert.match(management, /saveStaffEdit/);
  assert.match(management, /expected_version: member\.version/);
  assert.match(management, /permissions: \[\.\.\.withBasePermissions\(editPermissions\)\]/);
  assert.match(management, /\.\.\.\(editPin \? \{ pin: editPin \} : \{\}\)/);
  assert.match(management, /method: 'PATCH'/);
});

test('successful staff creation resets name PIN role and permissions to cashier defaults', () => {
  assert.match(management, /const resetAddStaff/);
  assert.match(management, /setStaffName\(''\)/);
  assert.match(management, /setPin\(''\)/);
  assert.match(management, /setRole\('cashier'\)/);
  assert.match(management, /setPermissions\(recommended\('cashier'\)\)/);
  assert.match(management, /resetAddStaff\(\); await load\(\)/);
});

test('pairing modal keeps long code LTR and provides explicit clipboard copy feedback', () => {
  assert.match(management, /navigator\.clipboard\?\.writeText/);
  assert.match(management, /copyPairingCode/);
  assert.match(management, /copyCode: 'نسخ الرمز'/);
  assert.match(management, /copied: 'تم النسخ'/);
  assert.match(management, /overflow-x-auto[\s\S]*font-mono[\s\S]*dir="ltr"/);
});

test('desktop staff management keeps page fixed and scrolls growing staff and station lists internally', () => {
  assert.match(management, /xl:h-\[calc\(100dvh-7rem\)\]/);
  assert.match(management, /xl:overflow-hidden/);
  assert.match(management, /xl:overflow-y-auto/);
});

test('known merchant session errors are localized instead of displaying raw API English', () => {
  assert.match(management, /sessionExpired: 'انتهت جلسة التاجر/);
  assert.match(management, /code\.includes\('MERCHANT_SESSION'\)/);
  assert.doesNotMatch(management, /setError\(cause instanceof Error \? cause\.message/);
});
