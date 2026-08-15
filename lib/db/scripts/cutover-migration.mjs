import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  assertCompleteMigrationWritable,
  buildValidatedMigrationPlan,
} from "../../../scripts/lib/postgresql-cross-lane-reconciliation.mjs";
import {
  assertPlanIdentity,
  prepareInsert,
  reconcileCommittedRows,
  resolveInsertOrder,
} from "./lib/migration-write.mjs";

const { Pool } = pg;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "../../..");

export const CUTOVER_MIGRATION_MODE = "write";

const metadataTables = [
  "migration_runs",
  "migration_source_files",
  "migration_source_records",
  "migration_reconciliation_results",
];

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

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function digestId(prefix, parts) {
  const digest = createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex");
  return `${prefix}:${digest.slice(0, 32)}`;
}

function currentGitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

export function migrationSourceFileStatus(descriptor) {
  return descriptor?.exists === true ? "parsed" : "missing";
}

export function requireCutoverTarget(
  connectionString,
  environment = process.env,
  actualGitSha = currentGitSha(),
) {
  assert.ok(connectionString, "DATABASE_URL is required");
  assert.equal(
    environment.FAWRI_ALLOW_POSTGRESQL_CUTOVER,
    "1",
    "FAWRI_ALLOW_POSTGRESQL_CUTOVER=1 is required",
  );

  const expectedDatabase = String(
    environment.FAWRI_MIGRATION_TARGET_DATABASE || "",
  ).trim();
  assert.ok(expectedDatabase, "FAWRI_MIGRATION_TARGET_DATABASE is required");

  const sourceEnvironment = String(
    environment.FAWRI_MIGRATION_SOURCE_ENVIRONMENT || "",
  ).trim();
  assert.ok(
    sourceEnvironment === "replit_qa" || sourceEnvironment === "production",
    "FAWRI_MIGRATION_SOURCE_ENVIRONMENT must be replit_qa or production",
  );

  const expectedGitSha = String(
    environment.FAWRI_MIGRATION_GIT_SHA || "",
  ).trim();
  assert.match(
    expectedGitSha,
    /^[0-9a-f]{40}$/i,
    "FAWRI_MIGRATION_GIT_SHA must be a full commit SHA",
  );
  assert.equal(
    actualGitSha,
    expectedGitSha,
    "cutover refused because the checked-out Git SHA does not match FAWRI_MIGRATION_GIT_SHA",
  );

  const parsed = new URL(connectionString);
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "DATABASE_URL must be PostgreSQL",
  );
  const databaseName = parsed.pathname.replace(/^\/+/, "");
  assert.ok(databaseName, "DATABASE_URL must name a PostgreSQL database");
  assert.notEqual(
    databaseName,
    "fawri_ci",
    "cutover runner refuses the disposable fawri_ci database",
  );
  assert.equal(
    databaseName,
    expectedDatabase,
    "cutover target database does not match FAWRI_MIGRATION_TARGET_DATABASE",
  );

  return {
    databaseName,
    sourceEnvironment,
    gitSha: expectedGitSha,
  };
}

function assertSnapshotTable(snapshot, tableName) {
  assert.ok(
    snapshot.tables?.[`public.${tableName}`],
    `target table ${tableName} is missing from the committed snapshot`,
  );
}

