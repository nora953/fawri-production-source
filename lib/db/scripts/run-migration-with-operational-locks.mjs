import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildValidatedMigrationPlan,
  repositoryRoot,
} from "../../../scripts/lib/postgresql-migration-plan-safe.mjs";
import { assertOperationalOverlaysWritable } from "../../../scripts/lib/postgresql-migration-write-readiness.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const supportedModes = new Map([
  ["rollback", "rollback-migration.mjs"],
  ["commit", "commit-migration.mjs"],
]);
const lockFiles = [
  "manual-conversation-operations.json.lock",
  "order-operations.json.lock",
];

function usage() {
  return "Usage: node run-migration-with-operational-locks.mjs <rollback|commit> <data-directory>";
}

function acquireLock(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    const descriptor = fs.openSync(filePath, "wx", 0o600);
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify({
        pid: process.pid,
        purpose: "postgresql_migration",
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
    schema_snapshot_sha256: report.schema_validation?.snapshot_sha256,
    tool_version: report.tool_version,
    write_readiness: report.write_readiness,
  };
}

export function runLockedMigration({
  mode,
  dataDirectory,
  childEnvironment = process.env,
}) {
  const childScript = supportedModes.get(mode);
  if (!childScript) throw new Error(usage());
  const resolvedDataDirectory = path.resolve(dataDirectory || "");
  if (!dataDirectory) throw new Error(usage());

  const acquired = [];
  try {
    for (const fileName of lockFiles) {
      const filePath = path.join(resolvedDataDirectory, fileName);
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
    assertOperationalOverlaysWritable(before);

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
    assertOperationalOverlaysWritable(after);
    const beforeIdentity = sourceIdentity(before);
    const afterIdentity = sourceIdentity(after);
    if (JSON.stringify(afterIdentity) !== JSON.stringify(beforeIdentity)) {
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
    };
  } finally {
    for (const lock of acquired.reverse()) {
      releaseLock(lock.filePath, lock.descriptor);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = runLockedMigration({
      mode: process.argv[2],
      dataDirectory: process.argv[3],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          code: error?.code || "LOCKED_MIGRATION_FAILED",
          error: String(error?.message || error),
          ...(error?.report ? { report: error.report } : {}),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}
