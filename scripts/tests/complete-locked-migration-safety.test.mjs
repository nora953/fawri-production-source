import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCompleteLockedMigration } from "../../lib/db/scripts/run-complete-migration-with-operational-locks.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const lockFiles = [
  "background-jobs.json",
  "bot-runtime.json",
  "emergency-read-access.json",
  "fawri-runtime-db.json",
  "learned-answers.json",
  "manual-conversation-operations.json",
  "merchant-settings.json",
  "merchants.json",
  "order-operations.json",
  "processed-meta-events.json",
  "reply-reservations.json",
  "saved-answers.json",
  "support-preview-sessions.json",
  "training-requests.json",
].map((fileName) => `${fileName}.lock`);

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-complete-locks-"));
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

test("existing source lock prevents any migration work", () => {
  const directory = createFixture();
  try {
    const lockPath = path.join(directory, "merchant-settings.json.lock");
    fs.writeFileSync(lockPath, "busy\n", "utf8");

    assert.throws(
      () =>
        runCompleteLockedMigration({
          mode: "rollback",
          dataDirectory: directory,
          childEnvironment: {},
        }),
      (error) => error.code === "OPERATIONAL_MIGRATION_LOCK_BUSY",
    );
    assert.equal(fs.readFileSync(lockPath, "utf8"), "busy\n");
    for (const fileName of lockFiles.filter(
      (fileName) => fileName !== "merchant-settings.json.lock",
    )) {
      assert.equal(fs.existsSync(path.join(directory, fileName)), false);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("child permission failure releases every acquired lock", () => {
  const directory = createFixture();
  try {
    assert.throws(
      () =>
        runCompleteLockedMigration({
          mode: "commit",
          dataDirectory: directory,
          childEnvironment: {
            DATABASE_URL: "postgresql://127.0.0.1:5432/fawri_ci",
          },
        }),
      (error) => error.code === "MIGRATION_CHILD_FAILED",
    );
    for (const fileName of lockFiles) {
      assert.equal(fs.existsSync(path.join(directory, fileName)), false);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid settings fail after locks and before child process startup", () => {
  const directory = createFixture();
  try {
    const settingsPath = path.join(directory, "merchant-settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    settings.settings["merchant-1"].payment.cash_on_delivery_enabled = false;
    settings.settings["merchant-1"].payment.electronic_payment_enabled = false;
    settings.settings["merchant-1"].payment.methods = [];
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

    assert.throws(
      () =>
        runCompleteLockedMigration({
          mode: "rollback",
          dataDirectory: directory,
          childEnvironment: {
            DATABASE_URL: "postgresql://must-not-connect.invalid/fawri",
          },
        }),
      (error) => {
        assert.equal(error.code, "MIGRATION_PLAN_INVALID");
        assert.ok(
          error.report.errors.some(
            (item) => item.code === "MERCHANT_SETTINGS_PAYMENT_UNAVAILABLE",
          ),
        );
        return true;
      },
    );
    for (const fileName of lockFiles) {
      assert.equal(fs.existsSync(path.join(directory, fileName)), false);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