export function validateCutoverPlanForWrite(report, snapshot) {
  assert.equal(report?.ok, true, "validated migration plan contains errors");
  assert.equal(
    report?.write_readiness?.ok,
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

  for (const tableName of metadataTables) {
    assertSnapshotTable(snapshot, tableName);
  }

  const plannedTables = resolveInsertOrder(
    rowTables.filter((tableName) => !metadataTables.includes(tableName)),
    snapshot,
  );
  const totalPlanned = plannedTables.reduce(
    (sum, tableName) => sum + rows[tableName].length,
    0,
  );

  assert.ok(totalPlanned > 0, "cutover refuses an empty migration plan");
  assert.equal(
    Number(report.planned_row_count),
    totalPlanned,
    "planned_row_count must equal the number of planned target rows",
  );
  assert.equal(
    report.source_lineage?.length,
    totalPlanned,
    "every planned cutover row must have exactly one source-lineage record",
  );
  assert.match(
    String(report.source_lineage_sha256 || ""),
    /^[0-9a-f]{64}$/i,
    "source_lineage_sha256 is required for real cutover",
  );

  return { rows, plannedTables, totalPlanned };
}

function acquireSourceLocks(dataDirectory) {
  const acquired = [];
  try {
    for (const fileName of sourceFiles) {
      const filePath = path.join(dataDirectory, `${fileName}.lock`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const descriptor = fs.openSync(filePath, "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        `${JSON.stringify({
          pid: process.pid,
          purpose: "postgresql_real_cutover",
          acquired_at: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      acquired.push({ filePath, descriptor });
    }
    return acquired;
  } catch (error) {
    for (const lock of acquired.reverse()) {
      try {
        fs.closeSync(lock.descriptor);
      } finally {
        try {
          fs.unlinkSync(lock.filePath);
        } catch {}
      }
    }
    if (error?.code === "EEXIST") {
      const lockError = new Error(
        `Operational data is busy; migration lock already exists: ${error.path || "unknown"}`,
      );
      lockError.code = "OPERATIONAL_MIGRATION_LOCK_BUSY";
      throw lockError;
    }
    throw error;
  }
}

function releaseSourceLocks(acquired) {
  for (const lock of acquired.reverse()) {
    try {
      fs.closeSync(lock.descriptor);
    } finally {
      try {
        fs.unlinkSync(lock.filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
}

function loadCommittedSchemaExpectation() {
  const metaDirectory = path.join(repositoryRoot, "lib/db/drizzle/meta");
  const journal = JSON.parse(
    fs.readFileSync(path.join(metaDirectory, "_journal.json"), "utf8"),
  );
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const latest = entries.at(-1);
  assert.ok(
    latest && Number.isInteger(latest.idx),
    "committed migration journal is empty",
  );
  const snapshotName = `${String(latest.idx).padStart(4, "0")}_snapshot.json`;
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(metaDirectory, snapshotName), "utf8"),
  );
  return {
    migrationCount: entries.length,
    tables: Object.keys(snapshot.tables || {})
      .map((name) => name.replace(/^public\./, ""))
      .sort(),
  };
}

async function assertCommittedSchemaPresentAndEmpty(client) {
  const expected = loadCommittedSchemaExpectation();
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const actualTables = tables.rows.map((row) => row.table_name);
  assert.deepEqual(
    actualTables,
    expected.tables,
    "cutover target schema does not match the committed Drizzle snapshot",
  );

  const history = await client.query(
    'SELECT COUNT(*)::integer AS count FROM "drizzle"."__drizzle_migrations"',
  );
  assert.equal(
    history.rows[0]?.count,
    expected.migrationCount,
    "cutover target migration history does not match the committed Drizzle journal",
  );

  const nonEmpty = [];
  for (const tableName of actualTables) {
    const result = await client.query(
      `SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(tableName)}`,
    );
    if (result.rows[0]?.count !== 0) {
      nonEmpty.push({ table: tableName, rows: result.rows[0]?.count });
    }
  }
  assert.deepEqual(
    nonEmpty,
    [],
    "real cutover requires every public target table to be empty",
  );
}

async function insertCutoverRows(client, report, snapshot) {
  const { rows, plannedTables, totalPlanned } = validateCutoverPlanForWrite(
    report,
    snapshot,
  );
  const insertedCounts = {};

  for (const tableName of plannedTables) {
    const tableRows = rows[tableName];
    for (const row of tableRows) {
      const statement = prepareInsert(tableName, row, snapshot);
      await client.query(statement.sql, statement.values);
    }
    const count = await client.query(
      `SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(tableName)}`,
    );
    assert.equal(
      count.rows[0]?.count,
      tableRows.length,
      `${tableName} row count does not match the validated plan`,
    );
    insertedCounts[tableName] = tableRows.length;
  }

  return {
    plannedTables,
    totalPlanned,
    totalInserted: totalPlanned,
    insertedCounts,
  };
}

async function beginCutoverMetadata(
  client,
  { report, snapshot, target, dataDirectory },
) {
  const runId = digestId("migration-run", [
    CUTOVER_MIGRATION_MODE,
    target.databaseName,
    target.sourceEnvironment,
    target.gitSha,
    report.tool_version,
    report.source_manifest_sha256,
    report.source_lineage_sha256,
    snapshot.sha256,
  ]);

  await client.query(
    `INSERT INTO migration_runs (
       id, mode, status, source_environment, source_root, target_database,
       schema_snapshot, schema_snapshot_sha256, source_manifest_sha256,
       tool_version, git_commit_sha, planned_row_count, metadata, started_at
     ) VALUES ($1, $2, 'running', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())`,
    [
      runId,
      CUTOVER_MIGRATION_MODE,
      target.sourceEnvironment,
      dataDirectory,
      target.databaseName,
      snapshot.name,
      snapshot.sha256,
      report.source_manifest_sha256,
      report.tool_version,
      target.gitSha,
      report.planned_row_count,
      JSON.stringify({
        source_lineage_sha256: report.source_lineage_sha256,
        dry_run_default: false,
        real_cutover_performed: true,
        cutover_runner: "guarded_v1",
      }),
    ],
  );

  const fileIds = new Map();
  const lineageCounts = new Map();
  for (const lineage of report.source_lineage || []) {
    lineageCounts.set(
      lineage.source_key,
      (lineageCounts.get(lineage.source_key) || 0) + 1,
    );
  }

  for (const [sourceKey, descriptor] of Object.entries(
    report.source_files || {},
  )) {
    const id = digestId("migration-source-file", [runId, sourceKey]);
    fileIds.set(sourceKey, id);
    await client.query(
      `INSERT INTO migration_source_files (
         id, migration_run_id, logical_name, relative_path, exists, status,
         size_bytes, record_count, sha256, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        id,
        runId,
        sourceKey,
        descriptor.file || sourceKey,
        descriptor.exists === true,
        migrationSourceFileStatus(descriptor),
        Number(descriptor.bytes || 0),
        lineageCounts.get(sourceKey) || 0,
        descriptor.sha256 || null,
        JSON.stringify({
          deterministic_manifest_member: true,
          optional_when_missing: descriptor.exists !== true,
        }),
      ],
    );
  }

  return { runId, fileIds };
}

async function completeCutoverMetadata(
  client,
  { report, metadata, insertion, reconciliation },
) {
  for (const lineage of report.source_lineage || []) {
    const sourceFileId = metadata.fileIds.get(lineage.source_key);
    assert.ok(
      sourceFileId,
      `source lineage references unknown source key ${lineage.source_key}`,
    );
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
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reconciled', $9::jsonb)`,
      [
        id,
        metadata.runId,
        sourceFileId,
        lineage.source_collection,
        lineage.source_record_id,
        lineage.source_record_sha256,
        lineage.target_table,
        lineage.target_record_id,
        JSON.stringify({ source_key: lineage.source_key }),
      ],
    );
  }

  for (const [tableName, count] of Object.entries(
    reconciliation.tableResults,
  )) {
    const id = digestId("migration-reconciliation", [
      metadata.runId,
      "row_count_and_values",
      tableName,
    ]);
    await client.query(
      `INSERT INTO migration_reconciliation_results (
         id, migration_run_id, check_type, scope_type, scope_name,
         expected_count, actual_count, status, details
       ) VALUES ($1, $2, 'row_count_and_values', 'table', $3, $4, $4, 'matched', $5::jsonb)`,
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
       status = 'committed', inserted_row_count = $2,
       reconciled_row_count = $3, warning_count = $4,
       error_count = 0, finished_at = now()
     WHERE id = $1`,
    [
      metadata.runId,
      insertion.totalInserted,
      reconciliation.reconciledRows,
      Number(report.summary?.warnings || 0),
    ],
  );
}

function revalidateExpectedPlan(
  expectedReport,
  expectedSnapshot,
  dataDirectory,
  phase,
) {
  const current = buildValidatedMigrationPlan({
    dataDirectory,
    includeRows: true,
  });
  assertCompleteMigrationWritable(current.report);
  assertPlanIdentity(
    expectedReport,
    expectedSnapshot,
    current.report,
    current.snapshot,
    phase,
  );
}

export async function runCutover({
  connectionString = process.env.DATABASE_URL,
  dataDirectory =
    process.env.FAWRI_DATA_DIR ||
    path.join(repositoryRoot, "artifacts/api-server/data"),
  environment = process.env,
} = {}) {
  const resolvedDataDirectory = path.resolve(dataDirectory);
  const target = requireCutoverTarget(connectionString, environment);
  const locks = acquireSourceLocks(resolvedDataDirectory);
  const pool = new Pool({ connectionString, max: 1 });
  let client;
  let transactionOpen = false;

  try {
    const { report, snapshot } = buildValidatedMigrationPlan({
      dataDirectory: resolvedDataDirectory,
      includeRows: true,
    });
    assertCompleteMigrationWritable(report);
    const { plannedTables, totalPlanned } = validateCutoverPlanForWrite(
      report,
      snapshot.value,
    );

    client = await pool.connect();
    await assertCommittedSchemaPresentAndEmpty(client);

    revalidateExpectedPlan(
      report,
      snapshot,
      resolvedDataDirectory,
      "cutover_before_begin",
    );

    await client.query("BEGIN");
    transactionOpen = true;

    const metadata = await beginCutoverMetadata(client, {
      report,
      snapshot,
      target,
      dataDirectory: resolvedDataDirectory,
    });
    const insertion = await insertCutoverRows(
      client,
      report,
      snapshot.value,
    );
    const reconciliation = await reconcileCommittedRows(
      client,
      report,
      snapshot.value,
      plannedTables,
    );
    assert.equal(
      reconciliation.reconciledRows,
      totalPlanned,
      "reconciled row count does not match planned cutover rows",
    );

    await completeCutoverMetadata(client, {
      report,
      metadata,
      insertion,
      reconciliation,
    });

    revalidateExpectedPlan(
      report,
      snapshot,
      resolvedDataDirectory,
      "cutover_before_commit",
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return {
      ok: true,
      mode: "postgresql_real_cutover",
      migration_mode: CUTOVER_MIGRATION_MODE,
      database: target.databaseName,
      source_environment: target.sourceEnvironment,
      git_commit_sha: target.gitSha,
      migration_run_id: metadata.runId,
      tables_committed: plannedTables.length,
      rows_committed: insertion.totalInserted,
      rows_reconciled: reconciliation.reconciledRows,
      source_manifest_sha256: report.source_manifest_sha256,
      source_lineage_sha256: report.source_lineage_sha256,
      schema_snapshot: snapshot.name,
      schema_snapshot_sha256: snapshot.sha256,
      source_revalidated_immediately_before_commit: true,
      source_locks_held: sourceFiles.length,
      real_cutover_performed: true,
    };
  } catch (error) {
    if (transactionOpen && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
    releaseSourceLocks(locks);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await runCutover();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          code: error?.code || "POSTGRESQL_CUTOVER_FAILED",
          error: String(error?.message || error),
          ...(error?.rollbackError
            ? {
                rollback_error: String(
                  error.rollbackError?.message || error.rollbackError,
                ),
              }
            : {}),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}
