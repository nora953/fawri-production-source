import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(apiRoot, "../..");

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("active order and settings pages are server-only", async () => {
  const files = await Promise.all([
    source("artifacts/fawri/src/pages/dashboard/OrdersPage.ts"),
    source("artifacts/fawri/src/pages/dashboard/OrdersWorkspacePage.tsx"),
    source("artifacts/fawri/src/pages/dashboard/SettingsPage.ts"),
    source("artifacts/fawri/src/pages/dashboard/MerchantSettingsPage.tsx"),
    source("artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx"),
    source("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx"),
  ]);
  const combined = files.join("\n");
  assert.doesNotMatch(combined, /localStorage|sessionStorage/i);
  assert.match(files[0], /OrdersWorkspacePage/);
  assert.match(files[1], /ServerOrdersPage/);
  assert.match(files[2], /MerchantSettingsPage/);
  assert.match(files[3], /ServerSettingsPage/);
  assert.match(files[4], /fetch\('\/api\/orders'/);
  assert.match(files[5], /fetch\('\/api\/settings'/);
  assert.doesNotMatch(combined, /fallback.*local|local.*fallback/i);
});

test("orders and delivery settings use authoritative store currency", async () => {
  const ordersPage = await source(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
  );
  const settingsPage = await source(
    "artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
  );

  assert.match(ordersPage, /getMerchantRegionalContext/);
  assert.match(ordersPage, /formatMerchantMoneyMinor/);
  assert.match(ordersPage, /regional\.currency_code/);
  assert.match(ordersPage, /regional\.currency_fraction_digits/);
  assert.doesNotMatch(ordersPage, /toLocaleString\([^)]*\).*IQD/);

  assert.match(settingsPage, /getMerchantRegionalContext/);
  assert.match(settingsPage, /catalogMajorAmountToMinor/);
  assert.match(settingsPage, /catalogMinorAmountToMajor/);
  assert.match(settingsPage, /catalogCurrencyStep/);
  assert.match(settingsPage, /regional\.currency_code/);
  assert.match(settingsPage, /regional\.currency_fraction_digits/);
});

test("generic payment endpoint cannot write terminal states", async () => {
  const runtime = await source(
    "artifacts/api-server/src/services/orderOperationsRuntime.ts",
  );
  const page = await source(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
  );
  assert.match(runtime, /ORDER_PAYMENT_TERMINAL_OPERATION_REQUIRED/);
  assert.match(runtime, /next === "paid" \|\| next === "failed"/);
  assert.match(page, /updateNonTerminalPaymentStatus/);
  assert.match(
    page,
    /paymentStatus: 'electronic_pending' \| 'manual_review'/,
  );
  assert.doesNotMatch(page, /payment_status:\s*['"](?:paid|failed)['"]/);
  assert.match(page, /\/payment\/confirm/);
  assert.match(page, /\/payment\/reject/);
});

test("optimistic concurrency and tenant isolation are mandatory contracts", async () => {
  const orderRuntime = await source(
    "artifacts/api-server/src/services/orderOperationsRuntime.ts",
  );
  const settingsRuntime = await source(
    "artifacts/api-server/src/services/merchantSettingsRuntime.ts",
  );
  assert.match(orderRuntime, /ORDER_VERSION_REQUIRED/);
  assert.match(orderRuntime, /ORDER_VERSION_CONFLICT/);
  assert.match(orderRuntime, /ORDER_RUNTIME_TENANT_MISMATCH/);
  assert.match(settingsRuntime, /MERCHANT_SETTINGS_VERSION_REQUIRED/);
  assert.match(settingsRuntime, /MERCHANT_SETTINGS_VERSION_CONFLICT/);
  assert.match(settingsRuntime, /MERCHANT_SETTINGS_TENANT_MISMATCH/);
});

test("disabling auto reply suppresses waiting jobs without credit", async () => {
  const settingsRuntime = await source(
    "artifacts/api-server/src/services/merchantSettingsRuntime.ts",
  );
  assert.match(settingsRuntime, /MERCHANT_AUTO_REPLY_DISABLED/);
  assert.match(settingsRuntime, /credit_consumed:\s*false/);
  assert.match(settingsRuntime, /status !== "queued" && status !== "retry"/);
  assert.match(settingsRuntime, /processing_auto_reply_jobs_observed/);
});
