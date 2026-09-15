import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const metadataTables = [
  "migration_runs",
  "migration_source_files",
  "migration_source_records",
  "migration_reconciliation_results",
];

export function hasDefault(column) {
  return Object.prototype.hasOwnProperty.call(column, "default") || column.identity;
}

export function isMissing(value) {
  return value === null || value === undefined || value === "";
}

export function requireSafeDatabase(connectionString, flagName) {
  assert.equal(process.env[flagName], "1", `${flagName}=1 is required`);

  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "migration write tests only permit a local PostgreSQL host",
  );
  assert.equal(
    databaseName,
    "fawri_ci",
    "migration write tests only permit the fawri_ci database",
  );
  return databaseName;
}

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function safeReport(report) {
  const result = structuredClone(report);
  delete result.rows;
  delete result.source_lineage;
  if (result.schema_validation) {
    result.schema_validation.rows_removed_from_output = true;
  }
  return result;
}

export function assertPlanIdentity(
  expectedReport,
  expectedSnapshot,
  currentReport,
  currentSnapshot,
  phase,
) {
  assert.equal(currentReport.ok, true, `${phase}: revalidated plan contains errors`);
  assert.equal(
    currentReport.tool_version,
    expectedReport.tool_version,
    `${phase}: migration tool version changed`,
  );
  assert.equal(
    currentReport.source_manifest_sha256,
    expectedReport.source_manifest_sha256,
    `${phase}: source manifest changed after validation`,
  );
  assert.equal(
    currentReport.source_lineage_sha256,
    expectedReport.source_lineage_sha256,
    `${phase}: source lineage changed after validation`,
  );
  assert.equal(
    currentSnapshot.name,
    expectedSnapshot.name,
    `${phase}: Drizzle snapshot name changed after validation`,
  );
  assert.equal(
    currentSnapshot.sha256,
    expectedSnapshot.sha256,
    `${phase}: Drizzle snapshot content changed after validation`,
  );
  assert.deepEqual(
    currentReport.source_files,
    expectedReport.source_files,
    `${phase}: source file inventory changed after validation`,
  );
  assert.deepEqual(
    currentReport.table_counts,
    expectedReport.table_counts,
    `${phase}: planned table counts changed after validation`,
  );
}

function prepareValue(column, value) {
  if (
    (column.type === "json" || column.type === "jsonb") &&
    value !== null &&
    value !== undefined
  ) {
    return JSON.stringify(value);
  }
  return value;
}

