import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const auditPath = path.join(
  repositoryRoot,
  "scripts",
  "audit-transitional-migration-readiness.mjs",
);

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-transitional-audit-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function snapshot(directory) {
  return Object.fromEntries(
    fs
      .readdirSync(directory)
      .sort()
      .map((fileName) => {
        const bytes = fs.readFileSync(path.join(directory, fileName));
        return [
          fileName,
          {
            bytes: bytes.length,
            sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          },
        ];
      }),
  );
}

function baseFixture(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [{ id: "merchant-1", is_admin: false }],
    subscriptions: [
      {
        id: "subscription-1",
        merchant_id: "merchant-1",
      },
    ],
  });
  writeJson(directory, "fawri-runtime-db.json", {
    metaPagesByPageId: {
      "page-1": {
        page_id: "page-1",
        page_name: "Test Page",
        merchant_id: "merchant-1",
        page_access_token: "plaintext-secret-must-not-leak",
        connected_at: "2026-08-06T11:59:00.000Z",
      },
    },
  });
  writeJson(directory, "processed-meta-events.json", {
    events: {
      "meta:page-1:message-1": "2026-08-06T12:00:00.000Z",
    },
  });
  writeJson(directory, "reply-reservations.json", {
    reservations: {
      "meta:page-1:message-1": {
        event_id: "meta:page-1:message-1",
        merchant_id: "merchant-1",
        subscription_id: "subscription-1",
        amount: 1,
        status: "consumed",
        reserved_at: "2026-08-06T12:00:01.000Z",
        replies_remaining_after: 9,
      },
    },
  });
  writeJson(directory, "background-jobs.json", {
    version: 1,
    jobs: [
      {
        id: "job-1",
        type: "meta.webhook.reply",
        dedupe_key: "meta:page-1:message-1",
        merchant_id: "merchant-1",
        payload: {
          event_id: "meta:page-1:message-1",
          external_message_id: "message-1",
          webhook_body: {
            entry: [
              {
                messaging: [
                  { message: { text: "private customer message" } },
                ],
              },
            ],
          },
        },
        priority: 10,
        status: "completed",
        attempts: 1,
        max_attempts: 5,
        available_at: "2026-08-06T12:00:00.000Z",
        created_at: "2026-08-06T12:00:00.000Z",
        updated_at: "2026-08-06T12:00:03.000Z",
        completed_at: "2026-08-06T12:00:03.000Z",
        result: { delivery_status: "sent" },
      },
      {
        id: "job-dlq",
        type: "meta.webhook.reply",
        dedupe_key: "meta:page-1:message-2",
        merchant_id: "merchant-1",
        payload: {
          event_id: "meta:page-1:message-2",
          external_message_id: "message-2",
        },
        priority: 10,
        status: "dead_letter",
        attempts: 5,
        max_attempts: 5,
        available_at: "2026-08-06T12:00:00.000Z",
        created_at: "2026-08-06T12:00:00.000Z",
        updated_at: "2026-08-06T12:01:00.000Z",
        dead_lettered_at: "2026-08-06T12:01:00.000Z",
        last_error_code: "META_REPLY_FAILED",
        last_error_message: "failed",
      },
    ],
  });
}

function runAudit(directory, { includeRows = true } = {}) {
  return spawnSync(
    process.execPath,
    [auditPath, directory, ...(includeRows ? ["--include-rows"] : [])],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        FAWRI_INCLUDE_MIGRATION_ROWS: includeRows ? "1" : "0",
      },
    },
  );
}

