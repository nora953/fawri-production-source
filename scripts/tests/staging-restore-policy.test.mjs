import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildValidatedMigrationPlan, repositoryRoot, assertCompleteMigrationWritable } from "../lib/postgresql-cross-lane-reconciliation.mjs";
import { applyStagingRestorePolicy, currentOwnerId, legacyOwnerId } from "../lib/staging-restore-policy.mjs";
import { requireSafeDatabase, validatePlanForWrite } from "../../lib/db/scripts/lib/migration-write.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-staging-policy-"));
  const read = (file) => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
  const write = (file, value) => fs.writeFileSync(path.join(directory, file), JSON.stringify(value));
  for (const script of ["create-postgresql-migration-fixture.mjs", "create-transitional-migration-fixture.mjs"]) {
    const run = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/tests/fixtures", script), directory], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  const auth = read("merchants.json");
  auth.merchants.find((r) => r.id === "admin-1").admin_role = "assistant_admin";
  auth.merchants.push({ ...auth.merchants.find((r) => r.id === "admin-1"), id: legacyOwnerId, phone: "07700000003", admin_role: "owner_admin" });
  auth.channel_overrides = { "merchant-1": { messenger: "pending", instagram: "disconnected" } };
  auth.deletion_requests = [{ id: "deletion-1", merchant_id: "merchant-1", requested_by_admin_id: "admin-1", requested_by_admin_name: "Assistant", requested_by_admin_phone: "07700000002", reviewed_by_admin_id: legacyOwnerId, reason: "policy_violation", details: "History", status: "rejected", reviewed_at: "2026-08-04T00:00:00Z", created_at: "2026-08-03T00:00:00Z" }];
  write("merchants.json", auth);
  const emergency = read("emergency-read-access.json");
  emergency.authorizations[0].granted_by_owner_id = legacyOwnerId;
  emergency.requests[0].reviewed_by_owner_id = legacyOwnerId;
  emergency.requests.push({ ...emergency.requests[0], id: "legacy-request", requested_by_admin_id: legacyOwnerId });
  emergency.owner_alerts.push({ ...emergency.owner_alerts[0], id: "legacy-alert", request_id: "legacy-request" });
  emergency.merchant_notices.push({ ...emergency.merchant_notices[0], id: "legacy-notice", request_id: "legacy-request", accessed_by_admin_id: legacyOwnerId });
  for (let index = 2; index <= 3; index++) {
    for (const original of [...emergency.requests].slice(0, 2)) {
      emergency.requests.push({ ...original, id: `${original.id}-${index}`, status: "expired" });
    }
    for (const collection of ["owner_alerts", "merchant_notices"]) {
      for (const original of [...emergency[collection]].slice(0, 2)) {
        emergency[collection].push({ ...original, id: `${original.id}-${index}`, request_id: `${original.request_id}-${index}` });
      }
    }
  }
  emergency.audit_events[0].actor_admin_id = legacyOwnerId;
  emergency.audit_events[0].metadata = { historical_owner: legacyOwnerId };
  write("emergency-read-access.json", emergency);
  const result = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.errors));
  return { ...result, directory };
}

