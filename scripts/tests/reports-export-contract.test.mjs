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

  assert.match(toolbar, /type="date"/);
  assert.match(toolbar, /displayDateDayFirst/);
  assert.match(toolbar, /\$\{day\}\/\$\{month\}\/\$\{year\}/);
  assert.match(toolbar, /Custom range/);
  assert.match(toolbar, /Choose the start and end dates, then apply the range\./);
  assert.match(toolbar, /Download Excel/);
  assert.match(toolbar, /Print \/ Save PDF/);
  assert.match(toolbar, /localDateEndExclusive/);
  assert.match(toolbar, /params\.set\('to'/);

  assert.match(cashier, /top_profitable_products/);
  assert.match(cashier, /ResponsiveContainer/);
  assert.match(cashier, /downloadWorkbook/);
  assert.match(cashier, /window\.print\(\)/);
  assert.match(cashier, /xl:overflow-x-visible/);
  assert.match(cashier, /xl:min-w-0/);

  assert.match(reports, /reportRangeQuery/);
  assert.match(reports, /downloadWorkbook/);
  assert.match(reports, /profitabilityUnavailable/);
  assert.match(reports, /reports-print\.css/);
  assert.match(printCss, /@media print/);
  assert.match(printCss, /report-no-print/);
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
