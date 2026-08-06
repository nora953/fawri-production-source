import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import {
  buildValidatedMigrationPlan,
  hasDefault,
  isMissing,
} from "../../../scripts/lib/postgresql-migration-plan.mjs";

const { Pool } = pg;
const insertOrder = [
  "accounts",
  "merchants",
  "admin_profiles",
  "admin_permissions",
  "subscriptions",
  "products",
  "merchant_channels",
  "conversations",
  "orders",
  "order_drafts",
  "saved_answers",
  "training_requests",
  "learned_answers",
  "support_tickets",
  "support_messages",
  "support_inspection_requests",
  "support_preview_sessions",
  "emergency_authorizations",
  "emergency_access_requests",
  "emergency_owner_alerts",
  "emergency_merchant_notices",
  "audit_events",
];

function requireSafeDatabase(connectionString) {
  assert.equal(
    process.env.FAWRI_ALLOW_MIGRATION_ROLLBACK_TEST,
    "1",
    "FAWRI_ALLOW_MIGRATION_ROLLBACK_TEST=1 is required",
  );

  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "transactional migration test only permits a local PostgreSQL host",
  );
  assert.equal(
    databaseName,
    "fawri_ci",
    "transactional migration test only permits the fawri_ci database",
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function safeReport(report) {
  const result = structuredClone(report);
  delete result.rows;
  if (result.schema_validation) {
    result.schema_validation.rows_removed_from_output = true;
  }
  return result;
}

function prepareInsert(tableName, row, snapshot) {
  const table = snapshot.tables?.[`public.${tableName}`];
  assert.ok(table, `target table ${tableName} is missing from snapshot`);

  const entries = [];
  for (const [columnName, value] of Object.entries(row)) {
    const column = table.columns?.[columnName];
    assert.ok(column, `unknown target column ${tableName}.${columnName}`);
    if (value === undefined) continue;
    if (isMissing(value) && column.notNull && hasDefault(column)) continue;
    entries.push([columnName, value]);
  }

  assert.ok(entries.length > 0, `no insertable columns for ${tableName}`);
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  return {
    sql: `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${placeholders})`,
    values: entries.map(([, value]) => value),
  };
}

async function tableCount(client, tableName) {
  const result = await client.query(
    `SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(tableName)}`,
  );
  return result.rows[0]?.count ?? 0;
}

async function readCounts(client, tableNames) {
  const counts = {};
  for (const tableName of tableNames) {
    counts[tableName] = await tableCount(client, tableName);
  }
  return counts;
}

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
requireSafeDatabase(connectionString);

const dataDirectory = path.resolve(
  process.argv[2] ||
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
  const rows = report.rows || {};
  const plannedTables = insertOrder.filter((tableName) =>
    Array.isArray(rows[tableName]),
  );
  const unrecognizedTables = Object.keys(rows).filter(
    (tableName) => !insertOrder.includes(tableName),
  );
  assert.deepEqual(
    unrecognizedTables,
    [],
    `insert order is missing tables: ${unrecognizedTables.join(", ")}`,
  );

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    const baselineCounts = await readCounts(client, plannedTables);
    assert.deepEqual(
      Object.values(baselineCounts).filter((count) => count !== 0),
      [],
      "fawri_ci target tables must be empty before the rollback test",
    );

    await client.query("BEGIN");
    transactionOpen = true;

    const insertedCounts = {};
    for (const tableName of plannedTables) {
      const tableRows = rows[tableName];
      insertedCounts[tableName] = 0;
      for (const row of tableRows) {
        const statement = prepareInsert(tableName, row, snapshot.value);
        await client.query(statement.sql, statement.values);
        insertedCounts[tableName] += 1;
      }

      const actualCount = await tableCount(client, tableName);
      assert.equal(
        actualCount,
        tableRows.length,
        `${tableName} row count does not match the validated plan`,
      );
    }

    const totalPlanned = Object.values(report.table_counts || {}).reduce(
      (sum, count) => sum + Number(count || 0),
      0,
    );
    const totalInserted = Object.values(insertedCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    assert.equal(totalInserted, totalPlanned, "inserted row total does not match plan");

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
          database: "fawri_ci",
          plan_snapshot: snapshot.name,
          tables_tested: plannedTables.length,
          rows_inserted_inside_transaction: totalInserted,
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