export function prepareInsert(tableName, row, snapshot) {
  const table = snapshot.tables?.[`public.${tableName}`];
  assert.ok(table, `target table ${tableName} is missing from snapshot`);

  const entries = [];
  for (const [columnName, value] of Object.entries(row)) {
    const column = table.columns?.[columnName];
    assert.ok(column, `unknown target column ${tableName}.${columnName}`);
    if (value === undefined) continue;
    if (isMissing(value) && column.notNull && hasDefault(column)) continue;
    entries.push([columnName, prepareValue(column, value)]);
  }

  assert.ok(entries.length > 0, `no insertable columns for ${tableName}`);
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  return {
    sql: `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
    values: entries.map(([, value]) => value),
  };
}

export async function tableCount(client, tableName) {
  const result = await client.query(
    `SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(tableName)}`,
  );
  return result.rows[0]?.count ?? 0;
}

export async function readCounts(client, tableNames) {
  const counts = {};
  for (const tableName of tableNames) {
    counts[tableName] = await tableCount(client, tableName);
  }
  return counts;
}

export function resolveInsertOrder(tableNames, snapshot) {
  const planned = new Set(tableNames);
  const dependencies = new Map(tableNames.map((tableName) => [tableName, new Set()]));

  for (const tableName of tableNames) {
    const table = snapshot.tables?.[`public.${tableName}`];
    assert.ok(table, `target table ${tableName} is missing from snapshot`);
    for (const foreignKey of Object.values(table.foreignKeys || {})) {
      if (planned.has(foreignKey.tableTo) && foreignKey.tableTo !== tableName) {
        dependencies.get(tableName).add(foreignKey.tableTo);
      }
    }
  }

  const order = [];
  const pending = new Set(tableNames);
  while (pending.size > 0) {
    const ready = [...pending]
      .filter((tableName) =>
        [...dependencies.get(tableName)].every((dependency) => !pending.has(dependency)),
      )
      .sort();
    assert.ok(
      ready.length > 0,
      `foreign-key dependency cycle detected: ${[...pending].sort().join(", ")}`,
    );
    for (const tableName of ready) {
      pending.delete(tableName);
      order.push(tableName);
    }
  }
  return order;
}

export function validatePlanForWrite(report, snapshot) {
  assert.equal(report.ok, true, "validated migration plan contains errors");
  assert.equal(
    report.write_readiness?.ok,
    true,
    "validated migration plan is not write-ready",
  );
  const rows = report.rows && typeof report.rows === "object" ? report.rows : {};
  const rowTables = Object.keys(rows).filter(
    (tableName) => Array.isArray(rows[tableName]) && rows[tableName].length > 0,
  );
  const unknownTables = rowTables.filter(
    (tableName) => !snapshot.tables?.[`public.${tableName}`],
  );
  assert.deepEqual(
    unknownTables,
    [],
    `plan contains unknown target tables: ${unknownTables.join(", ")}`,
  );

  const plannedTables = resolveInsertOrder(
    rowTables.filter((tableName) => !metadataTables.includes(tableName)),
    snapshot,
  );
  const missingSourceFiles = Object.values(report.source_files || {})
    .filter((source) => source?.exists !== true)
    .map((source) => source?.file)
    .filter(Boolean);
  assert.deepEqual(
    missingSourceFiles,
    [],
    `migration source set is incomplete: ${missingSourceFiles.join(", ")}`,
  );

  for (const tableName of metadataTables) {
    assert.ok(
      snapshot.tables?.[`public.${tableName}`],
      `migration metadata table ${tableName} is missing from snapshot`,
    );
  }

  const totalPlanned = plannedTables.reduce(
    (sum, tableName) => sum + rows[tableName].length,
    0,
  );
  assert.ok(totalPlanned > 0, "migration write test refuses to run with an empty plan");
  assert.equal(
    report.source_lineage?.length,
    totalPlanned,
    "every planned row must have exactly one source-lineage record",
  );

  return { rows, plannedTables, totalPlanned };
}

export async function insertValidatedRows(client, report, snapshot) {
  const { rows, plannedTables, totalPlanned } = validatePlanForWrite(
    report,
    snapshot,
  );
  const insertedCounts = {};

  for (const tableName of plannedTables) {
    const tableRows = rows[tableName];
    const before = await tableCount(client, tableName);
    for (const row of tableRows) {
      const statement = prepareInsert(tableName, row, snapshot);
      await client.query(statement.sql, statement.values);
    }
    const after = await tableCount(client, tableName);
    insertedCounts[tableName] = after - before;
    assert.equal(
      after,
      tableRows.length,
      `${tableName} contains rows outside the validated plan or is missing planned rows`,
    );
  }

  const totalInserted = Object.values(insertedCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  assert.ok(
    totalInserted === 0 || totalInserted === totalPlanned,
    "migration must be either a full insert or an idempotent no-op",
  );

  return { rows, plannedTables, totalPlanned, totalInserted, insertedCounts };
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeJson(value[key])]),
    );
  }
  return value;
}

function normalizeValue(column, value) {
  if (value === null || value === undefined) return value;
  if (column.type === "json" || column.type === "jsonb") {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return normalizeJson(parsed);
  }
  if (column.type.includes("timestamp") || column.type === "date") {
    return new Date(value).toISOString();
  }
  if (/^(smallint|integer|bigint|numeric|decimal|real|double precision)/.test(column.type)) {
    return Number(value);
  }
  return value;
}

function comparableEntries(tableName, table, expectedRow) {
  return Object.entries(expectedRow).filter(([columnName, value]) => {
    const column = table.columns?.[columnName];
    assert.ok(column, `unknown target column ${tableName}.${columnName}`);
    if (value === undefined) return false;
    if (isMissing(value) && column.notNull && hasDefault(column)) return false;
    return true;
  });
}

function actualRowMatches(tableName, table, expectedRow, actualRow) {
  return comparableEntries(tableName, table, expectedRow).every(
    ([columnName, expected]) => {
      const column = table.columns[columnName];
      return isDeepStrictEqual(
        normalizeValue(column, actualRow[columnName]),
        normalizeValue(column, expected),
      );
    },
  );
}

export async function reconcileCommittedRows(client, report, snapshot, plannedTables) {
  const rows = report.rows || {};
  let reconciledRows = 0;
  const tableResults = {};

  for (const tableName of plannedTables) {
    const table = snapshot.tables?.[`public.${tableName}`];
    assert.ok(table, `target table ${tableName} is missing from snapshot`);
    const result = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    const unmatched = [...result.rows];

    for (const expectedRow of rows[tableName]) {
      const matchIndex = unmatched.findIndex((actualRow) =>
        actualRowMatches(tableName, table, expectedRow, actualRow),
      );
      const recordId = expectedRow.id || expectedRow.merchant_id || "unknown";
      assert.ok(
        matchIndex >= 0,
        `${tableName} committed row ${recordId} does not match the validated plan`,
      );
      unmatched.splice(matchIndex, 1);
      reconciledRows += 1;
    }

    assert.equal(
      unmatched.length,
      0,
      `${tableName} contains committed rows that were not in the validated plan`,
    );
    tableResults[tableName] = rows[tableName].length;
  }

  return { reconciledRows, tableResults };
}

function digestId(prefix, parts) {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${prefix}:${digest.slice(0, 32)}`;
}

function sourceFileId(runId, sourceKey) {
  return digestId("migration-source-file", [runId, sourceKey]);
}

export function migrationRunId(report, snapshot, mode) {
  return digestId("migration-run", [
    mode,
    report.tool_version,
    report.source_manifest_sha256,
    report.source_lineage_sha256,
    snapshot.sha256,
  ]);
}

