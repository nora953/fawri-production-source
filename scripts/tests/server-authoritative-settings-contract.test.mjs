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

test("settings entry points use one server-authoritative operational page", () => {
  const activeEntry = read("artifacts/fawri/src/pages/dashboard/SettingsPage.ts");
  const legacyEntry = read("artifacts/fawri/src/pages/dashboard/SettingsPage.tsx");
  const wrapper = read(
    "artifacts/fawri/src/pages/dashboard/MerchantSettingsPage.tsx",
  );
  const page = read(
    "artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
  );
  const translations = read(
    "artifacts/fawri/src/lib/translations/features/pages/dashboard/MerchantSettingsPage.ts",
  );
  const combined = `${activeEntry}\n${legacyEntry}\n${wrapper}\n${page}`;

  assert.match(activeEntry, /MerchantSettingsPage/);
  assert.match(legacyEntry, /MerchantSettingsPage/);
  assert.match(wrapper, /ServerSettingsPage/);
  assert.match(wrapper, /MERCHANT_SETTINGS_PAGE_UI_COPY/);

  for (const forbidden of [
    "getCurrentMerchant",
    "getMerchants",
    "saveMerchants",
    "saveSettings",
    "superqi_account_name",
    "superqi_qr",
    "delivery_zones",
    "FileReader",
    "data:image/",
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `settings UI contains forbidden local operational authority: ${forbidden}`,
    );
  }

  assert.match(wrapper, /setLang/);
  assert.match(wrapper, /setTheme/);
  assert.match(translations, /local UI preferences only/);
  assert.doesNotMatch(wrapper, /COORDINATOR\/PRODUCT MODEL HANDOFF REQUIRED/);
  assert.match(
    translations,
    /Delivery supports either one flat fee or different fees by area/,
  );
  assert.match(
    translations,
    /Account-name and QR data do not have a secure server authority/,
  );
});

test("settings UI loads and saves only through versioned server authority", () => {
  const page = read(
    "artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
  );

  assert.match(page, /fetch\('\/api\/settings'/);
  assert.match(page, /method: 'PATCH'/);
  assert.match(page, /expected_version: settings\.version/);
  assert.match(page, /MERCHANT_SETTINGS_VERSION_CONFLICT/);
  assert.match(page, /isMerchantSettings\(data\.current_settings\)/);
  assert.match(page, /applyServerState\(data\.current_settings\)/);
  assert.match(page, /isMerchantSettings\(data\.settings\)/);
  assert.match(page, /applyServerState\(data\.settings\)/);

  const patchStart = page.indexOf("method: 'PATCH'");
  const responseValidation = page.indexOf("if (!response.ok", patchStart);
  const successToast = page.indexOf("toast.success(copy.persisted)", patchStart);
  assert.ok(patchStart >= 0, "PATCH request is present");
  assert.ok(
    responseValidation > patchStart && successToast > responseValidation,
    "success is shown only after the server response is accepted",
  );

  const requestBodyStart = page.indexOf("body: JSON.stringify({", patchStart);
  const requestBodyEnd = page.indexOf("      });", requestBodyStart);
  const requestBody = page.slice(requestBodyStart, requestBodyEnd);
  assert.doesNotMatch(requestBody, /merchant_id/);
  assert.doesNotMatch(requestBody, /(^|[\s,{])theme\s*:/m);
  assert.doesNotMatch(requestBody, /(^|[\s,{])language\s*:/m);
});

test("delivery and payment mappings match the canonical server model", () => {
  const page = read(
    "artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
  );

  assert.match(page, /pricing_mode/);
  assert.match(page, /area_rates/);
  assert.match(page, /value="flat"/);
  assert.match(page, /value="per_area"/);
  assert.match(page, /fee_iqd/);
  assert.match(page, /free_delivery_threshold_iqd/);
  assert.match(page, /estimated_days_min/);
  assert.match(page, /estimated_days_max/);
  assert.match(page, /delivery\.areas/);
  assert.doesNotMatch(page, /delivery_zones/);

  assert.match(page, /cash_on_delivery_enabled/);
  assert.match(page, /electronic_payment_enabled/);
  assert.match(page, /'cash_on_delivery'/);
  assert.match(page, /'superqi'/);
  assert.match(page, /disabled=\{!draft\.payment\.electronic_payment_enabled\}/);
});

test("settings API derives tenant identity from the authenticated session and returns effects", () => {
  const router = read(
    "artifacts/api-server/src/routes/merchant-settings.ts",
  );
  const service = read(
    "artifacts/api-server/src/services/merchantSettingsRuntime.ts",
  );
  const postgresAuthority = read(
    "artifacts/api-server/src/services/postgresMerchantSettingsAuthority.ts",
  );
  const worker = read(
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
  );

  assert.match(router, /requireMerchantSession/);
  assert.match(router, /getMerchantIdFromSession/);
  assert.match(router, /getMerchantOperationalSettingsAuthoritative/);
  assert.match(router, /updateMerchantOperationalSettingsAuthoritative/);
  assert.match(router, /effects: result\.effects/);
  assert.match(postgresAuthority, /updateMerchantOperationalSettingsWithEffects/);
  assert.match(service, /MERCHANT_SETTINGS_VERSION_CONFLICT/);
  assert.match(service, /writeJsonAtomically/);
  assert.match(service, /registerMerchantRuntimeDeletion/);
  assert.match(worker, /merchantAllowsAutoReply/);
  assert.match(worker, /MERCHANT_AUTO_REPLY_DISABLED/);
});
