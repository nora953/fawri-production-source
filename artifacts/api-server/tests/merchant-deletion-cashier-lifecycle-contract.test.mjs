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

test("irreversible merchant deletion retires cashier auth state while retaining anonymized accounting anchors", () => {
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

  for (const table of [
    "cashier_operator_sessions",
    "cashier_station_credentials",
    "cashier_station_pairing_challenges",
    "merchant_cashier_staff_permissions",
  ]) {
    assert.match(
      purge,
      new RegExp(`DELETE FROM ${table} WHERE merchant_id = \\$1`),
      `merchant deletion must remove transient cashier auth state from ${table}`,
    );
  }

  assert.match(
    purge,
    /UPDATE cashier_shifts[\s\S]*status = 'closed'[\s\S]*ended_at = COALESCE\(ended_at, GREATEST\(now\(\), started_at\)\)[\s\S]*close_reason = 'merchant_deleted'[\s\S]*WHERE merchant_id = \$1/,
    "merchant deletion must close every retained shift and replace free-text close reasons",
  );
  assert.match(
    purge,
    /UPDATE cashier_operation_attribution[\s\S]*device_id = '\[deleted device\]'[\s\S]*station_credential_id = '\[deleted credential\]'[\s\S]*operator_session_id = '\[deleted operator session\]'[\s\S]*WHERE merchant_id = \$1/,
    "retained cashier accounting attribution must not keep device/session credential identifiers",
  );
  assert.match(
    purge,
    /UPDATE merchant_cashier_staff[\s\S]*display_name = '\[deleted cashier\]'[\s\S]*status = 'revoked'[\s\S]*pin_hash = repeat\('0', 64\)[\s\S]*pin_locked_until = NULL[\s\S]*revoked_at = COALESCE\(revoked_at, now\(\)\)[\s\S]*WHERE merchant_id = \$1/,
    "retained cashier staff anchors must be revoked and stripped of identity/PIN material",
  );
  assert.match(
    purge,
    /UPDATE merchant_cashier_stations[\s\S]*name = '\[deleted station\]'[\s\S]*branch_key = 'deleted'[\s\S]*branch_label = NULL[\s\S]*status = 'revoked'[\s\S]*paired_device_id = NULL[\s\S]*offline_inventory_authority = false[\s\S]*paired_at = NULL[\s\S]*last_seen_at = NULL[\s\S]*WHERE merchant_id = \$1/,
    "retained station anchors must be revoked and stripped of branch/device identity",
  );

  for (const retainedTable of [
    "merchant_cashier_staff",
    "merchant_cashier_stations",
    "cashier_shifts",
    "cashier_operation_attribution",
  ]) {
    assert.doesNotMatch(
      purge,
      new RegExp(`DELETE FROM ${retainedTable} WHERE merchant_id = \\$1`),
      `${retainedTable} is an accounting/shift FK anchor and must be anonymized rather than blindly deleted`,
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
