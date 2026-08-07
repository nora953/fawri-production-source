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
  metadataTables,
  readCounts,
  reconcileCommittedRows,
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

  try {
    const baselineCounts = await readCounts(client, [
      ...plannedTables,
      ...metadataTables,
    ]);
    assert.deepEqual(
      Object.values(baselineCounts).filter((count) => count !== 0),
      [],
      "fawri_ci target and migration metadata tables must be empty before rollback test",
    );

    const before = buildValidatedMigrationPlan({
      dataDirectory,
      includeRows: true,
    });
    assertPlanIdentity(report, snapshot, before.report, before.snapshot, "before_write");

    await client.query("BEGIN");
    transactionOpen = true;
    const metadata = await beginMigrationMetadata(client, {
      report,
      snapshot,
      mode: "rollback_test",
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
    await completeMigrationMetadata(client, {
      report,
      metadata,
      insertion,
      reconciliation,
    });
    assert.equal(reconciliation.reconciledRows, totalPlanned);

    const beforeRollback = buildValidatedMigrationPlan({
      dataDirectory,
      includeRows: true,
    });
    assertPlanIdentity(
      report,
      snapshot,
      beforeRollback.report,
      beforeRollback.snapshot,
      "before_rollback",
    );
    await client.query("ROLLBACK");
    transactionOpen = false;

    const finalCounts = await readCounts(client, [
      ...plannedTables,
      ...metadataTables,
    ]);
    assert.deepEqual(finalCounts, baselineCounts);

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "transaction_rollback_with_metadata_test",
          database: databaseName,
          data_directory_verified: dataDirectory,
          tool_version: report.tool_version,
          source_manifest_sha256: report.source_manifest_sha256,
          source_lineage_sha256: report.source_lineage_sha256,
          plan_snapshot: snapshot.name,
          rows_inserted_inside_transaction: insertion.totalInserted,
          reconciled_rows_inside_transaction: reconciliation.reconciledRows,
          source_revalidated_before_rollback: true,
          rollback_completed: true,
          application_writes_persisted: false,
          metadata_writes_persisted: false,
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
