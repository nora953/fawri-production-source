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
  assert.match(cashier, /labels\.location,\s*labels\.station,\s*labels\.amount,\s*labels\.currency,\s*labels\.saleReference,\s*labels\.shift/);
  assert.match(cashier, /metric: 'المؤشر'/);
  assert.match(cashier, /value: 'القيمة'/);
  assert.match(cashier, /\[labels\.currency, labels\.metric, labels\.value, labels\.profitStatus\]/);
  assert.match(cashier, /columnWidths: \[14, 28, 20, 18\]/);
  assert.match(cashier, /cashierExportSheetNames/);
  assert.match(cashier, /summary: 'الملخص'/);
  assert.match(cashier, /topSelling: 'الأكثر مبيعًا'/);
  assert.match(cashier, /topProfitable: 'الأكثر ربحية'/);
  assert.match(cashier, /operations: 'العمليات'/);
  assert.match(cashier, /mergeRanges:/);
  assert.match(cashier, /startRow: 1, startColumn: 1, endRow: 1, endColumn: 3/);
  assert.match(cashier, /startRow: 3, startColumn: 0, endRow: 3, endColumn: 3/);
  assert.match(cashier, /rowHeights: \[24, 22, 22, 22, 10, 24\]/);
  assert.match(cashier, /columnWidths: \[24, 18, 12, 16, 18, 14, 10, 42, 44\]/);
  assert.match(cashier, /ltrDataColumns: \[0, 7, 8\]/);
  assert.match(cashier, /\{ row: 1, column: 1 \}/);
  assert.match(cashier, /\{ row: 2, column: 1 \}/);
  assert.match(cashier, /currency\.profit_status === 'unavailable' \? ''/);
  assert.match(cashier, /window\.print\(\)/);
  assert.match(cashier, /report-print-only/);
  assert.match(cashier, /report-print-metrics/);
  assert.match(cashier, /report-print-currency-section/);
  assert.match(cashier, /report-print-two-column/);
  assert.match(cashier, /report-print-three-column/);
  assert.match(cashier, /report-print-operation-details/);
  assert.match(cashier, /report-print-operation-table/);
  assert.match(cashier, /localizedLegacyName/);
  assert.match(cashier, /unattributed legacy location/);
  assert.match(cashier, /unattributed legacy cashier/);
  assert.match(cashier, /unattributed legacy station/);
  assert.match(cashier, /report-print-group-card/);
  assert.match(cashier, /report-print-group-stats/);
  assert.match(cashier, /report-print-activity-card/);
  assert.match(cashier, /report-print-activity-stats/);
  assert.match(cashier, /report-print-footer-note/);
  assert.match(cashier, /xl:overflow-x-visible/);
  assert.match(cashier, /xl:min-w-0/);

  assert.match(reports, /reportRangeQuery/);
  assert.match(reports, /downloadWorkbook/);
  assert.match(reports, /profitabilityUnavailable/);
  assert.match(reports, /reports-print\.css/);
  assert.match(printCss, /@media print/);
  assert.match(printCss, /report-no-print/);
  assert.match(printCss, /report-print-only/);
  assert.match(printCss, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(printCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(printCss, /break-before: page/);
  assert.match(printCss, /display: table-header-group/);
  assert.match(printCss, /report-print-operation-table/);
  assert.match(printCss, /scrollbar-width: none/);
  assert.match(printCss, /::-webkit-scrollbar/);
  assert.match(printCss, /display: none/);
  assert.match(printCss, /report-print-operation-details tbody tr/);
  assert.match(printCss, /height: 28mm/);
  assert.match(printCss, /font-size: 10\.5pt/);
  assert.match(printCss, /font-size: 6\.7pt/);
  assert.match(printCss, /report-print-group-card/);
  assert.match(printCss, /report-print-activity-card/);
  assert.match(printCss, /recharts-tooltip-wrapper/);
  assert.match(printCss, /report-print-chart \.recharts-yAxis/);
  assert.match(printCss, /report-print-footer-note/);
  assert.match(cashier, /rtlText: lang !== 'en'/);
  assert.match(workbook, /stylesXml/);
  assert.match(workbook, /ltrCells/);
  assert.match(workbook, /ltrDataColumns/);
  assert.match(workbook, /readingOrder="1"/);
  assert.match(workbook, /<borders count="2">/);
  assert.match(workbook, /style="thin"/);
  assert.match(workbook, /numFmtId="3"/);
  assert.match(workbook, /mergeRanges/);
  assert.match(workbook, /rowHeights/);
  assert.match(workbook, /<autoFilter ref=/);
  assert.match(workbook, /fileType: 'zip'/);
  assert.match(workbook, /new ArrayBuffer\(bytes\.byteLength\)/);
  assert.match(workbook, /new Uint8Array\(arrayBuffer\)\.set\(bytes\)/);
  assert.match(workbook, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
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
