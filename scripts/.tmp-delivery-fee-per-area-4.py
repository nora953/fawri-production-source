#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content):
    path = p(rel); path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel); actual = text.count(old)
    if actual < count: raise SystemExit(f"{rel}: expected {count}, found {actual}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))
def replace_all(rel, old, new):
    text = read(rel)
    if old not in text: raise SystemExit(f"{rel}: missing target {old[:120]!r}")
    write(rel, text.replace(old, new))

write("artifacts/api-server/tests/delivery-fee-per-area.test.ts", r'''import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  normalizeDeliveryAreaName,
  resolveDeliveryQuote,
} from "../src/services/deliveryPricing";
import {
  getMerchantDeliveryQuote,
  getMerchantOperationalSettings,
  MerchantSettingsError,
  updateMerchantOperationalSettingsWithEffects,
} from "../src/services/merchantSettingsRuntime";

const basePolicy = {
  merchant_id: "merchant-a",
  settings_version: 3,
  enabled: true,
  pricing_mode: "flat" as const,
  flat_fee_iqd: 5000,
  free_delivery_threshold_iqd: 50000,
  estimated_days_min: 1,
  estimated_days_max: 3,
  areas: [],
  area_rates: [],
};

test("flat delivery stays backward compatible and applies the global free threshold", () => {
  const paid = resolveDeliveryQuote({ policy: basePolicy, area: "Baghdad", subtotal_iqd: 30000 });
  assert.equal(paid.available, true);
  assert.equal(paid.effective_fee_iqd, 5000);
  assert.equal(paid.total_iqd, 35000);

  const free = resolveDeliveryQuote({ policy: basePolicy, area: "Baghdad", subtotal_iqd: 50000 });
  assert.equal(free.free_delivery_applied, true);
  assert.equal(free.effective_fee_iqd, 0);
  assert.equal(free.total_iqd, 50000);
});

test("per-area delivery resolves deterministic normalized areas and fails closed outside coverage", () => {
  const policy = {
    ...basePolicy,
    pricing_mode: "per_area" as const,
    area_rates: [
      {
        id: "mansour",
        area_name: "المنصور",
        normalized_area_name: normalizeDeliveryAreaName("المنصور"),
        fee_iqd: 5000,
        enabled: true,
      },
      {
        id: "karrada",
        area_name: "الكرادة",
        normalized_area_name: normalizeDeliveryAreaName("الكرادة"),
        fee_iqd: 4000,
        enabled: true,
      },
    ],
  };
  const mansour = resolveDeliveryQuote({ policy, area: "بغداد - بالمنصور", subtotal_iqd: 20000 });
  assert.equal(mansour.available, true);
  assert.equal(mansour.area_rate_id, "mansour");
  assert.equal(mansour.effective_fee_iqd, 5000);
  assert.equal(mansour.total_iqd, 25000);

  const missing = resolveDeliveryQuote({ policy, area: "التوصيل", subtotal_iqd: 20000 });
  assert.equal(missing.available, false);
  assert.equal(missing.reason, "area_required");

  const uncovered = resolveDeliveryQuote({ policy, area: "الموصل", subtotal_iqd: 20000 });
  assert.equal(uncovered.available, false);
  assert.equal(uncovered.reason, "area_unavailable");
});

test("runtime preserves legacy settings as flat and server-generates per-area authority", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fawri-delivery-area-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dir;
  try {
    const initial = getMerchantOperationalSettings("merchant-a");
    assert.equal(initial.delivery.pricing_mode, "flat");
    assert.deepEqual(initial.delivery.area_rates, []);

    const updated = updateMerchantOperationalSettingsWithEffects({
      merchantId: "merchant-a",
      expectedVersion: 1,
      patch: {
        delivery: {
          pricing_mode: "per_area",
          area_rates: [
            { area_name: "المنصور", fee_iqd: 5000, enabled: true },
            { area_name: "الكرادة", fee_iqd: 4000, enabled: true },
          ],
          free_delivery_threshold_iqd: 50000,
        },
      },
    }).settings;
    assert.equal(updated.version, 2);
    assert.equal(updated.delivery.pricing_mode, "per_area");
    assert.equal(updated.delivery.areas.length, 0);
    assert.match(updated.delivery.area_rates[0].id, /^delivery-area:/);
    assert.equal(updated.delivery.area_rates[0].normalized_area_name, normalizeDeliveryAreaName("المنصور"));

    const quote = getMerchantDeliveryQuote({ merchantId: "merchant-a", area: "للمنصور", subtotalIqd: 10000 });
    assert.equal(quote.available, true);
    assert.equal(quote.effective_fee_iqd, 5000);

    assert.throws(
      () => updateMerchantOperationalSettingsWithEffects({
        merchantId: "merchant-a",
        expectedVersion: 2,
        patch: {
          delivery: {
            pricing_mode: "per_area",
            area_rates: [
              { area_name: "المنصور", fee_iqd: 1 },
              { area_name: "ألمنصور", fee_iqd: 2 },
            ],
          },
        },
      }),
      (error: unknown) => error instanceof MerchantSettingsError && error.code === "MERCHANT_DELIVERY_AREA_DUPLICATE",
    );
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
''')

write("artifacts/api-server/tests/knowledge-delivery-area-rates.test.ts", r'''// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver.js";
import { KnowledgeRuntimeGateError } from "../src/services/knowledge/postgresKnowledgeRuntime.js";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing.js";

class FakeSql {
  queries = [];
  constructor(handler) { this.handler = handler; }
  async query(sql, values = []) {
    this.queries.push({ sql, values: [...values] });
    return { rows: await this.handler(sql, values) };
  }
}

function settings() {
  return {
    merchant_id: "merchant-a",
    store_name: "Store A",
    merchant_status: "approved",
    account_status: "approved",
    settings_version: 4,
    auto_reply_enabled: true,
    delivery_enabled: true,
    delivery_pricing_mode: "per_area",
    delivery_fee_iqd: 0,
    free_delivery_threshold_iqd: 50000,
    delivery_areas: [],
    delivery_estimated_days_min: 1,
    delivery_estimated_days_max: 3,
    cash_on_delivery_enabled: true,
    electronic_payment_enabled: false,
    payment_methods: ["cash_on_delivery"],
  };
}

function rate(overrides = {}) {
  return {
    id: "rate-mansour",
    merchant_id: "merchant-a",
    area_name: "المنصور",
    normalized_area_name: normalizeDeliveryAreaName("المنصور"),
    fee_iqd: 5000,
    enabled: true,
    ...overrides,
  };
}

test("Knowledge asks for area in per-area mode and resolves explicit tenant rate", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) return [settings()];
    if (query.includes("FROM merchant_delivery_area_rates")) return [rate()];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  const generic = await resolver.resolve({ merchantId: "merchant-a", customerText: "شكد التوصيل؟", language: "ar" });
  assert.equal(generic?.factType, "delivery_policy");
  assert.match(generic?.answerText || "", /منطقتك|منطقة|المنطقة/);

  const explicit = await resolver.resolve({ merchantId: "merchant-a", customerText: "شكد التوصيل للمنصور؟", language: "ar" });
  assert.equal(explicit?.recordId, "rate-mansour");
  assert.match(explicit?.answerText || "", /5,000/);
  assert.match(explicit?.answerText || "", /50,000/);
});

test("Knowledge rejects a cross-tenant area row returned by the SQL adapter", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) return [settings()];
    if (query.includes("FROM merchant_delivery_area_rates")) return [rate({ merchant_id: "merchant-b" })];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  await assert.rejects(
    () => resolver.resolve({ merchantId: "merchant-a", customerText: "التوصيل للمنصور", language: "ar" }),
    (error) => error instanceof KnowledgeRuntimeGateError && error.code === "KNOWLEDGE_TENANT_VIOLATION",
  );
});
''')

write("artifacts/api-server/tests/delivery-order-authority-static.test.mjs", r'''import assert from "node:assert/strict";
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
''')

write("artifacts/fawri/tests/delivery-fee-per-area-ui.test.ts", r'''import assert from "node:assert/strict";
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
''')

write("scripts/tests/delivery-fee-per-area-audit.test.mjs", r'''import assert from "node:assert/strict";
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
''')

write("scripts/tests/delivery-fee-per-area-migration-history.test.mjs", r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const drizzle = path.join(root, "lib", "db", "drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(drizzle, "meta", "_journal.json"), "utf8"));

test("0005 delivery pricing migration is additive and RLS-protected", () => {
  assert.equal(journal.entries.at(-1)?.idx, 5);
  assert.equal(journal.entries.at(-1)?.tag, "0005_delivery_fee_per_area");
  const sql = fs.readFileSync(path.join(drizzle, "0005_delivery_fee_per_area.sql"), "utf8");
  assert.match(sql, /CREATE TYPE "public"\."delivery_pricing_mode" AS ENUM\('flat', 'per_area'\)/);
  assert.match(sql, /CREATE TABLE "merchant_delivery_area_rates"/);
  assert.match(sql, /ALTER TABLE "merchant_delivery_area_rates" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY "merchant_delivery_area_rates_tenant_boundary"/);
  assert.match(sql, /ADD COLUMN "delivery_pricing_mode"/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\b/i);
});

test("0005 archives the exact 0004 schema boundary for both modified schema files", () => {
  const stage = JSON.parse(fs.readFileSync(path.join(root, "lib", "db", "migration-stages", "0005", "stage.json"), "utf8"));
  assert.deepEqual(stage, {
    index: 5,
    name: "delivery_fee_per_area",
    when: 1786393740000,
    preimage_files: ["merchant-settings.ts", "tenant-security.ts"],
  });
  for (const name of stage.preimage_files) {
    assert.ok(fs.existsSync(path.join(root, "lib", "db", "migration-stages", "0005", "preimage", name)));
  }
});
''')

# Existing migration tests advance the latest-chain expectations without weakening historical 0000-0004 checks.
replace("scripts/tests/product-shipping-migration-history.test.mjs",
'''test("migration journal is an append-only 0,1,2,3,4 chain", () => {''',
'''test("migration journal keeps the Golden 0-4 prefix and appends 0005", () => {''')
replace("scripts/tests/product-shipping-migration-history.test.mjs",
'''    [0, 1, 2, 3, 4],
  );''',
'''    [0, 1, 2, 3, 4, 5],
  );''')
replace("scripts/tests/product-shipping-migration-history.test.mjs",
'''    "0004_product_shipping_measurements.sql",
  ]);''',
'''    "0004_product_shipping_measurements.sql",
    "0005_delivery_fee_per_area.sql",
  ]);''')

replace("scripts/tests/cross-lane-migration-generator.test.mjs",
'''    productShippingSnapshot: sha256(
      path.join(outputDirectory, "meta", "0004_snapshot.json"),
    ),''',
'''    productShippingSnapshot: sha256(
      path.join(outputDirectory, "meta", "0004_snapshot.json"),
    ),
    deliveryAreaSql: sha256(
      path.join(outputDirectory, "0005_delivery_fee_per_area.sql"),
    ),
    deliveryAreaSnapshot: sha256(
      path.join(outputDirectory, "meta", "0005_snapshot.json"),
    ),''')
replace("scripts/tests/cross-lane-migration-generator.test.mjs",
'''          "0004_product_shipping_measurements.sql",
        ]);''',
'''          "0004_product_shipping_measurements.sql",
          "0005_delivery_fee_per_area.sql",
        ]);''')
replace("scripts/tests/cross-lane-migration-generator.test.mjs",
'''        assert.equal(journal.entries?.length, 5);''',
'''        assert.equal(journal.entries?.length, 6);''')
replace("scripts/tests/cross-lane-migration-generator.test.mjs",
'''        assert.equal(
          journal.entries[4]?.tag,
          "0004_product_shipping_measurements",
        );''',
'''        assert.equal(
          journal.entries[4]?.tag,
          "0004_product_shipping_measurements",
        );
        assert.equal(journal.entries[5]?.tag, "0005_delivery_fee_per_area");''')

replace("scripts/tests/cross-lane-postgresql-edge-gates.test.mjs",
'''assert.equal(history.rows[0].count, 5, "committed chain must apply 5 migrations");''',
'''assert.equal(history.rows[0].count, 6, "committed chain must apply 6 migrations");''')

replace("scripts/tests/postgresql-disposable-acceptance.test.mjs",
'''assert.equal(report.generated_entries, 5);''',
'''assert.equal(report.generated_entries, 6);''')
replace("scripts/tests/postgresql-disposable-acceptance.test.mjs",
'''      "0004_product_shipping_measurements.sql",
      "meta/0004_snapshot.json",''',
'''      "0004_product_shipping_measurements.sql",
      "meta/0004_snapshot.json",
      "0005_delivery_fee_per_area.sql",
      "meta/0005_snapshot.json",''')
replace("scripts/tests/postgresql-disposable-acceptance.test.mjs",
'''assert.equal(journal.entries?.length, 5);''',
'''assert.equal(journal.entries?.length, 6);''')
replace("scripts/tests/postgresql-disposable-acceptance.test.mjs",
'''        [4, "0004_product_shipping_measurements"],
      ],''',
'''        [4, "0004_product_shipping_measurements"],
        [5, "0005_delivery_fee_per_area"],
      ],''')
replace("scripts/tests/postgresql-disposable-acceptance.test.mjs",
'''      assert.equal(smokeReport.snapshot, "0004_snapshot.json");
      assert.equal(smokeReport.tables, 59);
      assert.equal(smokeReport.migrations, 5);''',
'''      assert.equal(smokeReport.snapshot, "0005_snapshot.json");
      assert.equal(smokeReport.tables, 60);
      assert.equal(smokeReport.migrations, 6);''')

replace("scripts/tests/run-postgresql-migration-plan.test.mjs",
'''assert.equal(report.schema_validation.snapshot, "0004_snapshot.json");''',
'''assert.equal(report.schema_validation.snapshot, "0005_snapshot.json");''')
replace("scripts/tests/run-postgresql-migration-plan.test.mjs",
'''  assert.equal(latest?.idx, 4, "latest committed Drizzle migration is not 0004");
  assert.equal(latest?.tag, "0004_product_shipping_measurements");''',
'''  assert.equal(latest?.idx, 5, "latest committed Drizzle migration is not 0005");
  assert.equal(latest?.tag, "0005_delivery_fee_per_area");''')
replace_all("scripts/tests/run-postgresql-migration-plan.test.mjs", '"0004_snapshot.json"', '"0005_snapshot.json"')
replace_all("scripts/tests/run-postgresql-migration-plan.test.mjs", "missing from 0004", "missing from 0005")
replace_all("scripts/tests/run-postgresql-migration-plan.test.mjs", "survived 0004", "survived 0005")
replace("scripts/tests/run-postgresql-migration-plan.test.mjs",
'''    "merchant_settings",
    "auth_otp_challenges",''',
'''    "merchant_settings",
    "merchant_delivery_area_rates",
    "auth_otp_challenges",''')

print("patch 4 complete")
