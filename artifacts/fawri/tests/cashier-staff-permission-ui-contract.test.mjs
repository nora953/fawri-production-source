import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const management = await readFile(
  new URL('../src/pages/dashboard/CashierManagementPage.tsx', import.meta.url),
  'utf8',
);
const dashboardLayout = await readFile(
  new URL('../src/components/layout/DashboardLayout.tsx', import.meta.url),
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

test('merchant can edit existing staff permissions and optional access code with optimistic versioning', () => {
  assert.match(management, /editingStaffId/);
  assert.match(management, /saveStaffEdit/);
  assert.match(management, /expected_version: member\.version/);
  assert.match(management, /permissions: \[\.\.\.withBasePermissions\(editPermissions\)\]/);
  assert.match(management, /\.\.\.\(editPin \? \{ pin: editPin \} : \{\}\)/);
  assert.match(management, /method: 'PATCH'/);
});

test('successful staff creation resets name access code role and permissions to cashier defaults', () => {
  assert.match(management, /const resetAddStaff/);
  assert.match(management, /setStaffName\(''\)/);
  assert.match(management, /setPin\(''\)/);
  assert.match(management, /setRole\('cashier'\)/);
  assert.match(management, /setPermissions\(recommended\('cashier'\)\)/);
  assert.match(management, /resetAddStaff\(\)[\s\S]*setAddStaffOpen\(false\)[\s\S]*await load\(\)/);
});

test('cashier staff creation and editing are modal so forms cannot starve the staff lists', () => {
  assert.match(management, /addStaffOpen/);
  assert.match(management, /addStationOpen/);
  assert.match(management, /function Modal/);
  assert.match(management, /\{addStaffOpen \? \(/);
  assert.match(management, /\{editingMember \? \(/);
  assert.match(management, /\{addStationOpen \? \(/);
  assert.match(management, /max-h-\[calc\(100dvh-2rem\)\]/);
});

test('cashier staff identity and access-code fields resist browser credential autofill', () => {
  assert.match(management, /name="cashier-staff-display-name-new"[\s\S]*autoComplete="off"/);
  assert.match(management, /name="cashier-staff-pin-new"[\s\S]*autoComplete="new-password"/);
  assert.match(management, /name="cashier-staff-display-name-edit"[\s\S]*autoComplete="off"/);
  assert.match(management, /name="cashier-staff-pin-edit"[\s\S]*autoComplete="new-password"/);
  assert.match(management, /data-1p-ignore="true"/);
  assert.match(management, /data-lpignore="true"/);
});

test('Arabic and Kurdish cashier staff UI do not expose PIN as an untranslated label', () => {
  assert.match(management, /pin: 'رمز الدخول من 4 إلى 8 أرقام'/);
  assert.match(management, /newPin: 'رمز دخول جديد \(اختياري\)'/);
  assert.match(management, /pin: 'کۆدی چوونەژوورەوە لە 4 تا 8 ژمارە'/);
  assert.doesNotMatch(management, /ar:\s*\{[\s\S]{0,800}\bPIN\b/);
});

test('pairing modal keeps long code LTR and provides explicit clipboard copy feedback', () => {
  assert.match(management, /navigator\.clipboard\?\.writeText/);
  assert.match(management, /copyPairingCode/);
  assert.match(management, /copyCode: 'نسخ الرمز'/);
  assert.match(management, /copied: 'تم النسخ'/);
  assert.match(management, /overflow-x-auto[\s\S]*font-mono[\s\S]*dir="ltr"/);
});

test('desktop staff management keeps the dashboard page fixed and scrolls only growing lists', () => {
  assert.match(management, /xl:h-\[calc\(100dvh-4rem\)\]/);
  assert.match(management, /xl:overflow-hidden/);
  assert.match(management, /min-h-0 flex-1 space-y-2 overflow-y-auto/);
  assert.match(dashboardLayout, /lockCashierManagementViewport = location === '\/dashboard\/cashiers'/);
  assert.match(dashboardLayout, /xl:h-\[100dvh\] xl:overflow-hidden/);
  assert.match(dashboardLayout, /xl:min-h-0 xl:overflow-hidden/);
});

test('known merchant session errors are localized instead of displaying raw API English', () => {
  assert.match(management, /sessionExpired: 'انتهت جلسة التاجر/);
  assert.match(management, /code\.includes\('MERCHANT_SESSION'\)/);
  assert.doesNotMatch(management, /setError\(cause instanceof Error \? cause\.message/);
});
