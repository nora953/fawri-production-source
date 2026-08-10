import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const audit = path.join(root, "scripts", "audit-merchant-settings.mjs");
function normalized(value) {
  return String(value).normalize("NFKC").replace(/[ـًٌٍَُِّْ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ة/g, "ه").replace(/[کكگ]/g, "ك").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}
function id(merchant, area) {
  return `delivery-area:${createHash("sha256").update(`${merchant}\0${normalized(area)}`).digest("hex").slice(0, 32)}`;
}

test("merchant settings audit accepts per-area server authority and durable queue v2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-delivery-audit-"));
  try {
    fs.writeFileSync(path.join(dir, "merchants.json"), JSON.stringify({ merchants: [{ id: "merchant-a", is_admin: false }] }));
    fs.writeFileSync(path.join(dir, "background-jobs.json"), JSON.stringify({ version: 2, jobs: [] }));
    fs.writeFileSync(path.join(dir, "merchant-settings.json"), JSON.stringify({
      version: 1,
      settings: {
        "merchant-a": {
          merchant_id: "merchant-a",
          version: 2,
          auto_reply_enabled: true,
          reply_language: "ar",
          delivery: {
            enabled: true,
            pricing_mode: "per_area",
            fee_iqd: 0,
            free_delivery_threshold_iqd: 50000,
            estimated_days_min: 1,
            estimated_days_max: 3,
            areas: [],
            area_rates: [{
              id: id("merchant-a", "المنصور"),
              area_name: "المنصور",
              normalized_area_name: normalized("المنصور"),
              fee_iqd: 5000,
              enabled: true,
            }],
            notes: "",
          },
          payment: {
            cash_on_delivery_enabled: true,
            electronic_payment_enabled: false,
            methods: ["cash_on_delivery"],
            instructions: "",
          },
          created_at: "2026-08-10T20:00:00.000Z",
          updated_at: "2026-08-10T20:01:00.000Z",
        },
      },
    }));
    const result = spawnSync(process.execPath, [audit, dir], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
