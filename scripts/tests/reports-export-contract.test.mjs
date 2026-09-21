import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("report surfaces expose custom date range, Excel export, print and charts", () => {
  const cashier = read("artifacts/fawri/src/pages/dashboard/CashierCentralReportsPage.tsx");
  const reports = read("artifacts/fawri/src/pages/dashboard/ReportsPage.tsx");
  const toolbar = read("artifacts/fawri/src/components/reports/ReportToolbar.tsx");
  const printCss = read("artifacts/fawri/src/pages/dashboard/reports-print.css");
  const workbook = read("artifacts/fawri/src/lib/reportWorkbook.ts");

  assert.match(toolbar, /Dialog/);
  assert.match(toolbar, /DialogContent/);
  assert.match(toolbar, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(toolbar, /overflow-y-auto/);
  assert.match(toolbar, /Calendar/);
  assert.match(toolbar, /mode="range"/);
  assert.match(toolbar, /min=\{1\}/);
  assert.match(toolbar, /numberOfMonths=\{desktopCalendar \? 2 : 1\}/);
  assert.match(toolbar, /displayDateDayFirst/);
  assert.match(toolbar, /\$\{day\}\/\$\{month\}\/\$\{year\}/);
  assert.match(toolbar, /Quick ranges/);
  assert.match(toolbar, /Choose the start date, then the end date on the calendar\./);
  assert.match(toolbar, /Cancel/);
  assert.match(toolbar, /Apply/);
  assert.match(toolbar, /draftRange\.to \?\? draftRange\.from/);
  assert.doesNotMatch(toolbar, /type="date"/);
  assert.match(toolbar, /Download Excel/);
  assert.match(toolbar, /Print \/ Save PDF/);
  assert.match(toolbar, /localDateEndExclusive/);
  assert.match(toolbar, /params\.set\('to'/);

  assert.match(cashier, /top_profitable_products/);
  assert.match(cashier, /ResponsiveContainer/);
  assert.match(cashier, /downloadWorkbook/);
  assert.match(cashier, /labels\.currency/);
  assert.match(cashier, /labels\.period/);
  assert.match(cashier, /formatDayFirstDateTime/);
  assert.match(cashier, /columnWidths/);
  assert.match(cashier, /autoFilter: true/);
  assert.match(cashier, /item\.sale_id/);
  assert.match(cashier, /item\.shift_id/);
  assert.match(cashier, /currency\.profit_status === 'unavailable' \? ''/);
  assert.match(cashier, /window\.print\(\)/);
  assert.match(cashier, /xl:overflow-x-visible/);
  assert.match(cashier, /xl:min-w-0/);

  assert.match(reports, /reportRangeQuery/);
  assert.match(reports, /downloadWorkbook/);
  assert.match(reports, /profitabilityUnavailable/);
  assert.match(reports, /reports-print\.css/);
  assert.match(printCss, /@media print/);
  assert.match(printCss, /report-no-print/);
  assert.match(workbook, /!cols/);
  assert.match(workbook, /!autofilter/);
  assert.match(workbook, /#,##0/);
});

test("cashier profitability requires complete historical cost evidence", () => {
  const service = read(
    "artifacts/api-server/src/services/postgresCashierCentralReportAuthority.ts",
  );

  assert.match(service, /cost_unknown_affected_units/);
  assert.match(service, /profit_status/);
  assert.match(service, /top_profitable_products/);
  assert.match(service, /product\.profit_status === "available"/);
  assert.match(service, /gross_profit_minor/);
  assert.doesNotMatch(service, /unit_cost_minor \?\? 0/);
});
