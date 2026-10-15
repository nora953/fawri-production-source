import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const APPLY = process.argv.includes('--apply');
const CHECK = process.argv.includes('--check') || !APPLY;
assert.ok(!(APPLY && process.argv.includes('--check')), 'choose either --check or --apply');

if (APPLY) {
  assert.equal(
    process.env.FAWRI_ALLOW_CASHIER_HISTORY_RECONCILIATION,
    '1',
    'FAWRI_ALLOW_CASHIER_HISTORY_RECONCILIATION=1 is required for --apply',
  );
}

const connectionString = String(process.env.DATABASE_URL || '').trim();
assert.ok(connectionString, 'DATABASE_URL is required');
const expectedDatabase = String(process.env.FAWRI_EXPECT_DATABASE || '').trim();
assert.ok(expectedDatabase, 'FAWRI_EXPECT_DATABASE is required');

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(currentDirectory, '../drizzle');
const journal = JSON.parse(
  fs.readFileSync(path.join(migrationsRoot, 'meta', '_journal.json'), 'utf8'),
);
const entries = (Array.isArray(journal.entries) ? journal.entries : []).map((entry) => ({
  idx: Number(entry.idx),
  tag: String(entry.tag || ''),
  when: Number(entry.when),
}));

const EXPECTED_PREFIX_END_TAG = '0012_catalog_variant_signature_guard';
const RECONCILE_TAGS = [
  '0013_cashier_staff_station_authority',
  '0014_cashier_operation_attribution',
];
const NEXT_TAG = '0015_cashier_discount_override_authority';

const prefixIndex = entries.findIndex((entry) => entry.tag === EXPECTED_PREFIX_END_TAG);
assert.equal(prefixIndex, 12, `${EXPECTED_PREFIX_END_TAG} must remain migration index 12`);
const reconcileEntries = RECONCILE_TAGS.map((tag, offset) => {
  const index = prefixIndex + 1 + offset;
  assert.equal(entries[index]?.tag, tag, `${tag} must remain migration index ${index}`);
  assert.equal(entries[index]?.idx, index, `${tag} journal index changed`);
  return entries[index];
});
assert.equal(entries[prefixIndex + 3]?.tag, NEXT_TAG, `${NEXT_TAG} must immediately follow 0014`);

function readMigration(tag) {
  const filePath = path.join(migrationsRoot, `${tag}.sql`);
  assert.ok(fs.existsSync(filePath), `${tag}.sql is missing`);
  const sql = fs.readFileSync(filePath, 'utf8');
  const hash = crypto.createHash('sha256').update(sql).digest('hex');
  return { tag, filePath, sql, hash };
}

const migrations = RECONCILE_TAGS.map(readMigration);

function extractMigrationObjects(sql) {
  const tables = new Map();
  const tableRegex = /CREATE TABLE "([^"]+)" \(\n([\s\S]*?)\n\);/g;
  for (const match of sql.matchAll(tableRegex)) {
    const [, tableName, body] = match;
    const columns = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      const column = /^"([^"]+)"\s+/.exec(line)?.[1];
      if (column) columns.push(column);
    }
    tables.set(tableName, columns);
  }

  const constraints = [...sql.matchAll(/CONSTRAINT "([^"]+)"/g)].map((match) => match[1]);
  const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map((match) => match[1]);
  return { tables, constraints, indexes };
}

const expectedObjects = migrations.reduce(
  (acc, migration) => {
    const objects = extractMigrationObjects(migration.sql);
    for (const [table, columns] of objects.tables) {
      assert.ok(!acc.tables.has(table), `duplicate reviewed cashier table ${table}`);
      acc.tables.set(table, columns);
    }
    acc.constraints.push(...objects.constraints);
    acc.indexes.push(...objects.indexes);
    return acc;
  },
  { tables: new Map(), constraints: [], indexes: [] },
);

assert.equal(expectedObjects.tables.size, 8, 'reviewed 0013/0014 must create exactly 8 cashier authority tables');
assert.equal(new Set(expectedObjects.constraints).size, expectedObjects.constraints.length, 'reviewed constraints are duplicated');
assert.equal(new Set(expectedObjects.indexes).size, expectedObjects.indexes.length, 'reviewed indexes are duplicated');

async function readHistory(client) {
  const table = (
    await client.query("SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table")
  ).rows[0]?.migration_table;
  assert.ok(table, 'drizzle migration history table is missing');
  return (
    await client.query(`
      SELECT id, hash, created_at::text AS created_at
      FROM "drizzle"."__drizzle_migrations"
      ORDER BY created_at ASC, id ASC
    `)
  ).rows.map((row) => ({
    id: Number(row.id),
    hash: String(row.hash || ''),
    created_at: Number(row.created_at),
  }));
}

