import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
const bottomNav = fs.readFileSync(new URL('../src/components/layout/BottomNav.tsx', import.meta.url), 'utf8');
const ownerReport = fs.readFileSync(new URL('../src/pages/dashboard/CashierCentralReportsPage.tsx', import.meta.url), 'utf8');
const employeeReport = fs.readFileSync(new URL('../src/pages/CashierReportsPage.tsx', import.meta.url), 'utf8');
const operatorReport = fs.readFileSync(new URL('../src/lib/cashierOperatorReportsRuntime.ts', import.meta.url), 'utf8');

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

test('employee reports remain directly operator-session and permission gated', () => {
  assert.match(operatorReport, /getCashierOperatorSession/);
  assert.match(operatorReport, /reports\.sales/);
  assert.match(operatorReport, /reports\.profit/);
  assert.match(operatorReport, /can_view_profit: canViewProfit/);
  assert.match(employeeReport, /cashierOperatorReportsRuntime/);
  assert.match(employeeReport, /createCashierOperatorReportsRuntime/);
  assert.match(employeeReport, /result\.can_view_profit/);
  assert.doesNotMatch(employeeReport, /createCashierReportsRuntime/);
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
