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
    assert.equal(report.tool_version, "6");
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

test("FIELD004 rejects conflicting duplicate draft IDs", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    const draft = {
      id: "draft-collision",
      merchant_id: "merchant-1",
      customer_external_id: "customer-1",
      awaiting_field: "product",
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
      expires_at: "2026-08-03T00:00:00.000Z",
    };
    runtime.conversationsByMerchant["merchant-1"].push({
      ...runtime.conversationsByMerchant["merchant-1"][0],
      id: "conversation-2",
    });
    runtime.orderDraftsByConversation = {
      "conversation-1": { ...draft, draft_data: { name: "first" } },
      "conversation-2": { ...draft, draft_data: { name: "second" } },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, false);
    assert.ok(report.errors.some((issue) =>
      issue.code === "DUPLICATE_TARGET_IDENTITY_CONFLICT" &&
      issue.table === "order_drafts"
    ));
    assert.equal(report.rows.order_drafts.find((row) => row.id === "draft-collision").conversation_id, "conversation-1");
    assert.throws(() => assertCompleteMigrationWritable(report));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 rejects a draft without proven original expiry", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "draft-without-expiry",
        merchant_id: "merchant-1",
        customer_external_id: "customer-1",
        awaiting_field: "product",
        started_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    });
    assert.equal(report.write_readiness.ok, false);
    assert.ok(report.errors.some((issue) =>
      issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID"
    ));
    assert.equal(
      report.rows.order_drafts.some((row) => row.id === "draft-without-expiry"),
      false,
    );
    assert.throws(() => assertCompleteMigrationWritable(report));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 retains verified legacy draft without changing original expiry", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "verified-draft",
        merchant_id: "merchant-1",
        customer_external_id: "customer-1",
        awaiting_field: "product",
        created_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:05:00.000Z",
        expires_at: "2026-08-02T01:00:00.000Z",
        draft_data: { awaiting: "product" },
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, true, JSON.stringify(report.errors));
    const draft = report.rows.order_drafts.find((row) => row.id === "verified-draft");
    assert.ok(draft);
    assert.equal(draft.expires_at, "2026-08-02T01:00:00.000Z");
    assert.equal(draft.created_at, "2026-08-02T00:00:00.000Z");
    assert.equal(draft.customer_external_id, "customer-1");
    assert.equal(draft.draft_data.awaiting, "product");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 maps historical draft keys only with explicit expiry evidence", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "historical-draft",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "customer_info",
        started_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:10:00.000Z",
        expires_at: "2026-08-02T01:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, true, JSON.stringify(report.errors));
    const draft = report.rows.order_drafts.find((row) => row.id === "historical-draft");
    assert.ok(draft);
    assert.equal(draft.customer_external_id, "customer-1");
    assert.equal(draft.awaiting_field, "customer_info");
    assert.equal(draft.created_at, "2026-08-02T00:00:00.000Z");
    assert.equal(draft.expires_at, "2026-08-02T01:00:00.000Z");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 rejects conflicting historical and canonical draft aliases", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "alias-conflict",
        merchant_id: "merchant-1",
        customer_external_id: "customer-1",
        customer_id: "another-customer",
        awaiting_field: "product",
        awaiting: "customer_info",
        created_at: "2026-08-02T00:00:00.000Z",
        started_at: "2026-08-02T00:05:00.000Z",
        updated_at: "2026-08-02T00:10:00.000Z",
        expires_at: "2026-08-02T01:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, false);
    assert.ok(report.errors.some((issue) => issue.code === "LEGACY_DRAFT_FIELD_ALIAS_CONFLICT"));
    assert.equal(report.rows.order_drafts.some((row) => row.id === "alias-conflict"), false);
    assert.throws(() => assertCompleteMigrationWritable(report));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 rejects unsupported legacy state despite valid identity and timestamps", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "unsupported-state",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "payment",
        started_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:10:00.000Z",
        expires_at: "2026-08-02T01:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, false);
    assert.ok(report.errors.some((issue) => issue.code === "LEGACY_DRAFT_STATE_UNSUPPORTED"));
    assert.equal(report.rows.order_drafts.some((row) => row.id === "unsupported-state"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 rejects legacy draft expiry earlier than its last update", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "invalid-chronology",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "product",
        started_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T02:00:00.000Z",
        expires_at: "2026-08-02T01:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, false);
    assert.ok(report.errors.some((issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID"));
    assert.equal(report.rows.order_drafts.some((row) => row.id === "invalid-chronology"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 rejects draft whose customer does not own its conversation", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "wrong-customer",
        merchant_id: "merchant-1",
        customer_id: "customer-other",
        awaiting: "product",
        started_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:10:00.000Z",
        expires_at: "2026-08-02T01:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, false);
    assert.ok(report.errors.some((issue) => issue.code === "LEGACY_DRAFT_CONVERSATION_IDENTITY_UNVERIFIED"));
    assert.equal(report.rows.order_drafts.some((row) => row.id === "wrong-customer"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FIELD004 refuses to invent missing legacy draft last-update time", () => {
  const directory = createFixture();
  try {
    const runtime = readJson(directory, "fawri-runtime-db.json");
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "missing-update",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "product",
        started_at: "2026-08-02T00:00:00.000Z",
        expires_at: "2026-08-02T01:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", runtime);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory, includeRows: true });
    assert.equal(report.write_readiness.ok, false);
    assert.ok(report.errors.some((issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID"));
    assert.equal(report.rows.order_drafts.some((row) => row.id === "missing-update"), false);
    assert.throws(() => assertCompleteMigrationWritable(report));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
