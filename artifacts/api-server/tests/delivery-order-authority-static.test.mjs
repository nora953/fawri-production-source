import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src", "routes", "index.ts"), "utf8");

test("legacy order creation snapshots the shared authoritative delivery quote", () => {
  assert.match(source, /getMerchantDeliveryQuote\(\{/);
  assert.match(source, /subtotal_iqd:\s*subtotal/);
  assert.match(source, /delivery_fee_iqd:\s*deliveryQuote\.effective_fee_iqd/);
  assert.match(source, /total_iqd:\s*deliveryQuote\.total_iqd/);
  assert.match(source, /delivery_settings_version:\s*deliveryQuote\.settings_version/);
  assert.match(source, /total_price:\s*deliveryQuote\.total_iqd/);
  assert.doesNotMatch(source, /total_price:\s*params\.unitPrice\s*\*\s*params\.quantity/);
  assert.match(source, /ORDER_DELIVERY_QUOTE_REQUIRED/);
});
