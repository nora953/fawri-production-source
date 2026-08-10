import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src", "pages", "dashboard", "ServerSettingsPage.tsx"), "utf8");
const shell = fs.readFileSync(path.join(root, "src", "pages", "dashboard", "MerchantSettingsPage.tsx"), "utf8");

test("settings UI exposes server-authoritative flat and per-area delivery pricing", () => {
  assert.match(source, /pricing_mode:\s*DeliveryPricingMode/);
  assert.match(source, /area_rates:\s*DeliveryAreaRate\[\]/);
  assert.match(source, /value="flat"/);
  assert.match(source, /value="per_area"/);
  assert.match(source, /copy\.addArea/);
  assert.match(source, /fetch\('\/api\/settings'/);
  assert.match(source, /expected_version:\s*settings\.version/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(shell, /COORDINATOR\/PRODUCT MODEL HANDOFF REQUIRED/);
});
