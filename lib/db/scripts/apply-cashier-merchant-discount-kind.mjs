import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createStabilizedMigrationFolder } from './lib/migration-sql-order.mjs';

const { Pool } = pg;
const TARGET_TAG = '0016_cashier_merchant_discount_kind';
const TARGET_INDEX = 16;
const TARGET_WHEN = 1789646400000;
const EXPECTED_PREVIOUS_TAG = '0015_cashier_discount_override_authority';
const EXPECTED_TARGET_SQL_SHA256 = 'fbdb100182428b370f2271ac280cc9316bb1377971826a38b43c15cc40bf1329';
const REQUIRED_COLUMNS = [
  'merchant_id',
  'discount_kind',
  'version',
  'created_at',
  'updated_at',
];
const REQUIRED_CONSTRAINTS = [
  'cashier_merchant_discount_kind_check',
  'cashier_merchant_discount_settings_version_positive',
  'cashier_merchant_discount_settings_timestamp_check',
  'cashier_merchant_discount_settings_merchant_fk',
];
const checkOnly = process.argv.includes('--check');

if (!checkOnly) {
  assert.equal(
    process.env.FAWRI_ALLOW_CASHIER_DISCOUNT_KIND_MIGRATION,
    '1',
    'FAWRI_ALLOW_CASHIER_DISCOUNT_KIND_MIGRATION=1 is required',
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
const targetIndex = entries.findIndex((entry) => entry.tag === TARGET_TAG);
assert.equal(targetIndex, TARGET_INDEX, `${TARGET_TAG} must remain migration index ${TARGET_INDEX}`);
assert.equal(entries.filter((entry) => entry.tag === TARGET_TAG).length, 1, `${TARGET_TAG} must be registered exactly once`);
assert.equal(entries[targetIndex]?.idx, TARGET_INDEX, `${TARGET_TAG} journal index changed`);
assert.equal(entries[targetIndex]?.when, TARGET_WHEN, `${TARGET_TAG} timestamp changed`);
assert.equal(entries[targetIndex - 1]?.tag, EXPECTED_PREVIOUS_TAG, 'unexpected migration immediately before target');

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

function assertKnownPrefix(history) {
  assert.ok(history.length <= entries.length, 'database migration history is ahead of the reviewed journal');
  const actualTimes = history.map((row) => row.created_at);
  const expectedTimes = entries.slice(0, history.length).map((entry) => entry.when);
  assert.deepEqual(actualTimes, expectedTimes, 'database migration history is not the exact reviewed journal prefix');
  assert.equal(new Set(actualTimes).size, actualTimes.length, 'database migration history contains duplicate timestamps');
}

async function readFacts(client) {
  const tablePresent = Boolean((
    await client.query("SELECT to_regclass('public.merchant_cashier_discount_settings') IS NOT NULL AS present")
  ).rows[0]?.present);
  if (!tablePresent) {
    return {
      table_present: false,
      columns: [],
      constraints: [],
      merchant_count: Number((await client.query('SELECT COUNT(*)::int AS count FROM merchants')).rows[0]?.count || 0),
      setting_count: 0,
      missing_merchant_settings: null,
      invalid_kind_rows: null,
    };
  }

  const columns = (
    await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'merchant_cashier_discount_settings'
      ORDER BY ordinal_position
    `)
  ).rows.map((row) => String(row.column_name));
  const constraints = (
    await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid = 'public.merchant_cashier_discount_settings'::regclass
      ORDER BY conname
    `)
  ).rows.map((row) => String(row.conname));
  const merchantCount = Number((await client.query('SELECT COUNT(*)::int AS count FROM merchants')).rows[0]?.count || 0);
  const settingCount = Number((await client.query('SELECT COUNT(*)::int AS count FROM merchant_cashier_discount_settings')).rows[0]?.count || 0);
  const missingMerchantSettings = Number((await client.query(`
    SELECT COUNT(*)::int AS count
    FROM merchants AS m
    LEFT JOIN merchant_cashier_discount_settings AS s ON s.merchant_id = m.id
    WHERE s.merchant_id IS NULL
  `)).rows[0]?.count || 0);
  const invalidKindRows = Number((await client.query(`
    SELECT COUNT(*)::int AS count
    FROM merchant_cashier_discount_settings
    WHERE discount_kind NOT IN ('amount','percentage')
       OR version < 1
       OR updated_at < created_at
  `)).rows[0]?.count || 0);

  return {
    table_present: true,
    columns,
    constraints,
    merchant_count: merchantCount,
    setting_count: settingCount,
    missing_merchant_settings: missingMerchantSettings,
    invalid_kind_rows: invalidKindRows,
  };
}

function assertReadyFacts(facts) {
  assert.equal(facts.table_present, true, 'merchant cashier discount settings table is missing');
  assert.deepEqual([...facts.columns].sort(), [...REQUIRED_COLUMNS].sort(), 'discount settings columns do not match reviewed 0016');
  for (const constraint of REQUIRED_CONSTRAINTS) {
    assert.ok(facts.constraints.includes(constraint), `required constraint ${constraint} is missing`);
  }
  assert.equal(facts.missing_merchant_settings, 0, 'not every merchant has a cashier discount setting');
  assert.equal(facts.invalid_kind_rows, 0, 'cashier discount settings contain invalid rows');
}

const pool = new Pool({ connectionString, max: 1 });
let migrationsFolder;
let alreadyApplied = false;
let preflightOnly = false;

try {
  const client = await pool.connect();
  try {
    const database = String((await client.query('SELECT current_database() AS name')).rows[0]?.name || '');
    assert.equal(database, expectedDatabase, `connected database ${database} does not match FAWRI_EXPECT_DATABASE`);

    const history = await readHistory(client);
    assertKnownPrefix(history);
    const factsBefore = await readFacts(client);

    if (history.length >= targetIndex + 1) {
      assert.equal(history[targetIndex]?.created_at, TARGET_WHEN, '0016 is missing from applied migration history');
      assertReadyFacts(factsBefore);
      alreadyApplied = true;
      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: checkOnly ? 'cashier_discount_kind_preflight' : 'cashier_discount_kind_apply',
        database,
        target: entries[targetIndex],
        target_sql_sha256: targetSqlSha256,
        already_applied: true,
        ready_to_apply: false,
        migration_history_count: history.length,
        ...factsBefore,
        database_writes_performed: false,
      }, null, 2)}\n`);
    } else {
      assert.equal(history.length, targetIndex, 'database must be applied exactly through migration 0015 before applying 0016');
      assert.equal(entries[history.length]?.tag, TARGET_TAG, '0016 is not the next pending migration');
      assert.equal(factsBefore.table_present, false, 'discount settings table already exists without canonical 0016 history');
      if (checkOnly) {
        preflightOnly = true;
        process.stdout.write(`${JSON.stringify({
          ok: true,
          mode: 'cashier_discount_kind_preflight',
          database,
          target: entries[targetIndex],
          target_sql_sha256: targetSqlSha256,
          expected_previous_tag: EXPECTED_PREVIOUS_TAG,
          already_applied: false,
          ready_to_apply: true,
          migration_history_count: history.length,
          table_present: false,
          merchant_count: factsBefore.merchant_count,
          database_writes_performed: false,
        }, null, 2)}\n`);
      }
    }
  } finally {
    client.release();
  }

  if (!alreadyApplied && !preflightOnly) {
    migrationsFolder = createTargetMigrationFolder(migrationsRoot);
    await migrate(drizzle(pool), { migrationsFolder });

    const verifyClient = await pool.connect();
    try {
      const database = String((await verifyClient.query('SELECT current_database() AS name')).rows[0]?.name || '');
      assert.equal(database, expectedDatabase, `connected database ${database} does not match FAWRI_EXPECT_DATABASE`);
      const historyAfter = await readHistory(verifyClient);
      assertKnownPrefix(historyAfter);
      assert.equal(historyAfter.length, targetIndex + 1, 'migration history did not advance exactly through 0016');
      assert.equal(historyAfter[targetIndex]?.created_at, TARGET_WHEN, '0016 was not recorded at migration index 16');
      const factsAfter = await readFacts(verifyClient);
      assertReadyFacts(factsAfter);
      assert.equal(factsAfter.setting_count, factsAfter.merchant_count, '0016 merchant backfill row count mismatch');

      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: 'cashier_discount_kind_apply',
        database,
        target: entries[targetIndex],
        target_sql_sha256: targetSqlSha256,
        already_applied: false,
        ready_to_apply: false,
        migration_history_count: historyAfter.length,
        ...factsAfter,
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
