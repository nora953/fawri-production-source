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
const auditPath = path.join(repositoryRoot, "scripts", "audit-fawri-data.mjs");

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-aggregate-audit-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function createValidFixture(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [{ id: "merchant-1", is_admin: false, phone: "07111111111" }],
    subscriptions: [],
    support_tickets: [],
  });
  writeJson(directory, "fawri-runtime-db.json", {
    productsByMerchant: { "merchant-1": [] },
    conversationsByMerchant: {
      "merchant-1": [
        { id: "messenger-customer-1", merchant_id: "merchant-1" },
      ],
    },
    ordersByMerchant: { "merchant-1": [] },
    metaPagesByPageId: {
      "page-1": { page_id: "page-1", merchant_id: "merchant-1" },
    },
    orderDraftsByConversation: {},
  });
  writeJson(directory, "background-jobs.json", { version: 1, jobs: [] });
  writeJson(directory, "manual-conversation-operations.json", {
    version: 1,
    conversations: {},
  });
  writeJson(directory, "processed-meta-events.json", { events: {} });
  writeJson(directory, "reply-reservations.json", { reservations: {} });
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

function runAudit(directory) {
  return spawnSync(process.execPath, [auditPath, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri",
    },
  });
}

test("aggregate audit runs every server audit without writes or database use", () => {
  const directory = makeDirectory();
  try {
    createValidFixture(directory);
    const before = snapshot(directory);
    const result = runAudit(directory);
    const after = snapshot(directory);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(after, before, "aggregate audit modified source files");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "read_only_aggregate_audit");
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.deepEqual(report.summary, {
      auditors: 3,
      passed: 3,
      failed: 0,
      fatal: 0,
      issues: 0,
    });
    assert.equal(report.audits.json_sources.exit_code, 0);
    assert.equal(report.audits.background_jobs.exit_code, 0);
    assert.equal(report.audits.manual_conversations.exit_code, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("manual conversation reconciliation error fails aggregate audit", () => {
  const directory = makeDirectory();
  try {
    createValidFixture(directory);
    writeJson(directory, "manual-conversation-operations.json", {
      version: 1,
      conversations: {
        "merchant-1": {
          "messenger-customer-1": {
            status: "manual",
            assigned_to_human: true,
            page_id: "page-1",
            inbound_messages: [],
            manual_messages: [],
            updated_at: "2026-08-06T12:00:00.000Z",
            requests: {
              "manual-uncertain-0001": {
                idempotency_key: "manual-uncertain-0001",
                text_sha256:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                status: "uncertain",
                error_code: "META_MANUAL_REPLY_TRANSPORT_UNCERTAIN",
                created_at: "2026-08-06T12:00:00.000Z",
                updated_at: "2026-08-06T12:00:01.000Z",
              },
            },
          },
        },
      },
    });

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.summary.failed, 1);
    assert.equal(report.summary.fatal, 0);
    assert.ok(
      report.audits.manual_conversations.report.issues.some(
        (item) => item.code === "MANUAL_REQUEST_OUTCOME_UNCERTAIN",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed source JSON is reported as a fatal aggregate failure", () => {
  const directory = makeDirectory();
  try {
    createValidFixture(directory);
    fs.writeFileSync(
      path.join(directory, "background-jobs.json"),
      "{ invalid-json",
      "utf8",
    );

    const result = runAudit(directory);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.summary.fatal, 1);
    assert.equal(report.audits.background_jobs.exit_code, 1);
    assert.match(
      report.audits.background_jobs.report.fatal_error,
      /SyntaxError/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