test("transitional migration preflight is read-only and emits target rows", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const before = snapshot(directory);
    const result = runAudit(directory);
    const after = snapshot(directory);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(after, before, "preflight modified source files");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "read_only_migration_preflight");
    assert.equal(report.rows_included, true);
    assert.deepEqual(report.summary.row_counts, {
      processed_channel_events: 1,
      reply_ledger: 1,
      background_jobs: 2,
      job_dead_letters: 1,
    });
    assert.deepEqual(report.summary.target_row_counts, {
      merchant_channels: 1,
      processed_channel_events: 1,
      reply_ledger: 1,
      background_jobs: 2,
      job_dead_letters: 1,
    });
    assert.deepEqual(report.rows.processed_channel_events[0], {
      event_id: "meta:page-1:message-1",
      page_id: "page-1",
      merchant_id: "merchant-1",
      platform: "messenger",
      received_at: "2026-08-06T12:00:00.000Z",
    });

    const channel = report.target_rows.merchant_channels[0];
    assert.equal(channel.id, "legacy-meta-page:page-1");
    assert.equal(channel.merchant_id, "merchant-1");
    assert.equal(channel.page_id, "page-1");
    assert.equal(channel.token_ciphertext, null);
    assert.equal(channel.metadata.plaintext_token_present, true);
    assert.equal(channel.metadata.token_migration_required, true);

    const processedEvent = report.target_rows.processed_channel_events[0];
    assert.equal(processedEvent.channel_id, channel.id);
    assert.equal(processedEvent.external_event_id, "meta:page-1:message-1");
    assert.equal(processedEvent.processing_status, "completed");
    assert.match(processedEvent.payload_hash, /^[a-f0-9]{64}$/);

    const ledger = report.target_rows.reply_ledger[0];
    assert.equal(ledger.subscription_id, "subscription-1");
    assert.equal(ledger.external_event_id, "meta:page-1:message-1");
    assert.equal(ledger.direction, "debit");
    assert.equal(ledger.reason_code, "auto_reply");
    assert.equal(ledger.balance_after, 9);

    assert.equal(report.target_rows.background_jobs[0].merchant_id, "merchant-1");
    assert.equal(report.target_rows.job_dead_letters[0].job_id, "job-dlq");
    assert.ok(
      report.issues.some(
        (item) => item.code === "META_PAGE_TOKEN_REQUIRES_ENCRYPTED_MIGRATION",
      ),
    );
    assert.equal(
      result.stdout.includes("plaintext-secret-must-not-leak"),
      false,
      "plaintext Meta token leaked into preflight output",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("default preflight output hides row data and customer payloads", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const result = runAudit(directory, { includeRows: false });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.rows_included, false);
    assert.equal(Object.hasOwn(report, "rows"), false);
    assert.equal(Object.hasOwn(report, "target_rows"), false);
    assert.equal(result.stdout.includes("private customer message"), false);
    assert.equal(result.stdout.includes("external_message_id"), false);
    assert.equal(result.stdout.includes("plaintext-secret-must-not-leak"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("pending reservation and processing job block migration", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const reservations = JSON.parse(
      fs.readFileSync(path.join(directory, "reply-reservations.json"), "utf8"),
    );
    reservations.reservations["meta:page-1:message-1"].status = "pending";
    writeJson(directory, "reply-reservations.json", reservations);

    const jobs = JSON.parse(
      fs.readFileSync(path.join(directory, "background-jobs.json"), "utf8"),
    );
    jobs.jobs[0].status = "processing";
    jobs.jobs[0].locked_at = "2026-08-06T12:00:02.000Z";
    jobs.jobs[0].locked_by = "worker-1";
    delete jobs.jobs[0].completed_at;
    writeJson(directory, "background-jobs.json", jobs);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.ok(
      report.issues.some(
        (item) => item.code === "REPLY_RESERVATION_PENDING_BLOCKS_MIGRATION",
      ),
    );
    assert.ok(
      report.issues.some(
        (item) => item.code === "PROCESSING_JOB_BLOCKS_MIGRATION",
      ),
    );
    assert.equal(report.summary.row_counts.reply_ledger, 0);
    assert.equal(report.summary.target_row_counts.reply_ledger, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("page and subscription mismatches are rejected", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const merchants = JSON.parse(
      fs.readFileSync(path.join(directory, "merchants.json"), "utf8"),
    );
    merchants.merchants.push({ id: "merchant-2", is_admin: false });
    merchants.subscriptions[0].merchant_id = "merchant-2";
    writeJson(directory, "merchants.json", merchants);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(
        (item) => item.code === "REPLY_RESERVATION_SUBSCRIPTION_INVALID",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed source JSON fails safely", () => {
  const directory = makeDirectory();
  try {
    fs.writeFileSync(
      path.join(directory, "merchants.json"),
      "{ invalid-json",
      "utf8",
    );
    const result = runAudit(directory);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.ok, false);
    assert.equal(report.mode, "read_only_migration_preflight");
    assert.equal(report.rows_included, false);
    assert.match(report.fatal_error, /SyntaxError/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
