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
const runnerPath = path.join(
  repositoryRoot,
  "scripts",
  "run-postgresql-migration-plan.mjs",
);

function makeDataDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-validated-plan-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function snapshotDirectory(directory) {
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

function runValidatedPlan(directory) {
  return spawnSync(process.execPath, [runnerPath, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri",
    },
  });
}

function writeMerchant(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [
      {
        id: "merchant-1",
        owner_name: "Merchant Owner",
        store_name: "Merchant Store",
        activity_type: "retail",
        phone: "07700000001",
        password_hash: "merchant-password-hash",
        status: "approved",
        account_status: "approved",
        onboarding_status: "channel_connected",
        trial_status: "active",
        signup_source: "direct",
        language: "ar",
        otp_verified: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    subscriptions: [],
    support_tickets: [],
  });
}

test("validated migration plan matches schema and removes row payloads", () => {
  const directory = makeDataDirectory();
  try {
    writeMerchant(directory);
    const before = snapshotDirectory(directory);
    const result = runValidatedPlan(directory);
    const after = snapshotDirectory(directory);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(after, before, "validated plan changed source files");

    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "dry_run");
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.equal(report.summary.errors, 0);
    assert.equal(report.schema_validation.database_connection_used, false);
    assert.equal(report.schema_validation.rows_removed_from_output, true);
    assert.equal(report.schema_validation.validated_rows, 2);
    assert.equal("rows" in report, false, "sensitive row payloads leaked");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("validated migration plan rejects a conversation without a channel", () => {
  const directory = makeDataDirectory();
  try {
    writeMerchant(directory);
    writeJson(directory, "bot-runtime.json", {
      conversations: [
        {
          id: "conversation-1",
          merchant_id: "merchant-1",
          customer_external_id: "customer-1",
          status: "auto_replying",
        },
      ],
    });

    const before = snapshotDirectory(directory);
    const result = runValidatedPlan(directory);
    const after = snapshotDirectory(directory);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.deepEqual(after, before, "rejected plan changed source files");

    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(
      report.errors.some(
        (error) =>
          error.code === "REQUIRED_TARGET_VALUE_MISSING" &&
          error.table === "conversations" &&
          error.column === "channel_id",
      ),
    );
    assert.equal("rows" in report, false, "rejected plan leaked row payloads");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
