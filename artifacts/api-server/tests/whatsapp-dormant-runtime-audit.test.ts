import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../src");

function source(relativePath: string): string {
  return fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
}

test("API runtime does not mount or start the dormant WhatsApp foundation", () => {
  const app = source("app.ts");
  const index = source("index.ts");
  const combined = `${app}\n${index}`;

  assert.doesNotMatch(combined, /from\s+["']\.\/services\/whatsapp/i);
  assert.doesNotMatch(combined, /import\s*\(\s*["']\.\/services\/whatsapp/i);
  assert.doesNotMatch(combined, /\/api\/whatsapp(?:[\/"'`]|$)/i);
  assert.doesNotMatch(combined, /FAWRI_WHATSAPP_(?:OFFLINE_FOUNDATION|LIVE_CUTOVER)/);
  assert.doesNotMatch(combined, /startWhatsApp/i);
});

test("existing Meta worker cannot accidentally consume WhatsApp job types", () => {
  const worker = source("services/metaWebhookWorker.ts");

  for (const forbidden of [
    /whatsapp_inbound_message/,
    /whatsapp_delivery_status/,
    /whatsapp_provider_error/,
    /whatsapp\.webhook/i,
    /startWhatsApp/i,
    /FAWRI_WHATSAPP_/,
  ]) {
    assert.doesNotMatch(worker, forbidden);
  }
});

test("dormant runtime audit itself creates no provider capability", () => {
  const audit = fs.readFileSync(import.meta.filename, "utf8");
  assert.doesNotMatch(audit, /\bfetch\s*\(/);
  assert.doesNotMatch(audit, /graph\.facebook\.com/i);
  assert.doesNotMatch(audit, /\bBearer\s+[A-Za-z0-9]/);
});
