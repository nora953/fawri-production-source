import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import { buildValidatedMigrationPlan } from "../../../scripts/lib/postgresql-migration-plan.mjs";
import {
  insertValidatedRows,
  readCounts,
  reconcileCommittedRows,
  requireSafeDatabase,
  safeReport,
  truncateTables,
  validatePlanForWrite,
} from "./lib/migration-write.mjs";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
const databaseName = requireSafeDatabase(
  connectionString,
  "FAWRI_ALLOW_MIGRATION_COMMIT_TEST",
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
  let commitCompleted = false;

  async function cleanCommittedRows() {
    await client.query("BEGIN");
    transactionOpen = true;
    await truncateTables(client, plannedTables);
    await client.query("COMMIT");
    transactionOpen = false;
  }

  try {
    const baselineCounts = await readCounts(client, plannedTables);
    assert.deepEqual(
      Object.values(baselineCounts).filter((count) => count !== 0),
      [],
      "fawri_ci target tables must be empty before the commit test",
    );

    await client.query("BEGIN");
    transactionOpen = true;
    const insertion = await insertValidatedRows(client, report, snapshot.value);
    assert.equal(insertion.totalInserted, totalPlanned);
    await client.query("COMMIT");
    transactionOpen = false;
    commitCompleted = true;

    const committedCounts = await readCounts(client, plannedTables);
    for (const tableName of plannedTables) {
      assert.equal(
        committedCounts[tableName],
        report.rows[tableName].length,
        `${tableName} committed row count does not match the validated plan`,
      );
    }

    const reconciledRows = await reconcileCommittedRows(
      client,
      report,
      snapshot.value,
      plannedTables,
    );
    assert.equal(
      reconciledRows,
      totalPlanned,
      "committed row reconciliation total does not match the validated plan",
    );

    await cleanCommittedRows();
    const finalCounts = await readCounts(client, plannedTables);
    assert.deepEqual(
      Object.values(finalCounts).filter((count) => count !== 0),
      [],
      "commit test cleanup did not empty all target tables",
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "transaction_commit_reconciliation_test",
          database: databaseName,
          data_directory_verified: dataDirectory,
          plan_snapshot: snapshot.name,
          tables_committed: plannedTables.length,
          rows_committed: insertion.totalInserted,
          row_counts_matched: true,
          row_values_matched: true,
          reconciled_rows: reconciledRows,
          commit_completed: true,
          cleanup_completed: true,
          writes_persisted_after_cleanup: false,
          database_restored_to_empty: true,
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

    if (commitCompleted) {
      try {
        await cleanCommittedRows();
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