test("additive proposal preserves history and does not insert either owner or authorize a write", (t) => {
  const { report, snapshot, directory } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const before = structuredClone(report);
  const result = applyStagingRestorePolicy(report, snapshot, { includeRows: true });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(report, before, "source report must remain immutable");
  assert.ok(result.rows.accounts.every((r) => ![legacyOwnerId, currentOwnerId].includes(r.id)));
  assert.ok(result.rows.admin_profiles.every((r) => r.role !== "owner_admin"));
  assert.equal(result.rows.emergency_authorizations[0].granted_by_owner_account_id, currentOwnerId);
  assert.equal(before.rows.emergency_access_requests.length, 6);
  assert.equal(result.rows.emergency_access_requests.length, 3);
  assert.ok(result.rows.emergency_access_requests.every((r) => r.requested_by_admin_account_id === "admin-1" && r.reviewed_by_owner_account_id === null));
  assert.equal(result.rows.emergency_access_requests[0].requested_by_admin_account_id, "admin-1");
  assert.equal(result.rows.emergency_access_requests[0].reviewed_by_owner_account_id, null);
  assert.equal(result.rows.emergency_owner_alerts.length, 3);
  assert.equal(result.rows.emergency_merchant_notices.length, 3);
  const audit = result.rows.audit_events[0];
  assert.equal(audit.actor_account_id, null);
  assert.deepEqual(audit.metadata, before.rows.audit_events[0].metadata);
  assert.equal(audit.event_hash, before.rows.audit_events[0].event_hash);
  assert.deepEqual(audit, { ...before.rows.audit_events[0], actor_account_id: null });
  assert.deepEqual(result.rows.emergency_authorizations[0], { ...before.rows.emergency_authorizations[0], granted_by_owner_account_id: currentOwnerId });
  const deletion = result.rows.merchant_deletion_requests[0];
  assert.equal(deletion.requested_by_admin_id, "admin-1");
  assert.equal(deletion.requested_by_admin_id_snapshot, "admin-1");
  assert.equal(deletion.reviewed_by_admin_id, null);
  assert.equal(deletion.reviewed_at, before.rows.merchant_deletion_requests[0].reviewed_at);
  assert.deepEqual(deletion, { ...before.rows.merchant_deletion_requests[0], reviewed_by_admin_id: null });
  assert.ok(result.restore_history.some((r) => r.table === "emergency_access_requests" && r.original_row.requested_by_admin_account_id === legacyOwnerId));
  assert.ok(result.restore_history.some((r) => r.table === "merchant_deletion_requests" && r.original_value === legacyOwnerId));
  assert.ok(!JSON.stringify(result.restore_history).includes("password"));
  assert.equal(result.summary.planned_rows, result.planned_row_count);
  assert.equal(result.source_lineage.length, result.planned_row_count);
  assert.equal(result.write_readiness.ok, false);
  assert.throws(() => assertCompleteMigrationWritable(result), /ADDITIVE_STAGING_WRITER_NOT_IMPLEMENTED/);
  assert.throws(() => validatePlanForWrite(result, snapshot.value), /not write-ready/);
  assert.equal(result.restore_plan_sha256, applyStagingRestorePolicy(report, snapshot).restore_plan_sha256);
  const compact = applyStagingRestorePolicy(report, snapshot);
  assert.equal(compact.rows, undefined);
  assert.equal(compact.restore_history, undefined);
  const changed = structuredClone(report);
  changed.rows.audit_events[0].metadata.extra = "different history";
  assert.notEqual(result.restore_plan_sha256, applyStagingRestorePolicy(changed, snapshot).restore_plan_sha256);
  const cli = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/plan-staging-restore.mjs"), directory], {
    encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri" },
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const output = JSON.parse(cli.stdout);
  assert.equal(output.restore_plan_sha256, result.restore_plan_sha256);
  assert.equal(output.database_connection_used, false);
  assert.equal(output.writes_performed, false);
  assert.equal(output.rows, undefined);
  assert.equal(output.restore_history, undefined);
  const writeAttempt = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/plan-staging-restore.mjs"), directory, "--write"], { encoding: "utf8" });
  assert.notEqual(writeAttempt.status, 0);
  assert.match(writeAttempt.stderr, /no write mode/);
});

test("unexpected owners, live requests, security rows, unhandled FKs and prior errors fail closed", (t) => {
  const { report, snapshot, directory } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cases = [
    ["RESTORE_UNEXPECTED_SOURCE_OWNER", (r) => r.rows.admin_profiles.find((a) => a.id === "admin-1").role = "owner_admin"],
    ["RESTORE_CURRENT_OWNER_MUST_NOT_BE_IMPORTED", (r) => r.rows.accounts.push({ ...r.rows.accounts[0], id: currentOwnerId })],
    ["RESTORE_LIVE_EMERGENCY_REQUEST", (r) => r.rows.emergency_access_requests[0].status = "active"],
    ["RESTORE_SECURITY_ROWS_FORBIDDEN", (r) => r.rows.account_sessions.push({ id: "must-not-import" })],
    ["RESTORE_UNHANDLED_LEGACY_OWNER_REFERENCE", (r) => r.rows.support_inspection_requests[0].admin_account_id = legacyOwnerId],
    ["ORIGINAL_BLOCKER", (r) => r.errors.push({ code: "ORIGINAL_BLOCKER" })],
    ["ORPHAN_TARGET_REFERENCE", (r) => r.rows.emergency_authorizations[0].granted_by_owner_account_id = "unknown-owner"],
  ];
  for (const [code, mutate] of cases) {
    const changed = structuredClone(report);
    mutate(changed);
    const result = applyStagingRestorePolicy(changed, snapshot);
    assert.equal(result.ok, false, code);
    assert.ok(result.errors.some((r) => r.code === code), `${code}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.write_readiness.ok, false);
  }
});

test("existing migration writer rejects Neon even with its disposable guard enabled", () => {
  const flag = "FAWRI_POLICY_TEST_GUARD";
  const old = process.env[flag];
  process.env[flag] = "1";
  try {
    assert.throws(() => requireSafeDatabase("postgresql://test:test@ep-example.neon.tech/fawri_ci", flag), /only permit a local PostgreSQL host/);
    assert.throws(() => requireSafeDatabase("postgresql://test:test@localhost/production", flag), /only permit the fawri_ci database/);
  } finally {
    if (old === undefined) delete process.env[flag]; else process.env[flag] = old;
  }
});
