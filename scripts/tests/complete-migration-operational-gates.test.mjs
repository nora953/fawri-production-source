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
    assert.equal(report.tool_version, "7");
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
