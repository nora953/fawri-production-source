import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(moduleDirectory, "../..");
const plannerPath = path.join(
  repositoryRoot,
  "scripts",
  "plan-postgresql-migration.mjs",
);
const metaDirectory = path.join(repositoryRoot, "lib", "db", "drizzle", "meta");
export const migrationPlanVersion = "1";

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
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
        if (values.every(isMissing)) return;

        const recordId = row?.id || row?.account_id || `row-${index + 1}`;
        if (values.some(isMissing)) {
          errors.push({
            code: "INCOMPLETE_TARGET_REFERENCE",
            table: tableName,
            record_id: recordId,
            foreign_key: foreignKey.name,
            columns: foreignKey.columnsFrom,
          });
          return;
        }

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