function assertExactKnownPrefix(history) {
  assert.ok(history.length <= entries.length, 'database migration history is ahead of reviewed journal');
  const actualTimes = history.map((row) => row.created_at);
  const expectedTimes = entries.slice(0, history.length).map((entry) => entry.when);
  assert.deepEqual(actualTimes, expectedTimes, 'database migration history is not the exact reviewed journal prefix');
  assert.equal(new Set(actualTimes).size, actualTimes.length, 'database migration history contains duplicate timestamps');
}

async function readPhysicalFacts(client) {
  const expectedTables = [...expectedObjects.tables.keys()];
  const tableRows = (
    await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [expectedTables],
    )
  ).rows;
  const presentTables = new Set(tableRows.map((row) => String(row.table_name)));
  const missingTables = expectedTables.filter((table) => !presentTables.has(table));

  const columnRows = (
    await client.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position`,
      [expectedTables],
    )
  ).rows;
  const actualColumns = new Map();
  for (const row of columnRows) {
    const table = String(row.table_name);
    const columns = actualColumns.get(table) || [];
    columns.push(String(row.column_name));
    actualColumns.set(table, columns);
  }

  const columnMismatches = [];
  for (const [table, expectedColumns] of expectedObjects.tables) {
    const actual = actualColumns.get(table) || [];
    if (JSON.stringify(actual) !== JSON.stringify(expectedColumns)) {
      columnMismatches.push({ table, expected: expectedColumns, actual });
    }
  }

  const constraintRows = (
    await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = ANY($1::text[])
        ORDER BY conname`,
      [expectedObjects.constraints],
    )
  ).rows;
  const presentConstraints = new Map(
    constraintRows.map((row) => [String(row.conname), String(row.definition || '')]),
  );
  const missingConstraints = expectedObjects.constraints.filter((name) => !presentConstraints.has(name));

  const indexRows = (
    await client.query(
      `SELECT indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname`,
      [expectedObjects.indexes],
    )
  ).rows;
  const presentIndexes = new Set(indexRows.map((row) => String(row.indexname)));
  const missingIndexes = expectedObjects.indexes.filter((name) => !presentIndexes.has(name));

  const permissionDefinition = String(
    presentConstraints.get('merchant_cashier_staff_permissions_permission_check') || '',
  );

  const outOfBand0015 = (
    await client.query(`
      SELECT
        to_regclass('public.merchant_cashier_staff_discount_policies') IS NOT NULL AS policy_table_present,
        to_regclass('public.merchant_cashier_discount_override_approvals') IS NOT NULL AS approval_table_present
    `)
  ).rows[0];

  const rowCounts = {};
  for (const table of expectedTables) {
    if (!presentTables.has(table)) continue;
    const result = await client.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
    rowCounts[table] = String(result.rows[0]?.count || '0');
  }

  return {
    missing_tables: missingTables,
    column_mismatches: columnMismatches,
    missing_constraints: missingConstraints,
    missing_indexes: missingIndexes,
    permission_constraint_has_0015_discount_permissions:
      permissionDefinition.includes('sale.discount') || permissionDefinition.includes('sale.discount_override'),
    policy_table_present: Boolean(outOfBand0015.policy_table_present),
    approval_table_present: Boolean(outOfBand0015.approval_table_present),
    row_counts: rowCounts,
  };
}

function assertPhysical0013And0014Exact(facts) {
  assert.deepEqual(facts.missing_tables, [], 'reviewed 0013/0014 tables are missing');
  assert.deepEqual(facts.column_mismatches, [], 'reviewed 0013/0014 columns do not match canonical migrations');
  assert.deepEqual(facts.missing_constraints, [], 'reviewed 0013/0014 constraints are missing');
  assert.deepEqual(facts.missing_indexes, [], 'reviewed 0013/0014 indexes are missing');
  assert.equal(
    facts.permission_constraint_has_0015_discount_permissions,
    false,
    '0015 cashier discount permissions exist before canonical 0015 history',
  );
  assert.equal(facts.policy_table_present, false, '0015 discount policy table already exists out of band');
  assert.equal(facts.approval_table_present, false, '0015 approval table already exists out of band');
}

