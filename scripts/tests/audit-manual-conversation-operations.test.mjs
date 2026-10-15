import assert from "node:assert/strict";
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
  "audit-manual-conversation-operations.mjs",
);

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-manual-audit-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function baseFixture(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [{ id: "merchant-1", is_admin: false }],
  });
  writeJson(directory, "fawri-runtime-db.json", {
    conversationsByMerchant: {
      "merchant-1": [
        {
          id: "messenger-customer-1",
          merchant_id: "merchant-1",
        },
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
          updated_at: "2026-08-06T12:00:03.000Z",
          inbound_messages: [
            {
              id: "inbound-message-1",
              external_message_id: "meta-inbound-1",
              conversation_id: "messenger-customer-1",
              sender: "customer",
              text: "private customer message",
              created_at: "2026-08-06T12:00:00.000Z",
              counted_as_auto_reply: false,
              status: "received",
            },
          ],
          manual_messages: [
            {
              id: "message-1",
              external_message_id: "meta-message-1",
              conversation_id: "messenger-customer-1",
              sender: "merchant",
              text: "private manual reply",
              created_at: "2026-08-06T12:00:02.000Z",
              counted_as_auto_reply: false,
              reply_type: "manual",
              status: "sent",
            },
          ],
          requests: {
            "manual-request-0000001": {
              idempotency_key: "manual-request-0000001",
              text_sha256:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              status: "sent",
              created_at: "2026-08-06T12:00:01.000Z",
              updated_at: "2026-08-06T12:00:03.000Z",
              message_id: "message-1",
              external_message_id: "meta-message-1",
            },
          },
        },
      },
    },
  });
}

function runAudit(directory) {
  return spawnSync(process.execPath, [auditPath, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("valid manual conversation overlay passes without leaking message text", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const before = fs.readFileSync(
      path.join(directory, "manual-conversation-operations.json"),
      "utf8",
    );
    const result = runAudit(directory);
    const after = fs.readFileSync(
      path.join(directory, "manual-conversation-operations.json"),
      "utf8",
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(after, before, "audit modified manual conversation data");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.deepEqual(report.summary, {
      conversations: 1,
      inbound_messages: 1,
      manual_messages: 1,
      requests: 1,
      issues: 0,
      severity_counts: {},
    });
    assert.equal(result.stdout.includes("private manual reply"), false);
    assert.equal(result.stdout.includes("private customer message"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid inbound message is rejected", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const filePath = path.join(
      directory,
      "manual-conversation-operations.json",
    );
    const overlay = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const inbound =
      overlay.conversations["merchant-1"]["messenger-customer-1"]
        .inbound_messages[0];
    inbound.sender = "merchant";
    delete inbound.external_message_id;
    writeJson(directory, "manual-conversation-operations.json", overlay);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(
        (item) => item.code === "MANUAL_INBOUND_MESSAGE_SHAPE_INVALID",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("uncertain delivery outcome blocks a clean audit", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const filePath = path.join(
      directory,
      "manual-conversation-operations.json",
    );
    const overlay = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const request =
      overlay.conversations["merchant-1"]["messenger-customer-1"].requests[
        "manual-request-0000001"
      ];
    request.status = "uncertain";
    request.error_code = "META_MANUAL_REPLY_TRANSPORT_UNCERTAIN";
    delete request.message_id;
    writeJson(directory, "manual-conversation-operations.json", overlay);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(
        (item) => item.code === "MANUAL_REQUEST_OUTCOME_UNCERTAIN",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("stale pending request and invalid page are rejected", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const filePath = path.join(
      directory,
      "manual-conversation-operations.json",
    );
    const overlay = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const conversation =
      overlay.conversations["merchant-1"]["messenger-customer-1"];
    conversation.page_id = "page-other";
    const request = conversation.requests["manual-request-0000001"];
    request.status = "pending";
    request.created_at = "2020-01-01T00:00:00.000Z";
    request.updated_at = "2020-01-01T00:00:00.000Z";
    delete request.message_id;
    writeJson(directory, "manual-conversation-operations.json", overlay);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some((item) => item.code === "MANUAL_OVERLAY_PAGE_INVALID"),
    );
    assert.ok(
      report.issues.some(
        (item) => item.code === "MANUAL_REQUEST_PENDING_STALE",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed overlay JSON fails safely", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "merchants.json", { merchants: [] });
    writeJson(directory, "fawri-runtime-db.json", {});
    fs.writeFileSync(
      path.join(directory, "manual-conversation-operations.json"),
      "{ invalid-json",
      "utf8",
    );
    const result = runAudit(directory);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.ok, false);
    assert.match(report.fatal_error, /SyntaxError/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
