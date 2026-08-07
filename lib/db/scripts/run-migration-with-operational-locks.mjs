import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildValidatedMigrationPlan,
  canonicalJson,
  repositoryRoot,
} from "../../../scripts/lib/postgresql-migration-plan-safe.mjs";
import {
  addOperationalOverlayWriteReadiness,
  assertOperationalOverlaysWritable,
} from "../../../scripts/lib/postgresql-migration-write-readiness.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const orderOperationsAuditPath = path.join(
  repositoryRoot,
  "scripts",
  "audit-order-operations.mjs",
);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceFileDescriptor(dataDirectory, fileName) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) {
    return { file: fileName, exists: false, bytes: 0, sha256: null };
  }
  const bytes = fs.readFileSync(filePath);
  return {
    file: fileName,
    exists: true,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function countStoredOrderOperations(dataDirectory) {
  const filePath = path.join(dataDirectory, "order-operations.json");
  if (!fs.existsSync(filePath)) return 0;
  const source = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const orders =
    source?.orders && typeof source.orders === "object" && !Array.isArray(source.orders)
      ? source.orders
      : {};
  let count = 0;
  for (const operations of Object.values(orders)) {
    if (!operations || typeof operations !== "object" || Array.isArray(operations)) {
      continue;
    }
    count += Object.keys(operations).length;
  }
  return count;
}

function addOrderOperationsPreflight(report, dataDirectory) {
  const result = spawnSync(
    process.execPath,
    [orderOperationsAuditPath, dataDirectory],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri",
      },
    },
  );
  if (result.error) throw result.error;
  const output = result.stdout || result.stderr;
  if (!output) {
    throw new Error("order operations audit returned no JSON output");
  }
  const audit = JSON.parse(output);
  if (result.status === 1) {
    throw new Error(audit.fatal_error || "order operations audit failed");
  }

  const descriptor = sourceFileDescriptor(dataDirectory, "order-operations.json");
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  const structuralOperationCount = countStoredOrderOperations(dataDirectory);
  const auditedOperationCount = Number(audit.summary?.operations || 0);
  const summary = {
    ...(audit.summary || {}),
    operations: Math.max(
      Number.isFinite(auditedOperationCount) ? auditedOperationCount : 0,
      structuralOperationCount,
    ),
  };
  report.source_files = {
    ...(report.source_files || {}),
    orderOperations: descriptor,
  };
  report.order_operations_migration = {
    ok: audit.ok === true,
    mode: audit.mode,
    rows_included: false,
    summary,
    source_file: descriptor,
    issues,
  };

  for (const item of issues) {
    const normalized = {
      code: String(item?.code || "ORDER_OPERATIONS_MIGRATION_ISSUE"),
      source: "order_operations_preflight",
      ...(item?.details && typeof item.details === "object" ? item.details : {}),
    };
    if (item?.severity === "error") report.errors.push(normalized);
    else report.warnings.push(normalized);
  }

  report.summary = {
    ...(report.summary || {}),
    order_operations_errors: issues.filter(
      (item) => item?.severity === "error",
    ).length,
    order_operations_warnings: issues.filter(
      (item) => item?.severity !== "error",
    ).length,
  };
  report.source_manifest_sha256 = sha256(canonicalJson(report.source_files || {}));
  report.ok = report.errors.length === 0;
  addOperationalOverlayWriteReadiness(report);
  return report;
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

    const before = addOrderOperationsPreflight(
      buildValidatedMigrationPlan({
        dataDirectory: resolvedDataDirectory,
        includeRows: true,
      }).report,
      resolvedDataDirectory,
    );
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

    const after = addOrderOperationsPreflight(
      buildValidatedMigrationPlan({
        dataDirectory: resolvedDataDirectory,
        includeRows: false,
      }).report,
      resolvedDataDirectory,
    );
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
