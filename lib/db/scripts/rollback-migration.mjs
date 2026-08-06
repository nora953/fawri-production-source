import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import { buildValidatedMigrationPlan } from "../../../scripts/lib/postgresql-migration-plan.mjs";
import {
  assertPlanIdentity,
  insertValidatedRows,
  readCounts,
  requireSafeDatabase,
  safeReport,
  validatePlanForWrite,
} from "./lib/migration-write.mjs";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
const databaseName = requireSafeDatabase(
  connectionString,
  "FAWRI_ALLOW_MIGRATION_ROLLBACK_TEST",
);

const dataArgument = process.argv.slice(2).find((argument) => argument !== "--");
const dataDirectory = path.resolve(
  dataArgument ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);
const { report, snapshot } = buildValidatedMigrationPlan({
  dataDirectory,
  includeRows: true,
});

if (!report.ok) {
  process.stdout.write(`${JSON.stringify(safeReport(report), null, 2)}\n`);
  process.exitCode = 2;
} else {
  const { plannedTables, totalPlanned } = validatePlanForWrite(report);
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  let transactionOpen = false;

  async function revalidatePlan(phase) {
    const current = buildValidatedMigrationPlan({
      dataDirectory,
      includeRows: true,
    });
    assertPlanIdentity(report, snapshot, current.report, current.snapshot, phase);
  }

  try {
    const baselineCounts = await readCounts(client, plannedTables);
    assert.deepEqual(
      Object.values(baselineCounts).filter((count) => count !== 0),
      [],
      "fawri_ci target tables must be empty before the rollback test",
    );

    await revalidatePlan("before_write");
    await client.query("BEGIN");
    transactionOpen = true;
    const insertion = await insertValidatedRows(client, report, snapshot.value);
    assert.equal(insertion.totalInserted, totalPlanned);

    await revalidatePlan("before_rollback");
    await client.query("ROLLBACK");
    transactionOpen = false;

    const finalCounts = await readCounts(client, plannedTables);
    assert.deepEqual(
      finalCounts,
      baselineCounts,
      "rollback did not restore the database to its original state",
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "transaction_rollback_test",
          database: databaseName,
          data_directory_verified: dataDirectory,
          tool_version: report.tool_version,
          source_manifest_sha256: report.source_manifest_sha256,
          plan_snapshot: snapshot.name,
          plan_snapshot_sha256: snapshot.sha256,
          tables_tested: plannedTables.length,
          rows_inserted_inside_transaction: insertion.totalInserted,
          source_revalidated_before_write: true,
          source_revalidated_before_rollback: true,
          row_counts_matched: true,
          rollback_completed: true,
          writes_persisted: false,
          database_restored_to_baseline: true,
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
        transactionOpen = false;
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
