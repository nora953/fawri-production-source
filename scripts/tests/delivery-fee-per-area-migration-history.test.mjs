import assert from "node:assert/strict";
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
  assert.match(
    sql,
    /merchant_delivery_area_rates_merchant_id_merchant_settings_merchant_id_fk|REFERENCES "merchant_settings"\("merchant_id"\)/,
  );
  assert.match(sql, /ADD COLUMN "delivery_pricing_mode"/);
  assert.match(sql, /products_dimensions_mm_all_or_none_check/);
  assert.match(sql, /product_variants_dimensions_mm_all_or_none_check/);
  for (const statement of sql.split("--> statement-breakpoint")) {
    assert.doesNotMatch(
      statement.trimStart(),
      /^(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\b/i,
      "0005 must not contain top-level destructive/DML statements",
    );
  }
});

test("0005 archives the exact 0004 schema boundary for both modified schema files", () => {
  const stage = JSON.parse(fs.readFileSync(path.join(root, "lib", "db", "migration-stages", "0005", "stage.json"), "utf8"));
  assert.deepEqual(stage, {
    index: 5,
    name: "delivery_fee_per_area",
    when: 1786393740000,
    preimage_files: ["merchant-settings.ts", "tenant-security.ts", "catalog.ts"],
  });
  for (const name of stage.preimage_files) {
    assert.ok(fs.existsSync(path.join(root, "lib", "db", "migration-stages", "0005", "preimage", name)));
  }
});
