import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import {
  assertCompleteMigrationWritable,
  buildValidatedMigrationPlan,
} from "../../../scripts/lib/postgresql-migration-plan-complete.mjs";
import {
  assertPlanIdentity,
  beginMigrationMetadata,
  completeMigrationMetadata,
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
  dataArgument || process.env.FAWRI_DATA_DIR || path.join("artifacts", "api-server", "data"),
);
const { report, snapshot } = buildValidatedMigrationPlan({
  dataDirectory,
  includeRows: true,
});

if (!report.ok) {
  process.stdout.write(`${JSON.stringify(safeReport(report), null, 2)}\n`);
  process.exitCode = 2;
} else {
  assertCompleteMigrationWritable(report);
  const { plannedTables, totalPlanned } = validatePlanForWrite(
    report,
    snapshot.value,
  );
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

  async function executePass(pass) {
    await revalidatePlan(`${pass}_before_begin`);
    await client.query("BEGIN");
    transactionOpen = true;
    const metadata = await beginMigrationMetadata(client, {
      report,
      snapshot,
      mode: "commit_test",
      databaseName,
      dataDirectory,
    });
    const insertion = await insertValidatedRows(client, report, snapshot.value);
    const reconciliation = await reconcileCommittedRows(
      client,
      report,
      snapshot.value,
      plannedTables,
    );
    assert.equal(reconciliation.reconciledRows, totalPlanned);
    await completeMigrationMetadata(client, {
      report,
      metadata,
      insertion,
      reconciliation,
    });
    await revalidatePlan(`${pass}_before_commit`);
    await client.query("COMMIT");
    transactionOpen = false;
    return { insertion, reconciliation };
  }

  try {
    const baselineCounts = await readCounts(client, plannedTables);
    assert.deepEqual(
      Object.values(baselineCounts).filter((count) => count !== 0),
      [],
      "fawri_ci target tables must be empty before the commit test",
    );

    const first = await executePass("first_pass");
    assert.equal(first.insertion.totalInserted, totalPlanned);
    const second = await executePass("idempotency_pass");
    assert.equal(second.insertion.totalInserted, 0);

    const committedCounts = await readCounts(client, plannedTables);
    for (const tableName of plannedTables) {
      assert.equal(committedCounts[tableName], report.rows[tableName].length);
    }

    await client.query("BEGIN");
    transactionOpen = true;
    await truncateTables(client, plannedTables, { includeMetadata: true });
    await client.query("COMMIT");
    transactionOpen = false;

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
          mode: "transaction_commit_reconciliation_idempotency_test",
          database: databaseName,
          data_directory_verified: dataDirectory,
          tool_version: report.tool_version,
          source_manifest_sha256: report.source_manifest_sha256,
          source_lineage_sha256: report.source_lineage_sha256,
          plan_snapshot: snapshot.name,
          plan_snapshot_sha256: snapshot.sha256,
          tables_committed: plannedTables.length,
          rows_committed: first.insertion.totalInserted,
          idempotency_second_pass_inserted: second.insertion.totalInserted,
          source_revalidated_immediately_before_each_commit: true,
          row_counts_matched: true,
          row_values_matched: true,
          migration_metadata_reconciled: true,
          cleanup_completed: true,
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
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