function assertHistoryReadyForReconciliation(history) {
  assertExactKnownPrefix(history);
  const expectedBeforeReconcile = prefixIndex + 1;
  const expectedAfterReconcile = prefixIndex + 1 + reconcileEntries.length;
  assert.ok(
    history.length === expectedBeforeReconcile || history.length === expectedAfterReconcile,
    `history must end exactly at 0012 or already include both 0013/0014; got ${history.length} rows`,
  );
  if (history.length === expectedAfterReconcile) {
    reconcileEntries.forEach((entry, index) => {
      const migration = migrations[index];
      const row = history[prefixIndex + 1 + index];
      assert.equal(row.created_at, entry.when, `${entry.tag} timestamp does not match reviewed journal`);
      assert.equal(row.hash, migration.hash, `${entry.tag} hash does not match canonical SQL`);
    });
  }
}

const pool = new Pool({ connectionString, max: 1 });
let transactionOpen = false;

try {
  const client = await pool.connect();
  try {
    const database = (
      await client.query('SELECT current_database() AS current_database')
    ).rows[0]?.current_database;
    assert.equal(database, expectedDatabase, `connected database ${database} does not match FAWRI_EXPECT_DATABASE`);

    const historyBefore = await readHistory(client);
    assertHistoryReadyForReconciliation(historyBefore);
    const physicalBefore = await readPhysicalFacts(client);
    assertPhysical0013And0014Exact(physicalBefore);

    const expectedAfterReconcile = prefixIndex + 1 + reconcileEntries.length;
    const alreadyReconciled = historyBefore.length === expectedAfterReconcile;

    if (CHECK && !APPLY) {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: 'cashier_staff_history_reconciliation_preflight',
        database,
        already_reconciled: alreadyReconciled,
        ready_to_reconcile: !alreadyReconciled,
        history_count: historyBefore.length,
        expected_prefix_end: entries[prefixIndex],
        reconcile: reconcileEntries.map((entry, index) => ({
          ...entry,
          sql_sha256: migrations[index].hash,
        })),
        physical_schema_matches_reviewed_0013_0014: true,
        row_counts: physicalBefore.row_counts,
        database_writes_performed: false,
      }, null, 2)}\n`);
    } else if (alreadyReconciled) {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: 'cashier_staff_history_reconciliation_apply',
        database,
        already_reconciled: true,
        ready_to_reconcile: false,
        history_count: historyBefore.length,
        physical_schema_matches_reviewed_0013_0014: true,
        row_counts: physicalBefore.row_counts,
        database_writes_performed: false,
      }, null, 2)}\n`);
    } else {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query('LOCK TABLE "drizzle"."__drizzle_migrations" IN EXCLUSIVE MODE');

      const lockedHistory = await readHistory(client);
      assertExactKnownPrefix(lockedHistory);
      assert.equal(lockedHistory.length, prefixIndex + 1, 'migration history changed after preflight; aborting');

      const physicalLocked = await readPhysicalFacts(client);
      assertPhysical0013And0014Exact(physicalLocked);
      assert.deepEqual(
        physicalLocked.row_counts,
        physicalBefore.row_counts,
        'cashier authority row counts changed during reconciliation preflight',
      );

      for (let index = 0; index < reconcileEntries.length; index += 1) {
        const entry = reconcileEntries[index];
        const migration = migrations[index];
        await client.query(
          `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
          [migration.hash, entry.when],
        );
      }

      const historyInside = await readHistory(client);
      assertHistoryReadyForReconciliation(historyInside);
      assert.equal(historyInside.length, expectedAfterReconcile, 'history did not advance exactly through 0014');

      await client.query('COMMIT');
      transactionOpen = false;

      const historyAfter = await readHistory(client);
      assertHistoryReadyForReconciliation(historyAfter);
      assert.equal(historyAfter.length, expectedAfterReconcile, 'committed history did not end exactly at 0014');
      const physicalAfter = await readPhysicalFacts(client);
      assertPhysical0013And0014Exact(physicalAfter);
      assert.deepEqual(physicalAfter.row_counts, physicalBefore.row_counts, 'metadata reconciliation changed cashier data');

      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: 'cashier_staff_history_reconciliation_apply',
        database,
        already_reconciled: false,
        ready_to_reconcile: false,
        history_count_before: historyBefore.length,
        history_count_after: historyAfter.length,
        reconciled: reconcileEntries.map((entry, index) => ({
          ...entry,
          sql_sha256: migrations[index].hash,
        })),
        physical_schema_matches_reviewed_0013_0014: true,
        cashier_row_counts_unchanged: true,
        row_counts: physicalAfter.row_counts,
        metadata_rows_inserted: reconcileEntries.length,
        ddl_statements_executed: 0,
        database_writes_performed: true,
      }, null, 2)}\n`);
    }
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
