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

test("irreversible merchant deletion must explicitly retire cashier identities, credentials, sessions, and retained attribution", () => {
  const management = source(
    "artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts",
  );
  const cashierSchema = source("lib/db/src/schema/cashier-staff.ts");
  const attributionSchema = source("lib/db/src/schema/cashier-operation-attribution.ts");

  const purge = between(
    management,
    "async function purgeMerchantOperationalData(",
    "export async function completeMerchantDeletionPostgres(",
  );

  for (const sensitiveContract of [
    'text("display_name")',
    'text("pin_hash")',
    'text("paired_device_id")',
    'text("code_hash")',
    'text("token_hash")',
    'jsonb("permission_snapshot")',
    'text("close_reason")',
  ]) {
    assert.match(
      cashierSchema,
      new RegExp(sensitiveContract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `cashier lifecycle proof expects ${sensitiveContract} to exist in canonical schema`,
    );
  }

  for (const sensitiveContract of [
    'text("device_id")',
    'text("station_credential_id")',
    'text("operator_session_id")',
  ]) {
    assert.match(
      attributionSchema,
      new RegExp(sensitiveContract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `cashier attribution proof expects ${sensitiveContract} to exist in canonical schema`,
    );
  }

  const lifecycleTables = [
    "merchant_cashier_staff",
    "merchant_cashier_staff_permissions",
    "merchant_cashier_stations",
    "cashier_station_pairing_challenges",
    "cashier_station_credentials",
    "cashier_shifts",
    "cashier_operator_sessions",
    "cashier_operation_attribution",
  ];

  for (const table of lifecycleTables) {
    assert.match(
      purge,
      new RegExp(`\\b${table}\\b`),
      `merchant deletion does not explicitly handle ${table}; because the merchant row is tombstoned rather than deleted, merchant-level ON DELETE CASCADE cannot retire this cashier state`,
    );
  }

  assert.match(
    management,
    /UPDATE merchants[\s\S]*retention_status = 'deleted'/,
    "merchant deletion proof expects the current tombstone lifecycle rather than physical merchant-row deletion",
  );
  assert.doesNotMatch(
    management,
    /DELETE FROM merchants\s+WHERE id = \$1/,
    "this regression is specifically about the tombstone lifecycle where merchant-row cascades do not execute",
  );
});
