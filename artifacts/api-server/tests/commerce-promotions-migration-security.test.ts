import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("commerce promotions migration enforces tenant RLS and bigint money", () => {
  const sql = read(
    "lib/db/drizzle/0011_commerce_promotions_timezone_authority.sql",
  );

  assert.match(sql, /"amount_minor" bigint/);
  assert.match(sql, /"minimum_subtotal_minor" bigint/);
  assert.match(
    sql,
    /ALTER TABLE "commerce_promotions" ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    sql,
    /CREATE POLICY "commerce_promotions_tenant_boundary" ON "commerce_promotions"/,
  );
  assert.match(sql, /current_setting\('fawri\.tenant_id', true\)/);
  assert.match(sql, /current_setting\('fawri\.admin_audit_id', true\)/);
  assert.match(sql, /current_setting\('fawri\.admin_account_id', true\)/);
});

test("tenant security schema links commerce promotions to the canonical tenant policy", () => {
  const source = read("lib/db/src/schema/tenant-security.ts");
  assert.match(source, /import \{ commercePromotions \} from "\.\/commerce-promotions"/);
  assert.match(
    source,
    /commercePromotionsTenantPolicy = tenantPolicy\(\s*"commerce_promotions_tenant_boundary",\s*commercePromotions/,
  );
});

test("migration stage archives the tenant-security preimage for deterministic history", () => {
  const stage = JSON.parse(
    read("lib/db/migration-stages/0011/stage.json"),
  ) as { index?: number; preimage_files?: unknown[] };
  assert.equal(stage.index, 11);
  assert.ok(stage.preimage_files?.includes("tenant-security.ts"));

  const preimage = read(
    "lib/db/migration-stages/0011/preimage/tenant-security.ts",
  );
  assert.equal(preimage.includes("commercePromotionsTenantPolicy"), false);
  assert.equal(preimage.includes("./commerce-promotions"), false);
});
