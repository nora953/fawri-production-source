import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");
const repositoryRoot = path.resolve(apiRoot, "../..");

function source(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return text.slice(start, end);
}

test("retained merchant audit evidence must remove network and device PII after irreversible deletion", () => {
  const management = source(
    "artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts",
  );
  const auditSchema = source("lib/db/src/schema/audit.ts");

  assert.match(
    auditSchema,
    /ipAddress:\s*text\("ip_address"\)/,
    "audit lifecycle proof expects IP address retention to exist in the canonical schema",
  );
  assert.match(
    auditSchema,
    /userAgent:\s*text\("user_agent"\)/,
    "audit lifecycle proof expects user-agent retention to exist in the canonical schema",
  );

  const purge = between(
    management,
    "async function purgeMerchantOperationalData(",
    "export async function completeMerchantDeletionPostgres(",
  );
  assert.match(
    purge,
    /Retained financial\/entitlement\/audit rows keep only non-PII proof fields/,
    "merchant deletion is expected to retain audit evidence only after removing PII",
  );

  const auditUpdateMatch = purge.match(
    /UPDATE audit_events[\s\S]*?WHERE merchant_id = \$1/,
  );
  assert.ok(auditUpdateMatch, "merchant deletion must explicitly scrub retained audit rows");
  const auditUpdate = auditUpdateMatch[0];

  assert.match(auditUpdate, /details\s*=\s*NULL/);
  assert.match(auditUpdate, /metadata\s*=\s*'\{\}'::jsonb/);
  assert.match(
    auditUpdate,
    /ip_address\s*=\s*NULL/,
    "retained audit evidence still contains merchant IP addresses after deletion",
  );
  assert.match(
    auditUpdate,
    /user_agent\s*=\s*NULL/,
    "retained audit evidence still contains merchant user-agent/device fingerprint data after deletion",
  );
});
