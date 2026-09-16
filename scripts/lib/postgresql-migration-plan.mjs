import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTransitionalMigrationReadiness } from "./transitional-migration-readiness.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(moduleDirectory, "../..");
const plannerPath = path.join(
  repositoryRoot,
  "scripts",
  "plan-postgresql-migration.mjs",
);
const manualConversationAuditPath = path.join(
  repositoryRoot,
  "scripts",
  "audit-manual-conversation-operations.mjs",
);
const metaDirectory = path.join(repositoryRoot, "lib", "db", "drizzle", "meta");
export const migrationPlanVersion = "3";

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
  return sha256Buffer(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function loadLatestSnapshot() {
  const journal = JSON.parse(
    fs.readFileSync(path.join(metaDirectory, "_journal.json"), "utf8"),
  );
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const latest = entries.at(-1);
  if (!latest || !Number.isInteger(latest.idx)) {
    throw new Error("Drizzle migration journal has no valid entries");
  }

  const snapshotName = `${String(latest.idx).padStart(4, "0")}_snapshot.json`;
  const snapshotPath = path.join(metaDirectory, snapshotName);
  const rawSnapshot = fs.readFileSync(snapshotPath, "utf8");
  return {
    name: snapshotName,
    sha256: sha256Text(rawSnapshot),
    value: JSON.parse(rawSnapshot),
  };
}

function runInstrumentedPlanner(dataDirectory) {
  const source = fs.readFileSync(plannerPath, "utf8");
  const marker = "    table_counts: tableCounts,";
  if (!source.includes(marker)) {
    throw new Error("migration planner output marker was not found");
  }

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fawri-migration-plan-runner-"),
  );
  const instrumentedPath = path.join(
    temporaryDirectory,
    "plan-postgresql-migration.instrumented.mjs",
  );
  fs.writeFileSync(
    instrumentedPath,
    source.replace(marker, `    rows,\n${marker}`),
    "utf8",
  );

  try {
    const result = spawnSync(process.execPath, [instrumentedPath, dataDirectory], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri",
      },
    });
    if (result.error) throw result.error;
    return result;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function runManualConversationAudit(dataDirectory) {
  const result = spawnSync(
    process.execPath,
    [manualConversationAuditPath, dataDirectory],
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
  if (result.status === 1) {
    throw new Error(
      result.stderr || result.stdout || "manual conversation audit failed",
    );
  }
  if (!result.stdout) {
    throw new Error("manual conversation audit returned no JSON output");
  }
  return JSON.parse(result.stdout);
}

function fileDescriptor(dataDirectory, fileName) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) {
    return { file: fileName, exists: false, bytes: 0, sha256: null };
  }
  const content = fs.readFileSync(filePath);
  return {
    file: fileName,
    exists: true,
    bytes: content.length,
    sha256: sha256Buffer(content),
  };
}

function normalizeIssue(issue, source, fallbackCode) {
  const details =
    issue?.details && typeof issue.details === "object" ? issue.details : {};
  return {
    code: String(issue?.code || fallbackCode),
    source,
    ...details,
  };
}

function mergeIssues(report, issues, source, fallbackCode) {
  const errors = Array.isArray(report.errors) ? report.errors : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  for (const item of issues) {
    const normalized = normalizeIssue(item, source, fallbackCode);
    if (item?.severity === "error") errors.push(normalized);
    else warnings.push(normalized);
  }
  report.errors = errors;
  report.warnings = warnings;
}

function mergeTransitionalReadiness(report, transitionalReport) {
  const issues = Array.isArray(transitionalReport.issues)
    ? transitionalReport.issues
    : [];
  mergeIssues(
    report,
    issues,
    "transitional_migration_preflight",
    "TRANSITIONAL_MIGRATION_ISSUE",
  );

  report.source_files = {
    ...(report.source_files || {}),
    ...Object.fromEntries(
      Object.entries(transitionalReport.source_files || {}).map(
        ([key, descriptor]) => [`transitional_${key}`, descriptor],
      ),
    ),
  };
  report.transitional_migration = {
    ok: transitionalReport.ok === true,
    mode: transitionalReport.mode,
    rows_included: false,
    summary: transitionalReport.summary || {},
    source_files: transitionalReport.source_files || {},
    issues,
  };
  report.summary = {
    ...(report.summary || {}),
    transitional_errors: issues.filter((item) => item?.severity === "error")
      .length,
    transitional_warnings: issues.filter(
      (item) => item?.severity !== "error",
    ).length,
  };
}

