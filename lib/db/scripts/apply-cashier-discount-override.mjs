import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createStabilizedMigrationFolder } from './lib/migration-sql-order.mjs';
import {
  CASHIER_DISCOUNT_OVERRIDE_COLUMNS,
  CASHIER_DISCOUNT_OVERRIDE_MIGRATION_WHEN,
  CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS,
  CASHIER_DISCOUNT_POLICY_COLUMNS,
  evaluateCashierDiscountOverrideReadiness,
} from './lib/cashier-discount-override-readiness.mjs';

const { Pool } = pg;
const TARGET_TAG = '0015_cashier_discount_override_authority';
const EXPECTED_TARGET_SQL_SHA256 = '3b04f71b9b5af0af26ab158cf6a23ff7a9861f1103d9f886b37dba5e98fcc321';
const EXPECTED_PREVIOUS_TAG = '0014_cashier_operation_attribution';

assert.equal(
  process.env.FAWRI_ALLOW_CASHIER_DISCOUNT_MIGRATION,
  '1',
  'FAWRI_ALLOW_CASHIER_DISCOUNT_MIGRATION=1 is required',
);

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
const targetIndex = entries.findIndex((entry) => entry.tag === TARGET_TAG);
assert.equal(targetIndex, 15, `${TARGET_TAG} must remain migration index 15`);
assert.equal(
  entries.filter((entry) => entry.tag === TARGET_TAG).length,
  1,
  `${TARGET_TAG} must be registered exactly once`,
);
assert.equal(entries[targetIndex]?.idx, targetIndex, `${TARGET_TAG} journal index changed`);
assert.equal(entries[targetIndex]?.when, CASHIER_DISCOUNT_OVERRIDE_MIGRATION_WHEN, `${TARGET_TAG} timestamp changed`);
assert.equal(entries[targetIndex - 1]?.tag, EXPECTED_PREVIOUS_TAG, 'unexpected migration immediately before target');

const targetEntry = entries[targetIndex];
const targetSqlPath = path.join(migrationsRoot, `${TARGET_TAG}.sql`);
assert.ok(fs.existsSync(targetSqlPath), `${TARGET_TAG}.sql is missing`);
const targetSqlSha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(targetSqlPath, 'utf8'))
  .digest('hex');
assert.equal(
  targetSqlSha256,
  EXPECTED_TARGET_SQL_SHA256,
  'target migration SQL hash changed; re-review before applying',
);

function createTargetMigrationFolder(sourceFolder) {
  const destination = createStabilizedMigrationFolder(sourceFolder);
  const journalPath = path.join(destination, 'meta', '_journal.json');
  const scopedJournal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  assert.ok(Array.isArray(scopedJournal.entries), 'migration journal entries are missing');
  assert.equal(scopedJournal.entries[targetIndex]?.tag, TARGET_TAG, 'target migration moved in stabilized journal');
  scopedJournal.entries = scopedJournal.entries.slice(0, targetIndex + 1);
  fs.writeFileSync(journalPath, `${JSON.stringify(scopedJournal, null, 2)}\n`, 'utf8');

  for (const entry of entries.slice(targetIndex + 1)) {
    fs.rmSync(path.join(destination, `${entry.tag}.sql`), { force: true });
  }
  return destination;
}

async function readHistory(client) {
  const table = (
    await client.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table",
    )
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

function assertKnownPrefix(history) {
  assert.ok(history.length <= entries.length, 'database migration history is ahead of the reviewed journal');
  const actualTimes = history.map((row) => row.created_at);
  const expectedTimes = entries.slice(0, history.length).map((entry) => entry.when);
  assert.deepEqual(actualTimes, expectedTimes, 'database migration history is not the exact reviewed journal prefix');
  assert.equal(new Set(actualTimes).size, actualTimes.length, 'database migration history contains duplicate timestamps');
}

async function readReadinessFacts(client) {
  const tables = (
    await client.query(`
      SELECT
        to_regclass('public.merchant_cashier_staff_discount_policies') IS NOT NULL AS policy_table_present,
        to_regclass('public.merchant_cashier_discount_override_approvals') IS NOT NULL AS override_table_present
    `)
  ).rows[0];

  const columns = (
    await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'merchant_cashier_staff_discount_policies',
          'merchant_cashier_discount_override_approvals'
        )
      ORDER BY table_name, ordinal_position
    `)
  ).rows;
  const policyColumns = columns
    .filter((row) => row.table_name === 'merchant_cashier_staff_discount_policies')
    .map((row) => String(row.column_name));
  const overrideColumns = columns
    .filter((row) => row.table_name === 'merchant_cashier_discount_override_approvals')
    .map((row) => String(row.column_name));

  const constraintRows = (
    await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid IN (
          COALESCE(to_regclass('public.merchant_cashier_staff_permissions'), 0::oid),
          COALESCE(to_regclass('public.merchant_cashier_staff_discount_policies'), 0::oid),
          COALESCE(to_regclass('public.merchant_cashier_discount_override_approvals'), 0::oid)
        )
      ORDER BY conname
    `)
  ).rows;
  const constraintNames = constraintRows.map((row) => String(row.conname));
  const permissionConstraint = constraintRows.find(
    (row) => row.conname === 'merchant_cashier_staff_permissions_permission_check',
  );
  const permissionDefinition = String(permissionConstraint?.definition || '');

  return {
    permission_constraint_supports_discount:
      permissionDefinition.includes('sale.discount') &&
      permissionDefinition.includes('sale.discount_override'),
    policy_table_present: Boolean(tables.policy_table_present),
    override_table_present: Boolean(tables.override_table_present),
    policy_columns: policyColumns,
    override_columns: overrideColumns,
    constraint_names: constraintNames,
  };
}

