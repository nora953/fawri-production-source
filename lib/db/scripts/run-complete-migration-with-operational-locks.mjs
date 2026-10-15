import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCompleteMigrationWritable,
  buildValidatedMigrationPlan,
  canonicalJson,
  repositoryRoot,
} from "../../../scripts/lib/postgresql-cross-lane-reconciliation.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const supportedModes = new Map([
  ["rollback", "rollback-migration.mjs"],
  ["commit", "commit-migration.mjs"],
]);
const sourceFiles = [
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
].sort();

function usage() {
  return "Usage: node run-complete-migration-with-operational-locks.mjs <rollback|commit> <data-directory>";
}

function acquireLock(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    const descriptor = fs.openSync(filePath, "wx", 0o600);
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify({
        pid: process.pid,
        purpose: "complete_postgresql_migration",
        acquired_at: new Date().toISOString(),
      })}\n`,
      "utf8",
    );
    return descriptor;
  } catch (error) {
    if (error?.code === "EEXIST") {
      const lockError = new Error(
        `Operational data is busy; migration lock already exists: ${filePath}`,
      );
      lockError.code = "OPERATIONAL_MIGRATION_LOCK_BUSY";
      throw lockError;
    }
    throw error;
  }
}

function releaseLock(filePath, descriptor) {
  try {
    fs.closeSync(descriptor);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function sourceIdentity(report) {
  return {
    source_manifest_sha256: report.source_manifest_sha256,
    source_lineage_sha256: report.source_lineage_sha256,
    schema_snapshot_sha256: report.schema_validation?.snapshot_sha256,
    tool_version: report.tool_version,
    source_files: report.source_files,
    table_counts: report.table_counts,
    cross_lane_schema_reconciliation: report.cross_lane_schema_reconciliation,
  };
}

export function runCompleteLockedMigration({
  mode,
  dataDirectory,
  childEnvironment = process.env,
}) {
  const childScript = supportedModes.get(mode);
  if (!childScript || !dataDirectory) throw new Error(usage());
  const resolvedDataDirectory = path.resolve(dataDirectory);
  const acquired = [];

  try {
    for (const fileName of sourceFiles) {
      const filePath = path.join(resolvedDataDirectory, `${fileName}.lock`);
      acquired.push({ filePath, descriptor: acquireLock(filePath) });
    }

    const before = buildValidatedMigrationPlan({
      dataDirectory: resolvedDataDirectory,
      includeRows: true,
    }).report;
    if (!before.ok) {
      const error = new Error(
        `Validated migration plan failed: ${JSON.stringify(before.errors || [])}`,
      );
      error.code = "MIGRATION_PLAN_INVALID";
      error.report = before;
      throw error;
    }
    assertCompleteMigrationWritable(before);

    const result = spawnSync(
      process.execPath,
      [path.join(scriptDirectory, childScript), resolvedDataDirectory],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: childEnvironment,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const error = new Error(
        result.stderr || result.stdout || `${mode} migration failed`,
      );
      error.code = "MIGRATION_CHILD_FAILED";
      error.exitCode = result.status;
      throw error;
    }

    const after = buildValidatedMigrationPlan({
      dataDirectory: resolvedDataDirectory,
      includeRows: false,
    }).report;
    assertCompleteMigrationWritable(after);
    const beforeIdentity = sourceIdentity(before);
    const afterIdentity = sourceIdentity(after);
    if (canonicalJson(afterIdentity) !== canonicalJson(beforeIdentity)) {
      const error = new Error(
        "Migration source identity changed while operational locks were held",
      );
      error.code = "MIGRATION_SOURCE_IDENTITY_CHANGED";
      error.before = beforeIdentity;
      error.after = afterIdentity;
      throw error;
    }

    return {
      ok: true,
      mode,
      data_directory: resolvedDataDirectory,
      source_identity: beforeIdentity,
      child_stdout: result.stdout,
      locks_held: sourceFiles.length,
    };
  } finally {
    for (const lock of acquired.reverse()) {
      releaseLock(lock.filePath, lock.descriptor);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = runCompleteLockedMigration({
      mode: process.argv[2],
      dataDirectory: process.argv[3],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          code: error?.code || "COMPLETE_LOCKED_MIGRATION_FAILED",
          error: String(error?.message || error),
          ...(error?.report ? { report: error.report } : {}),
          ...(Array.isArray(error?.blockers)
            ? { write_readiness_blockers: error.blockers }
            : {}),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}
