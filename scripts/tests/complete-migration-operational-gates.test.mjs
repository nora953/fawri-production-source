import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertCompleteMigrationWritable,
  buildValidatedMigrationPlan,
} from "../lib/postgresql-migration-plan-complete.mjs";
import { buildValidatedMigrationPlan as buildReconciledPlan } from "../lib/postgresql-cross-lane-reconciliation.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-complete-plan-"));
  for (const script of [
    "create-postgresql-migration-fixture.mjs",
    "create-transitional-migration-fixture.mjs",
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, "scripts/tests/fixtures", script), directory],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return directory;
}

function readJson(directory, fileName) {
  return JSON.parse(fs.readFileSync(path.join(directory, fileName), "utf8"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

test("complete plan includes operational overlays and deterministic lineage", () => {
  const directory = createFixture();
  try {
    const { report } = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    });

    assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
    assert.equal(report.tool_version, "8");
    assert.equal(report.write_readiness.ok, true);
    assert.equal(report.write_readiness.operational_overlays_supported, true);
    assert.doesNotThrow(() => assertCompleteMigrationWritable(report));
    assert.equal(report.rows.messages.length, 2);
    assert.equal(report.rows.manual_reply_requests.length, 1);
    assert.equal(report.rows.merchant_settings.length, 1);
    const order = report.rows.orders.find((item) => item.id === "order-1");
    assert.equal(order.version, 2);
    assert.equal(order.payment_status, "paid");
    assert.equal(order.payment_verified_by_account_id, "merchant-1");
    const conversation = report.rows.conversations.find(
      (item) => item.id === "conversation-1",
    );
    assert.equal(conversation.status, "manual");
    assert.equal(conversation.assigned_to_human, true);
    assert.match(report.source_manifest_sha256, /^[a-f0-9]{64}$/);
    assert.match(report.source_lineage_sha256, /^[a-f0-9]{64}$/);
    assert.equal(report.source_lineage.length, report.planned_row_count);
    assert.equal(report.summary.planned_rows, report.planned_row_count);
    assert.ok(
      report.source_lineage.some(
        (item) =>
          item.source_key === "manualConversationOperations" &&
          item.target_table === "manual_reply_requests",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test("legacy auth operational state is preserved without creating channel connections", () => {
  const directory = createFixture();
  try {
    const auth = readJson(directory, "merchants.json");

    auth.channel_overrides = {
      "merchant-1": {
        messenger: "pending",
        instagram: "disconnected",
      },
    };

    auth.deletion_requests = [
      {
        id: "deletion-request-1",
        merchant_id: "merchant-1",
        merchant_name: "Merchant Store",
        merchant_phone: "07700000001",
        requested_by_admin_id: "admin-1",
        requested_by_admin_name: "Owner Admin",
        requested_by_admin_phone: "07700000002",
        reason: "policy_violation",
        details: "Legacy deletion request",
        status: "rejected",
        reviewed_by_admin_id: "admin-1",
        reviewed_at: "2026-08-04T00:00:00.000Z",
        created_at: "2026-08-03T00:00:00.000Z",
      },
    ];

    writeJson(directory, "merchants.json", auth);

    const { report } = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    });

    assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
    assert.equal(report.rows.merchant_channel_overrides.length, 2);
    assert.equal(report.rows.merchant_deletion_requests.length, 1);

    const messenger = report.rows.merchant_channel_overrides.find(
      (row) => row.merchant_id === "merchant-1" && row.platform === "messenger",
    );
    assert.equal(messenger?.status, "pending");

    const instagram = report.rows.merchant_channel_overrides.find(
      (row) => row.merchant_id === "merchant-1" && row.platform === "instagram",
    );
    assert.equal(instagram?.status, "disconnected");
    for (const build of [buildValidatedMigrationPlan, buildReconciledPlan]) {
      for (const includeRows of [true, false]) {
        const plan = build({ dataDirectory: directory, includeRows }).report;
        assert.equal(plan.ok, true, JSON.stringify(plan.errors));
        assert.equal(plan.summary.planned_rows, plan.planned_row_count);
        assert.equal(plan.source_lineage.length, plan.planned_row_count);
        assert.deepEqual(plan.source_lineage.filter((r) => r.target_table === "merchant_channel_overrides")
          .map((r) => r.target_record_id).sort(), ['["merchant-1","instagram"]', '["merchant-1","messenger"]']);
      }
      const before = build({ dataDirectory: directory, includeRows: true }).report;
      const changed = structuredClone(auth);
      changed.channel_overrides["merchant-1"].messenger = "disconnected";
      writeJson(directory, "merchants.json", changed);
      const after = build({ dataDirectory: directory, includeRows: true }).report;
      const lineage = (p) => p.source_lineage.find((r) => r.target_record_id === '["merchant-1","messenger"]');
      assert.equal(lineage(before).target_record_id, lineage(after).target_record_id);
      assert.notEqual(lineage(before).source_record_sha256, lineage(after).source_record_sha256);
      writeJson(directory, "merchants.json", auth);
    }

    const deletion = report.rows.merchant_deletion_requests[0];
    assert.equal(deletion.id, "deletion-request-1");
    assert.equal(deletion.merchant_id, "merchant-1");
    assert.equal(deletion.merchant_id_snapshot, "merchant-1");
    assert.equal(deletion.reason, "policy_violation");
    assert.equal(deletion.status, "rejected");
    assert.equal(deletion.reviewed_by_admin_id, "admin-1");

    assert.equal(
      report.rows.merchant_channels.length,
      1,
      "legacy overrides must not create additional canonical channel connections",
    );

    assert.ok(
      report.source_lineage.some(
        (item) =>
          item.source_key === "auth" &&
          item.target_table === "merchant_channel_overrides",
      ),
    );
    assert.ok(
      report.source_lineage.some(
        (item) =>
          item.source_key === "auth" &&
          item.target_table === "merchant_deletion_requests",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy notifications, admin history and notes retain their semantics without OTP authority", () => {
  const directory = createFixture();
  try {
    const auth = readJson(directory, "merchants.json");
    auth.otps = [{ code: "OTP-DO-NOT-COPY", phone: "private", used: false }];
    auth.admin_notes = { "merchant-1": "Historical note" };
    auth.merchant_notifications = [{ id: "notice-1", merchant_id: "merchant-1", type: "subscription_plan_event",
      created_at: "2026-01-01T00:00:00Z", expires_at: "2026-02-01T00:00:00Z", operation: "renew", plan_name: "gold", read_at: "2026-01-02T00:00:00Z" }];
    auth.admin_logs = ["admin-1", "retired-admin", ""].map((admin_id, index) => ({
      id: `admin-log-${index}`, admin_id, admin_name: "Historical actor", admin_phone: "old phone", admin_role: "owner_admin",
      merchant_id: index === 1 ? "deleted-merchant" : "merchant-1", merchant_name: "Historical store",
      action_type: "subscription_renewed", details: "Historical details", reason: "Historical reason",
      meta: { amount: 12, nested: { evidence: true } }, created_at: "2026-01-01T00:00:00Z",
    }));
    writeJson(directory, "merchants.json", auth);
    for (const build of [buildValidatedMigrationPlan, buildReconciledPlan]) {
      const report = build({ dataDirectory: directory, includeRows: true }).report;
      assert.equal(report.ok, true, JSON.stringify(report.errors));
      const notification = report.rows.notifications[0];
      assert.equal(notification.account_id, "merchant-1");
      assert.equal(notification.expires_at, null, "subscription expiry is not notification TTL");
      assert.equal(notification.variables.expires_at, auth.merchant_notifications[0].expires_at);
      assert.equal(notification.read_at, auth.merchant_notifications[0].read_at);
      const logs = report.rows.audit_events.filter((r) => r.id.startsWith("admin-log-"));
      assert.equal(logs.length, 3);
      assert.equal(logs[0].actor_account_id, "admin-1");
      assert.equal(logs[1].actor_account_id, null);
      assert.equal(logs[1].merchant_id, null);
      assert.equal(logs[1].metadata.source_admin_id, "retired-admin");
      assert.equal(logs[1].metadata.merchant_id_snapshot, "deleted-merchant");
      assert.equal(logs[2].actor_kind, "system");
      assert.deepEqual(logs[0].metadata.source_meta, auth.admin_logs[0].meta);
      assert.equal(logs[0].event_hash, null, "do not invent an audit chain");
      assert.equal(report.rows.merchant_admin_notes[0].note, "Historical note");
      assert.equal(report.rows.merchant_admin_notes[0].updated_by_admin_id, null);
      assert.equal(report.legacy_auth_history.security_exclusions.otps.count, 1);
      assert.ok(!JSON.stringify(report).includes("OTP-DO-NOT-COPY"));
      assert.equal(report.summary.planned_rows, report.source_lineage.length);
      assert.ok(report.source_lineage.some((r) => r.target_table === "audit_events" && r.target_record_id === "admin-log-0" && r.source_key === "auth"));
    }
    const cases = [
      ["LEGACY_NOTIFICATION_UNSUPPORTED", (v) => v.merchant_notifications[0].unexpected_token = "do-not-copy"],
      ["LEGACY_NOTIFICATION_MERCHANT_MISSING", (v) => v.merchant_notifications[0].merchant_id = "unknown"],
      ["LEGACY_ADMIN_LOG_UNSUPPORTED", (v) => v.admin_logs[0].meta = "invalid"],
      ["LEGACY_ADMIN_NOTE_INVALID", (v) => v.admin_notes["merchant-1"] = "x".repeat(5001)],
      ["LEGACY_HISTORY_RECORD_INVALID", (v) => v.admin_logs[0].created_at = "invalid"],
      ["DUPLICATE_TARGET_IDENTITY_CONFLICT", (v) => v.admin_logs.push({ ...v.admin_logs[0], details: "conflict" })],
      ["LEGACY_HISTORY_COLLECTION_INVALID", (v) => v.merchant_notifications = {}],
    ];
    for (const [code, mutate] of cases) {
      const changed = structuredClone(auth);
      mutate(changed);
      writeJson(directory, "merchants.json", changed);
      const report = buildReconciledPlan({ dataDirectory: directory }).report;
      assert.equal(report.ok, false, code);
      assert.ok(report.errors.some((e) => e.code === code), JSON.stringify(report.errors));
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("source mutation changes both manifest identity and lineage identity", () => {
  const directory = createFixture();
  try {
    const first = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    }).report;
    const settings = readJson(directory, "merchant-settings.json");
    settings.settings["merchant-1"].delivery.notes = "Changed after validation";
    writeJson(directory, "merchant-settings.json", settings);
    const second = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    }).report;

    assert.notEqual(first.source_manifest_sha256, second.source_manifest_sha256);
    assert.notEqual(first.source_lineage_sha256, second.source_lineage_sha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid operational settings fail closed before database use", () => {
  const directory = createFixture();
  try {
    const settings = readJson(directory, "merchant-settings.json");
    settings.settings["merchant-1"].delivery.estimated_days_min = 8;
    settings.settings["merchant-1"].delivery.estimated_days_max = 2;
    writeJson(directory, "merchant-settings.json", settings);

    const { report } = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: false,
    });
    assert.equal(report.ok, false);
    assert.equal(report.database_connection_used, false);
    assert.equal(report.write_readiness.ok, false);
    assert.ok(
      report.errors.some(
        (item) => item.code === "MERCHANT_SETTINGS_DELIVERY_INVALID",
      ),
      JSON.stringify(report.errors, null, 2),
    );
    assert.throws(
      () => assertCompleteMigrationWritable(report),
      (error) => error.code === "MIGRATION_WRITE_NOT_READY",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