function mergeManualConversationReadiness(
  report,
  manualReport,
  dataDirectory,
) {
  const issues = Array.isArray(manualReport.issues) ? manualReport.issues : [];
  mergeIssues(
    report,
    issues,
    "manual_conversation_preflight",
    "MANUAL_CONVERSATION_MIGRATION_ISSUE",
  );
  const source = fileDescriptor(
    dataDirectory,
    "manual-conversation-operations.json",
  );
  report.source_files = {
    ...(report.source_files || {}),
    manualConversationOperations: source,
  };
  report.manual_conversation_migration = {
    ok: manualReport.ok === true,
    mode: manualReport.mode,
    rows_included: false,
    summary: manualReport.summary || {},
    source_file: source,
    issues,
  };
  report.summary = {
    ...(report.summary || {}),
    manual_conversation_errors: issues.filter(
      (item) => item?.severity === "error",
    ).length,
    manual_conversation_warnings: issues.filter(
      (item) => item?.severity !== "error",
    ).length,
  };
}

export function hasDefault(column) {
  return Object.prototype.hasOwnProperty.call(column, "default") || column.identity;
}

export function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function compositeKey(row, columns) {
  return JSON.stringify(columns.map((column) => row[column]));
}

export function validateAgainstSnapshot(
  report,
  snapshotDescriptor,
  { removeRows = true } = {},
) {
  const snapshot = snapshotDescriptor?.value || snapshotDescriptor;
  const snapshotName = snapshotDescriptor?.name || null;
  const snapshotSha256 = snapshotDescriptor?.sha256 || null;
  const errors = Array.isArray(report.errors) ? report.errors : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const rows = report.rows && typeof report.rows === "object" ? report.rows : {};
  let validatedRows = 0;
  let defaultedNullValues = 0;

  for (const [tableName, tableRowsValue] of Object.entries(rows)) {
    const tableRows = Array.isArray(tableRowsValue) ? tableRowsValue : [];
    const table = snapshot.tables?.[`public.${tableName}`];
    if (!table) {
      errors.push({ code: "TARGET_TABLE_NOT_FOUND", table: tableName });
      continue;
    }

    const columns = table.columns || {};
    const knownColumns = new Set(Object.keys(columns));
    const primaryKeyColumns = Object.values(columns)
      .filter((column) => column.primaryKey === true)
      .map((column) => column.name);
    const seenPrimaryKeys = new Set();

    tableRows.forEach((row, index) => {
      validatedRows += 1;
      const recordId = row?.id || row?.account_id || `row-${index + 1}`;

      for (const key of Object.keys(row || {})) {
        if (!knownColumns.has(key)) {
          errors.push({
            code: "UNKNOWN_TARGET_COLUMN",
            table: tableName,
            record_id: recordId,
            column: key,
          });
        }
      }

      for (const column of Object.values(columns)) {
        const supplied = Object.prototype.hasOwnProperty.call(row, column.name);
        const value = supplied ? row[column.name] : undefined;

        if (supplied && isMissing(value) && column.notNull && hasDefault(column)) {
          defaultedNullValues += 1;
          continue;
        }

        if (
          column.notNull &&
          !hasDefault(column) &&
          (!supplied || isMissing(value))
        ) {
          errors.push({
            code: "REQUIRED_TARGET_VALUE_MISSING",
            table: tableName,
            record_id: recordId,
            column: column.name,
          });
          continue;
        }

        const enumDefinition = snapshot.enums?.[`public.${column.type}`];
        if (
          supplied &&
          !isMissing(value) &&
          enumDefinition &&
          !enumDefinition.values.includes(value)
        ) {
          errors.push({
            code: "INVALID_TARGET_ENUM_VALUE",
            table: tableName,
            record_id: recordId,
            column: column.name,
            value,
            allowed_values: enumDefinition.values,
          });
        }
      }

      if (
        primaryKeyColumns.length > 0 &&
        primaryKeyColumns.every((column) => !isMissing(row[column]))
      ) {
        const key = compositeKey(row, primaryKeyColumns);
        if (seenPrimaryKeys.has(key)) {
          errors.push({
            code: "DUPLICATE_TARGET_PRIMARY_KEY",
            table: tableName,
            record_id: recordId,
            columns: primaryKeyColumns,
          });
        }
        seenPrimaryKeys.add(key);
      }
    });
  }

  const targetKeys = new Map();
  for (const [tableName, tableRowsValue] of Object.entries(rows)) {
    const tableRows = Array.isArray(tableRowsValue) ? tableRowsValue : [];
    const table = snapshot.tables?.[`public.${tableName}`];
    if (!table) continue;

    for (const foreignKey of Object.values(table.foreignKeys || {})) {
      const targetTableName = foreignKey.tableTo;
      const targetRows = Array.isArray(rows[targetTableName])
        ? rows[targetTableName]
        : [];
      const cacheKey = `${targetTableName}:${foreignKey.columnsTo.join(",")}`;
      if (!targetKeys.has(cacheKey)) {
        targetKeys.set(
          cacheKey,
          new Set(
            targetRows
              .filter((row) =>
                foreignKey.columnsTo.every((column) => !isMissing(row[column])),
              )
              .map((row) => compositeKey(row, foreignKey.columnsTo)),
          ),
        );
      }

      tableRows.forEach((row, index) => {
        const values = foreignKey.columnsFrom.map((column) => row[column]);

        // PostgreSQL composite foreign keys use MATCH SIMPLE by default:
        // if any referencing column is null, the FK check is not enforced.
        // Required/not-null columns are still validated above.
        if (values.some(isMissing)) return;

        const recordId = row?.id || row?.account_id || `row-${index + 1}`;
        const targetSet = targetKeys.get(cacheKey);
        if (!targetSet.has(compositeKey(row, foreignKey.columnsFrom))) {
          errors.push({
            code: "ORPHAN_TARGET_REFERENCE",
            table: tableName,
            record_id: recordId,
            foreign_key: foreignKey.name,
            target_table: targetTableName,
            columns: foreignKey.columnsFrom,
          });
        }
      });
    }
  }

  if (defaultedNullValues > 0) {
    warnings.push({
      code: "NULL_VALUES_WILL_USE_DATABASE_DEFAULTS",
      count: defaultedNullValues,
    });
  }

  report.errors = errors;
  report.warnings = warnings;
  report.ok = errors.length === 0;
  report.summary = {
    ...(report.summary || {}),
    errors: errors.length,
    warnings: warnings.length,
  };
  report.schema_validation = {
    snapshot: snapshotName,
    snapshot_sha256: snapshotSha256,
    validated_rows: validatedRows,
    database_connection_used: false,
    rows_removed_from_output: removeRows,
  };
  if (removeRows) delete report.rows;
  return report;
}

export function buildValidatedMigrationPlan({
  dataDirectory,
  includeRows = false,
}) {
  const resolvedDataDirectory = path.resolve(dataDirectory);
  const result = runInstrumentedPlanner(resolvedDataDirectory);
  if (result.status === 1) {
    throw new Error(result.stderr || result.stdout || "migration planner failed");
  }
  if (!result.stdout) {
    throw new Error("migration planner returned no JSON output");
  }

  const report = JSON.parse(result.stdout);
  const { report: transitionalReport } = buildTransitionalMigrationReadiness({
    dataDirectory: resolvedDataDirectory,
  });
  mergeTransitionalReadiness(report, transitionalReport);
  const manualConversationReport = runManualConversationAudit(
    resolvedDataDirectory,
  );
  mergeManualConversationReadiness(
    report,
    manualConversationReport,
    resolvedDataDirectory,
  );
  report.tool_version = migrationPlanVersion;
  report.source_manifest_sha256 = sha256Text(
    canonicalJson(report.source_files || {}),
  );
  const snapshot = loadLatestSnapshot();
  validateAgainstSnapshot(report, snapshot, {
    removeRows: !includeRows,
  });
  return { report, snapshot };
}
