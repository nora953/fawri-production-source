import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildValidatedMigrationPlan as buildBaseValidatedMigrationPlan,
  canonicalJson,
  loadLatestSnapshot,
  repositoryRoot,
  validateAgainstSnapshot,
} from "./postgresql-migration-plan-safe.mjs";

export const migrationPlanVersion = "5";

const audits = [
  {
    key: "manual_conversation_migration",
    sourceKey: "manualConversationOperations",
    source: "manual_conversation_preflight",
    fileName: "manual-conversation-operations.json",
    script: "audit-manual-conversation-operations.mjs",
    summaryPrefix: "manual_conversation",
  },
  {
    key: "order_operations_migration",
    sourceKey: "orderOperations",
    source: "order_operations_preflight",
    fileName: "order-operations.json",
    script: "audit-order-operations.mjs",
    summaryPrefix: "order_operations",
  },
  {
    key: "merchant_settings_migration",
    sourceKey: "merchantSettings",
    source: "merchant_settings_preflight",
    fileName: "merchant-settings.json",
    script: "audit-merchant-settings.mjs",
    summaryPrefix: "merchant_settings",
  },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileDescriptor(dataDirectory, fileName) {
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

function runAudit(dataDirectory, definition) {
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", definition.script), dataDirectory],
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
  const output = result.status === 1 ? result.stderr : result.stdout;
  if (!output) throw new Error(`${definition.script} returned no JSON output`);
  const report = JSON.parse(output);
  if (result.status === 1) {
    throw new Error(report.fatal_error || `${definition.script} failed`);
  }
  return report;
}

function removeIssuesFromSource(report, source) {
  report.errors = (Array.isArray(report.errors) ? report.errors : []).filter(
    (item) => item?.source !== source,
  );
  report.warnings = (Array.isArray(report.warnings) ? report.warnings : []).filter(
    (item) => item?.source !== source,
  );
}

function mergeAudit(report, dataDirectory, definition, auditReport) {
  removeIssuesFromSource(report, definition.source);
  const issues = Array.isArray(auditReport.issues) ? auditReport.issues : [];
  for (const item of issues) {
    const normalized = {
      code: String(item?.code || "OPERATIONAL_MIGRATION_ISSUE"),
      source: definition.source,
      ...(item?.details && typeof item.details === "object"
        ? item.details
        : {}),
    };
    if (item?.severity === "error") report.errors.push(normalized);
    else report.warnings.push(normalized);
  }

  const descriptor = fileDescriptor(dataDirectory, definition.fileName);
  report.source_files = {
    ...(report.source_files || {}),
    [definition.sourceKey]: descriptor,
  };
  report[definition.key] = {
    ok: auditReport.ok === true,
    mode: auditReport.mode,
    rows_included: false,
    summary: auditReport.summary || {},
    source_file: descriptor,
    issues,
  };
  report.summary = {
    ...(report.summary || {}),
    [`${definition.summaryPrefix}_errors`]: issues.filter(
      (item) => item?.severity === "error",
    ).length,
    [`${definition.summaryPrefix}_warnings`]: issues.filter(
      (item) => item?.severity !== "error",
    ).length,
  };
}

function count(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function writeBlocker(code, file, rows, counts, reason) {
  return {
    severity: "error",
    code,
    source: "migration_write_readiness",
    file,
    rows,
    counts,
    reason,
  };
}

function completeWriteBlockers(report) {
  const blockers = [];
  const manual = report.manual_conversation_migration?.summary || {};
  const manualCounts = {
    conversations: count(manual.conversations),
    inbound_messages: count(manual.inbound_messages),
    manual_messages: count(manual.manual_messages),
    requests: count(manual.requests),
  };
  const manualRows = Object.values(manualCounts).reduce(
    (total, value) => total + value,
    0,
  );
  if (manualRows > 0) {
    blockers.push(
      writeBlocker(
        "MANUAL_CONVERSATION_ROWS_NOT_MIGRATED",
        "manual-conversation-operations.json",
        manualRows,
        manualCounts,
        "the current PostgreSQL writer does not insert manual takeover messages and reply requests",
      ),
    );
  }

  const orderOperations = count(
    report.order_operations_migration?.summary?.operations,
  );
  if (orderOperations > 0) {
    blockers.push(
      writeBlocker(
        "ORDER_OPERATION_ROWS_NOT_MIGRATED",
        "order-operations.json",
        orderOperations,
        { operations: orderOperations },
        "the current PostgreSQL writer does not apply server-side order and payment operation overlays",
      ),
    );
  }

  const merchantSettings = count(
    report.merchant_settings_migration?.summary?.settings,
  );
  if (merchantSettings > 0) {
    blockers.push(
      writeBlocker(
        "MERCHANT_SETTINGS_ROWS_NOT_MIGRATED",
        "merchant-settings.json",
        merchantSettings,
        { settings: merchantSettings },
        "the current PostgreSQL writer does not insert merchant operational settings",
      ),
    );
  }
  return blockers;
}

export function assertCompleteMigrationWritable(report) {
  const blockers = completeWriteBlockers(report);
  if (blockers.length === 0) return;
  const error = new Error(
    `PostgreSQL write blocked: ${blockers.map((item) => item.code).join(", ")}`,
  );
  error.code = "OPERATIONAL_OVERLAY_WRITE_BLOCKED";
  error.blockers = blockers;
  throw error;
}

export function buildValidatedMigrationPlan(options) {
  const dataDirectory = path.resolve(options.dataDirectory);
  const result = buildBaseValidatedMigrationPlan({
    ...options,
    dataDirectory,
  });
  const report = result.report;

  for (const definition of audits) {
    mergeAudit(
      report,
      dataDirectory,
      definition,
      runAudit(dataDirectory, definition),
    );
  }

  const blockers = completeWriteBlockers(report);
  report.write_readiness = {
    ok: blockers.length === 0,
    operational_overlays_supported: false,
    blockers,
  };
  report.summary = {
    ...(report.summary || {}),
    write_readiness_errors: blockers.length,
    errors: report.errors.length,
    warnings: report.warnings.length,
  };
  report.ok = report.errors.length === 0;
  report.tool_version = migrationPlanVersion;
  report.source_manifest_sha256 = sha256(
    canonicalJson(report.source_files || {}),
  );
  return { report, snapshot: result.snapshot };
}

export {
  canonicalJson,
  loadLatestSnapshot,
  repositoryRoot,
  validateAgainstSnapshot,
};
