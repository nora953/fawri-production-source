import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Static regression contract: this test does not connect to a database or use credentials.
// Runtime integration tests must additionally prove context cleanup with a real pool.
const source = readFileSync(new URL("../src/services/operationalPostgresAuthority.ts", import.meta.url), "utf8");

test("merchant transaction uses a parameterized transaction-local tenant setting", () => {
  assert.match(source, /export async function withMerchantOperationalTransaction/);
  assert.match(source, /return withOperationalTransaction\(async \(client\) => \{/);
  assert.match(source, /set_config\('fawri\.tenant_id', \$1, true\)/);
  assert.match(source, /\[merchantId\]/);
});

test("merchant transaction rejects missing or oversized identifiers", () => {
  assert.match(source, /if \(!merchantId \|\| merchantId\.length > 200\)/);
  assert.match(source, /OPERATIONAL_TENANT_INVALID/);
});

test("operational transaction has explicit commit, rollback and client release", () => {
  assert.match(source, /await client\.query\("BEGIN"\)/);
  assert.match(source, /await client\.query\("COMMIT"\)/);
  assert.match(source, /await client\.query\("ROLLBACK"\)/);
  assert.match(source, /client\.release\(\)/);
});

test("transaction-local context is not promoted to session-level context", () => {
  assert.doesNotMatch(source, /set_config\('fawri\.tenant_id',\s*\$1,\s*false\)/);
  assert.doesNotMatch(source, /SET\s+SESSION\s+fawri\.tenant_id/i);
});

test("tenant setting is established before the merchant callback is invoked", () => {
  const tenantFunction = source.slice(source.indexOf("export async function withMerchantOperationalTransaction"));
  const setContext = tenantFunction.indexOf("await client.query(");
  const invokeWork = tenantFunction.indexOf("return work(client)");
  assert.ok(setContext >= 0 && invokeWork > setContext, "tenant context must precede merchant work");
});

test("tenant context is configured inside the transaction wrapper", () => {
  const tenantFunction = source.slice(source.indexOf("export async function withMerchantOperationalTransaction"));
  assert.match(tenantFunction, /return withOperationalTransaction\(async \(client\) => \{/);
  assert.doesNotMatch(tenantFunction, /operationalDatabasePool\(\)/);
});

test("runtime rejects invalid merchant IDs before acquiring a database connection", async () => {
  const { withMerchantOperationalTransaction } = await import("../src/services/operationalPostgresAuthority");
  for (const merchantId of ["", "   ", "x".repeat(201)]) {
    let callbackCalled = false;
    await assert.rejects(
      () => withMerchantOperationalTransaction(merchantId, async () => {
        callbackCalled = true;
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "OPERATIONAL_TENANT_INVALID");
        assert.equal((error as { status?: number }).status, 400);
        return true;
      },
    );
    assert.equal(callbackCalled, false, "invalid merchant ID must not execute tenant work");
  }
});

test("tenant validation normalizes surrounding whitespace before applying context", () => {
  const merchantFunction = source.slice(source.indexOf("export async function withMerchantOperationalTransaction"));
  assert.match(merchantFunction, /String\(merchantIdValue \|\| ""\)\.trim\(\)/);
  assert.match(merchantFunction, /\[merchantId\]/);
});

test("tenant IDs at the 200-character boundary are not rejected by length guard", () => {
  const merchantFunction = source.slice(source.indexOf("export async function withMerchantOperationalTransaction"));
  assert.match(merchantFunction, /merchantId\.length > 200/);
  assert.doesNotMatch(merchantFunction, /merchantId\.length >= 200/);
});
