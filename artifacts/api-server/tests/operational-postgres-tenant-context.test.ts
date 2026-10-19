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
