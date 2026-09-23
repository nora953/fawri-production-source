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

test("merchant navigation exposes one reports hub", () => {
  const sidebar = read("artifacts/fawri/src/components/layout/Sidebar.tsx");
  const bottomNav = read("artifacts/fawri/src/components/layout/BottomNav.tsx");
  const app = read("artifacts/fawri/src/App.tsx");

  assert.match(sidebar, /href: "\/dashboard\/reports"/);
  assert.match(sidebar, /"Reports"/);
  assert.match(sidebar, /"التقارير"/);
  assert.match(sidebar, /location === "\/dashboard\/cashiers\/reports"/);
  assert.doesNotMatch(sidebar, /href: "\/dashboard\/cashiers\/reports"/);

  assert.match(bottomNav, /href: "\/dashboard\/reports"/);
  assert.match(bottomNav, /location === "\/dashboard\/cashiers\/reports"/);
  assert.doesNotMatch(bottomNav, /href: "\/dashboard\/cashiers\/reports"/);

  assert.match(app, /path="\/dashboard\/reports\/cashier"/);
  assert.match(app, /path="\/dashboard\/reports\/online"/);
  assert.match(app, /path="\/dashboard\/reports\/combined"/);
  assert.match(app, /path="\/dashboard\/reports"/);

  // Preserve old deep links while the sidebar uses the new reports authority.
  assert.match(app, /path="\/dashboard\/cashiers\/reports"/);
  assert.match(app, /Page=\{ReportsPage\}/);
});

test("reports hub keeps cashier online and combined views source-separated", () => {
  const page = read("artifacts/fawri/src/pages/dashboard/ReportsPage.tsx");

  assert.match(page, /Cashier Reports/);
  assert.match(page, /Online Order Reports/);
  assert.match(page, /Combined Report/);
  assert.match(page, /<CashierCentralReportsPage embedded/);
  assert.match(page, /\/api\/reports\/online/);
  assert.match(page, /\/api\/cashier\/management\/report/);
  assert.match(page, /cashierNetSales/);
  assert.match(page, /onlineDeliveredSales/);
  assert.match(page, /Different currencies are never converted or merged/);
  assert.match(page, /Top-selling online products/);
  assert.match(page, /Delivery fees on delivered orders/);
  assert.match(page, /Total delivered order value/);
  assert.match(page, /EnglishOnlineReportsContent/);
  assert.match(page, /EnglishOnlineProductChart/);
  assert.match(page, /EnglishCombinedChart/);
  assert.match(page, /lang === 'en' \|\| lang === 'ku'/);
  assert.match(page, /lang=\{lang\}/);
  assert.match(page, /const SummaryMetric = ArabicOnlineMetric/);
  assert.match(page, /lang === 'ku' \? 'ckb-IQ' : 'en-GB'/);
  assert.match(page, /report-print-online-metrics report-print-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(page, /report-print-online-group-stats mt-3 grid grid-cols-3/);
  assert.match(page, /count === 1 \? singular : plural/);
  assert.match(page, /Delivered online orders/);
  assert.match(page, /Online orders received/);
  assert.match(page, /row\.code === 'IQD' && row\.digits === 0 \? formatMerchantMoneyMinor\(row\.online/);
  assert.match(page, /toLocaleString\(lang === 'ar' \? 'ar-IQ' : lang === 'ku' \? 'ckb-IQ' : 'en-GB'\)/);
  assert.match(page, /const iqKey = 'IQD:0'/);
});

test("online report authority excludes cashier orders and uses event timestamps", () => {
  const service = read(
    "artifacts/api-server/src/services/postgresOnlineOrderReportAuthority.ts",
  );
  const route = read("artifacts/api-server/src/routes/reports-operations.ts");
  const app = read("artifacts/api-server/src/app.ts");

  assert.match(service, /lower\(source_channel\) <> 'cashier'/);
  assert.match(service, /created_at >= \$2::timestamptz/);
  assert.match(service, /delivered_at >= \$2::timestamptz/);
  assert.match(service, /cancelled_at >= \$2::timestamptz/);

  // Product sales exclude delivery fees; order value and delivery fees remain explicit.
  assert.match(service, /sum\(subtotal_iqd\).*delivered_sales_iqd/s);
  assert.match(service, /sum\(delivery_fee_iqd\).*delivered_delivery_fees_iqd/s);
  assert.match(service, /sum\(total_iqd\).*delivered_order_value_iqd/s);

  assert.match(route, /requireMerchantSession/);
  assert.match(route, /getMerchantIdFromSession/);
  assert.match(route, /buildOnlineOrderReportAuthoritative/);
  assert.match(app, /reportsOperationsRouter/);
  assert.match(app, /app\.use\("\/api", reportsOperationsRouter\)/);
});
