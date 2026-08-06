import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

export const insertOrder = [
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

export function hasDefault(column) {
  return Object.prototype.hasOwnProperty.call(column, "default") || column.identity;
}

export function isMissing(value) {
  return value === null || value === undefined || value === "";
}

export function requireSafeDatabase(connectionString, flagName) {
  assert.equal(
    process.env[flagName],
    "1",
    `${flagName}=1 is required`,
  );

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
  if (result.schema_validation) {
    result.schema_validation.rows_removed_from_output = true;
  }
  return result;
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
    sql: `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${placeholders})`,
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

export function validatePlanForWrite(report) {
  assert.equal(report.ok, true, "validated migration plan contains errors");
  const rows = report.rows && typeof report.rows === "object" ? report.rows : {};
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

  const missingSourceFiles = Object.values(report.source_files || {})
    .filter((source) => source?.exists !== true)
    .map((source) => source?.file)
    .filter(Boolean);
  assert.deepEqual(
    missingSourceFiles,
    [],
    `migration fixture is incomplete: ${missingSourceFiles.join(", ")}`,
  );

  const totalPlanned = Object.values(report.table_counts || {}).reduce(
    (sum, count) => sum + Number(count || 0),
    0,
  );
  assert.ok(totalPlanned > 0, "migration write test refuses to run with an empty plan");

  return { rows, plannedTables, totalPlanned };
}

export async function insertValidatedRows(client, report, snapshot) {
  const { rows, plannedTables, totalPlanned } = validatePlanForWrite(report);
  const insertedCounts = {};

  for (const tableName of plannedTables) {
    const tableRows = rows[tableName];
    insertedCounts[tableName] = 0;
    for (const row of tableRows) {
      const statement = prepareInsert(tableName, row, snapshot);
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

  const totalInserted = Object.values(insertedCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  assert.equal(totalInserted, totalPlanned, "inserted row total does not match plan");

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

  for (const tableName of plannedTables) {
    const table = snapshot.tables?.[`public.${tableName}`];
    assert.ok(table, `target table ${tableName} is missing from snapshot`);
    const result = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    const unmatched = [...result.rows];

    for (const expectedRow of rows[tableName]) {
      const matchIndex = unmatched.findIndex((actualRow) =>
        actualRowMatches(tableName, table, expectedRow, actualRow),
      );

      const recordId = expectedRow.id || expectedRow.account_id || "unknown";
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
  }

  return reconciledRows;
}

export async function truncateTables(client, tableNames) {
  if (tableNames.length === 0) return;
  const names = tableNames.map(quoteIdentifier).join(", ");
  await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