export async function beginMigrationMetadata(client, {
  report,
  snapshot,
  mode,
  databaseName,
  dataDirectory,
}) {
  const runId = migrationRunId(report, snapshot, mode);
  await client.query(
    `INSERT INTO migration_runs (
       id, mode, status, source_environment, source_root, target_database,
       schema_snapshot, schema_snapshot_sha256, source_manifest_sha256,
       tool_version, git_commit_sha, planned_row_count, metadata, started_at
     ) VALUES ($1, $2, 'running', 'disposable_test', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       status = 'running', started_at = now(), finished_at = null,
       error_count = 0, warning_count = EXCLUDED.warning_count,
       metadata = EXCLUDED.metadata`,
    [
      runId,
      mode,
      dataDirectory,
      databaseName,
      snapshot.name,
      snapshot.sha256,
      report.source_manifest_sha256,
      report.tool_version,
      process.env.GITHUB_SHA || null,
      report.planned_row_count,
      JSON.stringify({
        source_lineage_sha256: report.source_lineage_sha256,
        dry_run_default: true,
        real_cutover_performed: false,
      }),
    ],
  );

  const fileIds = new Map();
  for (const [sourceKey, descriptor] of Object.entries(report.source_files || {})) {
    const id = sourceFileId(runId, sourceKey);
    fileIds.set(sourceKey, id);
    await client.query(
      `INSERT INTO migration_source_files (
         id, migration_run_id, logical_name, relative_path, exists, status,
         size_bytes, record_count, sha256, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9::jsonb)
       ON CONFLICT (migration_run_id, logical_name) DO UPDATE SET
         relative_path = EXCLUDED.relative_path,
         exists = EXCLUDED.exists,
         status = EXCLUDED.status,
         size_bytes = EXCLUDED.size_bytes,
         sha256 = EXCLUDED.sha256,
         metadata = EXCLUDED.metadata`,
      [
        id,
        runId,
        sourceKey,
        descriptor.file || sourceKey,
        descriptor.exists === true,
        descriptor.exists === true ? "parsed" : "missing",
        Number(descriptor.bytes || 0),
        descriptor.sha256 || null,
        JSON.stringify({ deterministic_manifest_member: true }),
      ],
    );
  }
  return { runId, fileIds };
}

export async function completeMigrationMetadata(client, {
  report,
  metadata,
  insertion,
  reconciliation,
}) {
  for (const lineage of report.source_lineage || []) {
    const id = digestId("migration-source-record", [
      metadata.runId,
      lineage.source_key,
      lineage.source_collection,
      lineage.source_record_id,
      lineage.target_table,
      lineage.target_record_id,
    ]);
    await client.query(
      `INSERT INTO migration_source_records (
         id, migration_run_id, source_file_id, source_collection,
         source_record_id, source_record_sha256, target_table,
         target_record_id, disposition, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reconciled', $9::jsonb)
       ON CONFLICT (migration_run_id, source_collection, source_record_id, target_table, target_record_id)
       DO UPDATE SET source_record_sha256 = EXCLUDED.source_record_sha256,
         disposition = 'reconciled', metadata = EXCLUDED.metadata`,
      [
        id,
        metadata.runId,
        metadata.fileIds.get(lineage.source_key) || null,
        lineage.source_collection,
        lineage.source_record_id,
        lineage.source_record_sha256,
        lineage.target_table,
        lineage.target_record_id,
        JSON.stringify({ source_key: lineage.source_key }),
      ],
    );
  }

  for (const [tableName, count] of Object.entries(reconciliation.tableResults)) {
    const id = digestId("migration-reconciliation", [
      metadata.runId,
      "table_row_count",
      tableName,
    ]);
    await client.query(
      `INSERT INTO migration_reconciliation_results (
         id, migration_run_id, check_type, scope_type, scope_name,
         expected_count, actual_count, status, details
       ) VALUES ($1, $2, 'row_count_and_values', 'table', $3, $4, $4, 'matched', $5::jsonb)
       ON CONFLICT (id) DO UPDATE SET expected_count = EXCLUDED.expected_count,
         actual_count = EXCLUDED.actual_count, status = 'matched', details = EXCLUDED.details`,
      [
        id,
        metadata.runId,
        tableName,
        count,
        JSON.stringify({ values_reconciled: true }),
      ],
    );
  }

  await client.query(
    `UPDATE migration_runs SET
       status = 'committed',
       inserted_row_count = $2,
       reconciled_row_count = $3,
       warning_count = $4,
       error_count = 0,
       finished_at = now()
     WHERE id = $1`,
    [
      metadata.runId,
      insertion.totalInserted,
      reconciliation.reconciledRows,
      Number(report.summary?.warnings || 0),
    ],
  );
}

export async function truncateTables(client, tableNames, { includeMetadata = false } = {}) {
  const namesToTruncate = includeMetadata
    ? [...new Set([...tableNames, ...metadataTables])]
    : tableNames;
  if (namesToTruncate.length === 0) return;
  const names = namesToTruncate.map(quoteIdentifier).join(", ");
  await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

export { metadataTables };
