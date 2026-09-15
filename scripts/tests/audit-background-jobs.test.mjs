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
  "audit-fawri-background-jobs.mjs",
);

function makeDataDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-job-audit-"));
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

function runAudit(directory, nowVisibilityMs = 300_000) {
  return spawnSync(process.execPath, [auditPath, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FAWRI_JOB_VISIBILITY_TIMEOUT_MS: String(nowVisibilityMs),
    },
  });
}

function validJob(overrides = {}) {
  return {
    id: "job-1",
    type: "meta.webhook",
    dedupe_key: "event-1",
    merchant_id: "merchant-1",
    payload: { event_id: "event-1" },
    priority: 0,
    status: "queued",
    attempts: 0,
    max_attempts: 5,
    available_at: "2026-08-06T12:00:00.000Z",
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
    ...overrides,
  };
}

test("job queue audit is read-only for a valid store", () => {
  const directory = makeDataDirectory();
  try {
    writeJson(directory, "merchants.json", {
      merchants: [{ id: "merchant-1", is_admin: false }],
    });
    writeJson(directory, "background-jobs.json", {
      version: 1,
      jobs: [validJob()],
    });
    const before = snapshotDirectory(directory);
    const result = runAudit(directory);
    const after = snapshotDirectory(directory);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(after, before, "job audit modified source files");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "read_only");
    assert.equal(report.summary.jobs, 1);
    assert.deepEqual(report.summary.status_counts, { queued: 1 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("job queue audit rejects duplicates and stale processing claims", () => {
  const directory = makeDataDirectory();
  try {
    writeJson(directory, "merchants.json", {
      merchants: [{ id: "merchant-1", is_admin: false }],
    });
    writeJson(directory, "background-jobs.json", {
      version: 1,
      jobs: [
        validJob({
          status: "processing",
          attempts: 1,
          locked_at: "2020-01-01T00:00:00.000Z",
          locked_by: "dead-worker",
        }),
        validJob({ id: "job-2" }),
      ],
    });

    const result = runAudit(directory, 1_000);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.ok(
      report.issues.some(
        (item) => item.code === "DUPLICATE_JOB_DEDUPE_KEY",
      ),
    );
    assert.ok(
      report.issues.some((item) => item.code === "STALE_PROCESSING_JOB"),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("job queue audit fails safely for malformed JSON", () => {
  const directory = makeDataDirectory();
  try {
    fs.writeFileSync(
      path.join(directory, "background-jobs.json"),
      "{ invalid-json",
      "utf8",
    );
    const result = runAudit(directory);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.ok, false);
    assert.equal(report.mode, "read_only");
    assert.match(report.fatal_error, /SyntaxError/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
