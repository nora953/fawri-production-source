import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildValidatedMigrationPlan } from "../lib/postgresql-migration-plan.mjs";

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-validated-plan-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function queuedJob() {
  return {
    id: "job-1",
    type: "system.test",
    dedupe_key: "test-1",
    payload: { purpose: "manifest-test" },
    priority: 0,
    status: "queued",
    attempts: 0,
    max_attempts: 5,
    available_at: "2026-08-06T12:00:00.000Z",
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
  };
}

function writeManualFixture(directory, requestStatus = null) {
  writeJson(directory, "merchants.json", {
    merchants: [
      {
        id: "merchant-1",
        is_admin: false,
        phone: "07111111111",
        password: "legacy-password-hash",
        owner_name: "Owner",
        store_name: "Store",
        activity_type: "retail",
        status: "approved",
        account_status: "approved",
        onboarding_status: "channel_connected",
        trial_status: "active",
        signup_source: "direct",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    subscriptions: [],
  });
  writeJson(directory, "fawri-runtime-db.json", {
    conversationsByMerchant: {
      "merchant-1": [
        { id: "messenger-customer-1", merchant_id: "merchant-1" },
      ],
    },
    metaPagesByPageId: {
      "page-1": { page_id: "page-1", merchant_id: "merchant-1" },
    },
  });
  writeJson(directory, "manual-conversation-operations.json", {
    version: 1,
    conversations: {
      "merchant-1": {
        "messenger-customer-1": {
          status: "manual",
          assigned_to_human: true,
          page_id: "page-1",
          updated_at: "2026-08-06T12:00:00.000Z",
          manual_messages: [],
          requests: requestStatus
            ? {
                "manual-request-0000001": {
                  idempotency_key: "manual-request-0000001",
                  text_sha256:
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  status: requestStatus,
                  created_at: "2026-08-06T12:00:00.000Z",
                  updated_at: "2026-08-06T12:00:01.000Z",
                  error_code:
                    requestStatus === "uncertain"
                      ? "META_MANUAL_REPLY_TRANSPORT_UNCERTAIN"
                      : undefined,
                },
              }
            : {},
        },
      },
    },
  });
}

test("validated plan includes private transitional and manual readiness summaries", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "background-jobs.json", { version: 1, jobs: [] });
    writeJson(directory, "manual-conversation-operations.json", {
      version: 1,
      conversations: {},
    });
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });

    assert.equal(report.ok, true);
    assert.equal(report.tool_version, "3");
    assert.equal(report.database_connection_used, false);
    assert.equal(report.schema_validation.database_connection_used, false);
    assert.equal(report.transitional_migration.ok, true);
    assert.equal(report.transitional_migration.rows_included, false);
    assert.equal(
      Object.hasOwn(report.transitional_migration, "rows"),
      false,
    );
    assert.equal(
      Object.hasOwn(report.transitional_migration, "target_rows"),
      false,
    );
    assert.equal(
      report.transitional_migration.summary.target_row_counts.background_jobs,
      0,
    );
    assert.equal(
      report.source_files.transitional_backgroundJobs.file,
      "background-jobs.json",
    );
    assert.equal(report.manual_conversation_migration.ok, true);
    assert.equal(report.manual_conversation_migration.rows_included, false);
    assert.equal(
      report.source_files.manualConversationOperations.file,
      "manual-conversation-operations.json",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("transitional source changes alter the validated source manifest", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "background-jobs.json", { version: 1, jobs: [] });
    writeJson(directory, "manual-conversation-operations.json", {
      version: 1,
      conversations: {},
    });
    const first = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    writeJson(directory, "background-jobs.json", {
      version: 1,
      jobs: [queuedJob()],
    });
    const second = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(
      first.source_manifest_sha256,
      second.source_manifest_sha256,
      "transitional data change did not alter source manifest",
    );
    assert.equal(
      second.transitional_migration.summary.target_row_counts.background_jobs,
      1,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("manual conversation source changes alter the validated source manifest", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "background-jobs.json", { version: 1, jobs: [] });
    writeJson(directory, "manual-conversation-operations.json", {
      version: 1,
      conversations: {},
    });
    const first = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    writeManualFixture(directory);
    const second = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(first.source_manifest_sha256, second.source_manifest_sha256);
    assert.equal(second.manual_conversation_migration.summary.conversations, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("processing jobs block the validated migration plan", () => {
  const directory = makeDirectory();
  try {
    const job = queuedJob();
    job.status = "processing";
    job.attempts = 1;
    job.locked_at = "2026-08-06T12:00:01.000Z";
    job.locked_by = "worker-1";
    writeJson(directory, "background-jobs.json", { version: 1, jobs: [job] });
    writeJson(directory, "manual-conversation-operations.json", {
      version: 1,
      conversations: {},
    });

    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });
    assert.equal(report.ok, false);
    assert.equal(report.summary.transitional_errors, 1);
    assert.ok(
      report.errors.some(
        (item) =>
          item.code === "PROCESSING_JOB_BLOCKS_MIGRATION" &&
          item.source === "transitional_migration_preflight",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("uncertain manual reply outcome blocks the validated migration plan", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "background-jobs.json", { version: 1, jobs: [] });
    writeManualFixture(directory, "uncertain");

    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });
    assert.equal(report.ok, false);
    assert.equal(report.summary.manual_conversation_errors, 1);
    assert.ok(
      report.errors.some(
        (item) =>
          item.code === "MANUAL_REQUEST_OUTCOME_UNCERTAIN" &&
          item.source === "manual_conversation_preflight",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid transitional JSON fails before any database use", () => {
  const directory = makeDirectory();
  try {
    fs.writeFileSync(
      path.join(directory, "background-jobs.json"),
      "{ invalid-json",
      "utf8",
    );
    assert.throws(
      () => buildValidatedMigrationPlan({ dataDirectory: directory }),
      /SyntaxError/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid manual conversation JSON fails before any database use", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "background-jobs.json", { version: 1, jobs: [] });
    fs.writeFileSync(
      path.join(directory, "manual-conversation-operations.json"),
      "{ invalid-json",
      "utf8",
    );
    assert.throws(
      () => buildValidatedMigrationPlan({ dataDirectory: directory }),
      /SyntaxError/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