function assertNoOutOfBandSchema(facts) {
  assert.equal(facts.policy_table_present, false, 'discount policy table already exists without canonical 0015 history');
  assert.equal(facts.override_table_present, false, 'discount override table already exists without canonical 0015 history');
  assert.equal(
    facts.permission_constraint_supports_discount,
    false,
    'cashier discount permissions already exist without canonical 0015 history',
  );
}

function assertExactColumns(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} columns do not match reviewed 0015`);
}

const pool = new Pool({ connectionString, max: 1 });
let migrationsFolder;

try {
  const client = await pool.connect();
  let alreadyApplied = false;
  try {
    const database = (
      await client.query('SELECT current_database() AS current_database')
    ).rows[0]?.current_database;
    assert.equal(database, expectedDatabase, `connected database ${database} does not match FAWRI_EXPECT_DATABASE`);

    const history = await readHistory(client);
    assertKnownPrefix(history);
    const factsBefore = await readReadinessFacts(client);

    if (history.length >= targetIndex + 1) {
      assert.equal(history[targetIndex]?.created_at, targetEntry.when, 'target migration is missing from applied history');
      assertExactColumns(factsBefore.policy_columns, CASHIER_DISCOUNT_POLICY_COLUMNS, 'discount policy');
      assertExactColumns(factsBefore.override_columns, CASHIER_DISCOUNT_OVERRIDE_COLUMNS, 'discount override');
      const readiness = evaluateCashierDiscountOverrideReadiness({
        ...factsBefore,
        migration_recorded: true,
      });
      assert.equal(readiness.ok, true, '0015 history exists but cashier discount authority is incomplete');
      alreadyApplied = true;
      process.stdout.write(`${JSON.stringify({
        ...readiness,
        mode: 'cashier_discount_override_apply',
        database,
        target: targetEntry,
        target_sql_sha256: targetSqlSha256,
        already_applied: true,
        migration_history_count: history.length,
        database_writes_performed: false,
      }, null, 2)}\n`);
    } else {
      assert.equal(history.length, targetIndex, 'database must be applied exactly through migration 0014 before applying 0015');
      assert.equal(entries[history.length]?.tag, TARGET_TAG, '0015 is not the next pending migration');
      assertNoOutOfBandSchema(factsBefore);
    }
  } finally {
    client.release();
  }

  if (!alreadyApplied) {
    migrationsFolder = createTargetMigrationFolder(migrationsRoot);
    await migrate(drizzle(pool), { migrationsFolder });

    const verifyClient = await pool.connect();
    try {
      const historyAfter = await readHistory(verifyClient);
      assertKnownPrefix(historyAfter);
      assert.equal(historyAfter.length, targetIndex + 1, 'migration history count did not advance exactly through 0015');
      assert.equal(historyAfter[targetIndex]?.created_at, targetEntry.when, '0015 was not recorded at migration index 15');

      const factsAfter = await readReadinessFacts(verifyClient);
      assertExactColumns(factsAfter.policy_columns, CASHIER_DISCOUNT_POLICY_COLUMNS, 'discount policy');
      assertExactColumns(factsAfter.override_columns, CASHIER_DISCOUNT_OVERRIDE_COLUMNS, 'discount override');
      for (const name of CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS) {
        assert.ok(factsAfter.constraint_names.includes(name), `required cashier discount constraint ${name} is missing`);
      }
      const readiness = evaluateCashierDiscountOverrideReadiness({
        ...factsAfter,
        migration_recorded: true,
      });
      assert.equal(readiness.ok, true, 'cashier discount override authority is not ready after 0015');

      const policyCount = Number((
        await verifyClient.query('SELECT COUNT(*)::int AS count FROM merchant_cashier_staff_discount_policies')
      ).rows[0]?.count || 0);
      const approvalCount = Number((
        await verifyClient.query('SELECT COUNT(*)::int AS count FROM merchant_cashier_discount_override_approvals')
      ).rows[0]?.count || 0);
      assert.equal(policyCount, 0, '0015 must not invent staff discount policy rows');
      assert.equal(approvalCount, 0, '0015 must not invent manager approval rows');

      const databaseName = (
        await verifyClient.query('SELECT current_database() AS current_database')
      ).rows[0]?.current_database;
      process.stdout.write(`${JSON.stringify({
        ...readiness,
        mode: 'cashier_discount_override_apply',
        database: databaseName,
        target: targetEntry,
        target_sql_sha256: targetSqlSha256,
        already_applied: false,
        migration_history_count: historyAfter.length,
        policy_row_count: policyCount,
        approval_row_count: approvalCount,
        database_writes_performed: true,
      }, null, 2)}\n`);
    } finally {
      verifyClient.release();
    }
  }
} finally {
  await pool.end();
  if (migrationsFolder) fs.rmSync(migrationsFolder, { recursive: true, force: true });
}
