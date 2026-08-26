import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
const bottomNav = fs.readFileSync(new URL('../src/components/layout/BottomNav.tsx', import.meta.url), 'utf8');
const ownerReport = fs.readFileSync(new URL('../src/pages/dashboard/CashierCentralReportsPage.tsx', import.meta.url), 'utf8');
const employeeReport = fs.readFileSync(new URL('../src/pages/CashierReportsPage.tsx', import.meta.url), 'utf8');
const operatorReport = fs.readFileSync(new URL('../src/lib/cashierOperatorReportsRuntime.ts', import.meta.url), 'utf8');
const localReport = fs.readFileSync(new URL('../src/lib/cashierSalesReportRuntime.ts', import.meta.url), 'utf8');

test('merchant dashboard exposes a separate central multi-cashier report', () => {
  assert.match(app, /CashierCentralReportsPage/);
  assert.match(app, /path="\/dashboard\/cashiers\/reports"/);
  assert.match(ownerReport, /\/api\/cashier\/management\/report/);
  assert.match(ownerReport, /by_staff/);
  assert.match(ownerReport, /by_station/);
  assert.match(ownerReport, /activity/);
  assert.match(ownerReport, /activityByStaff/);
  assert.match(ownerReport, /activityByStation/);
  assert.match(sidebar, /href: "\/dashboard\/cashiers\/reports"/);
  assert.match(bottomNav, /href: "\/dashboard\/cashiers\/reports"/);
});

test('owner report never reconstructs cost or profit from client catalog state', () => {
  assert.doesNotMatch(ownerReport, /unit_cost_minor/);
  assert.doesNotMatch(ownerReport, /cost_evidence/);
  assert.doesNotMatch(ownerReport, /cashierCloudCatalogSync/);
  assert.match(ownerReport, /gross_profit_minor/);
  assert.match(ownerReport, /profit_status === 'unavailable'[\s\S]{0,100}\? null/);
  assert.match(ownerReport, /value\.value === null[\s\S]{0,120}`— \$\{value\.code\}`/);
});

test('employee reports remain operator-session and permission gated', () => {
  assert.match(operatorReport, /getCashierOperatorSession/);
  assert.match(operatorReport, /reports\.sales/);
  assert.match(operatorReport, /reports\.profit/);
  assert.match(operatorReport, /cashierOperatorHeaders/);
  assert.match(operatorReport, /\/api\/cashier\/operator\/report/);
  assert.match(operatorReport, /source: 'server_cashier'/);
  assert.match(operatorReport, /can_view_profit: payload\.can_view_profit/);
  assert.match(employeeReport, /cashierOperatorReportsRuntime/);
  assert.match(employeeReport, /createCashierOperatorReportsRuntime/);
  assert.match(employeeReport, /result\.can_view_profit/);
  assert.doesNotMatch(employeeReport, /createCashierReportsRuntime/);
});

test('operator report falls back locally only for offline or transport failure', () => {
  assert.match(operatorReport, /navigator\.onLine === false/);
  assert.match(operatorReport, /cause instanceof TypeError\) return null/);
  assert.match(operatorReport, /if \(!response\.ok \|\| payload\.ok !== true\)/);
  assert.match(operatorReport, /throw new CashierOperatorReportsError/);
  assert.match(operatorReport, /buildCashierSalesReport\(visibleSales, options\)/);
});

test('local cashier reporting uses sale return and void operation time', () => {
  assert.match(localReport, /applySale\(currencies, sale, from, to\)/);
  assert.match(localReport, /applyReturn\(currencies, sale, snapshot, from, to\)/);
  assert.match(localReport, /applyVoid\(currencies, sale, saleInRange, from, to\)/);
  assert.match(localReport, /requiredInstant\(snapshot\.occurred_at, 'return_time'\)/);
  assert.match(localReport, /requiredInstant\(sale\.void\.occurred_at, 'void_time'\)/);
});

test('employee UI renders compensation-only periods and distinguishes server from offline source', () => {
  assert.match(employeeReport, /const hasData = Boolean\(result && result\.report\.by_currency\.length > 0\)/);
  assert.match(employeeReport, /result\.source === 'server_cashier'/);
  assert.match(employeeReport, /labels\.serverSource/);
  assert.match(employeeReport, /labels\.localSource/);
  assert.match(employeeReport, /currency\.sale_count > 0 \? money\(currency\.average_ticket_minor\) : '—'/);
});

test('cashier management and report navigation do not collide', () => {
  assert.match(sidebar, /href: "\/dashboard\/cashiers"[\s\S]{0,100}exact: true/);
  assert.match(bottomNav, /href: "\/dashboard\/cashiers"[\s\S]{0,100}exact: true/);
  assert.match(ownerReport, /href="\/dashboard\/cashiers"/);
});

test('central UI separates sale ownership from executed return and void activity', () => {
  assert.match(ownerReport, /salesByStaff/);
  assert.match(ownerReport, /salesByStation/);
  assert.match(ownerReport, /sale_count/);
  assert.match(ownerReport, /return_count/);
  assert.match(ownerReport, /void_count/);
  assert.match(ownerReport, /ActivityCard/);
});

test('central UI provides filterable detailed operations without exposing internal ids as primary labels', () => {
  assert.match(ownerReport, /activity\.operations/);
  assert.match(ownerReport, /operation_detail_limit/);
  assert.match(ownerReport, /staffFilter/);
  assert.match(ownerReport, /stationFilter/);
  assert.match(ownerReport, /kindFilter/);
  assert.match(ownerReport, /operationDetails/);
  assert.match(ownerReport, /filteredOperations/);
  assert.match(ownerReport, /item\.staff_name \|\| labels\.formerEmployee/);
  assert.match(ownerReport, /item\.station_name \|\| labels\.formerStation/);
  assert.match(ownerReport, /item\.shift_id/);
  assert.match(ownerReport, /item\.occurred_at/);
  assert.match(ownerReport, /operationMoney\(item, lang\)/);
  assert.match(ownerReport, /shortReference\(item\.sale_id/);
});

test('central UI does not hide a return-only or void-only period', () => {
  assert.match(ownerReport, /currencies\.length > 0 \|\| activityTotal\(result\) > 0/);
  assert.doesNotMatch(ownerReport, /hasSales/);
});
