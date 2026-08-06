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

test("extensionless settings imports resolve to the server-authoritative page", () => {
  const activeEntry = read(
    "artifacts/fawri/src/pages/dashboard/SettingsPage.ts",
  );
  const page = read(
    "artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
  );
  const combined = `${activeEntry}\n${page}`;

  assert.match(activeEntry, /ServerSettingsPage/);
  for (const forbidden of [
    "fawri_settings",
    "getSettings",
    "saveSettings",
    "localStorage",
    "sessionStorage",
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `server-authoritative settings page contains forbidden authority: ${forbidden}`,
    );
  }
  assert.match(page, /fetch\('\/api\/settings'/);
  assert.match(page, /expected_version/);
  assert.match(page, /MERCHANT_SETTINGS_VERSION_CONFLICT/);
});

test("settings API and worker use the same server-side settings service", () => {
  const router = read(
    "artifacts/api-server/src/routes/merchant-settings.ts",
  );
  const service = read(
    "artifacts/api-server/src/services/merchantSettingsRuntime.ts",
  );
  const worker = read(
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
  );

  assert.match(router, /requireMerchantSession/);
  assert.match(router, /getMerchantOperationalSettings/);
  assert.match(router, /updateMerchantOperationalSettings/);
  assert.match(service, /MERCHANT_SETTINGS_VERSION_CONFLICT/);
  assert.match(service, /writeJsonAtomically/);
  assert.match(service, /registerMerchantRuntimeDeletion/);
  assert.match(worker, /merchantAllowsAutoReply/);
  assert.match(worker, /MERCHANT_AUTO_REPLY_DISABLED/);
});
