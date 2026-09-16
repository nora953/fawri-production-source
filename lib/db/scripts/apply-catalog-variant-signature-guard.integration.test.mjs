import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createStabilizedMigrationFolder } from './lib/migration-sql-order.mjs';

const { Pool } = pg;
const connectionString = String(process.env.DATABASE_URL || '').trim();
assert.ok(connectionString, 'DATABASE_URL is required');
const parsed = new URL(connectionString);
assert.ok(
  parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost',
  'catalog signature apply regression only permits a local database',
);
const databaseName = parsed.pathname.replace(/^\//, '');
assert.equal(databaseName, 'fawri_ci', 'catalog signature apply regression only permits fawri_ci');

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(currentDirectory, '../drizzle');
const applyScript = path.join(currentDirectory, 'apply-catalog-variant-signature-guard.mjs');
const readinessScript = path.join(currentDirectory, 'catalog-variant-signature-readiness.mjs');
const journal = JSON.parse(fs.readFileSync(path.join(migrationsRoot, 'meta', '_journal.json'), 'utf8'));
const targetIndex = journal.entries.findIndex((entry) => entry.tag === '0012_catalog_variant_signature_guard');
assert.equal(targetIndex, 12);
assert.ok(journal.entries.length > targetIndex + 1, 'regression requires later committed migrations after 0012');

function createPrefixMigrationFolder(count) {
  const destination = createStabilizedMigrationFolder(migrationsRoot);
  const journalPath = path.join(destination, 'meta', '_journal.json');
  const scoped = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const removed = scoped.entries.slice(count);
  scoped.entries = scoped.entries.slice(0, count);
  fs.writeFileSync(journalPath, `${JSON.stringify(scoped, null, 2)}\n`, 'utf8');
  for (const entry of removed) {
    fs.rmSync(path.join(destination, `${entry.tag}.sql`), { force: true });
  }
  return destination;
}

function runNode(scriptPath) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(currentDirectory, '../../..'),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      FAWRI_ALLOW_CATALOG_SIGNATURE_MIGRATION: '1',
      FAWRI_EXPECT_DATABASE: databaseName,
    },
    encoding: 'utf8',
  });
}

function parseJsonOutput(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(String(result.stdout || '').trim());
}

test('guarded 0012 apply stays target-scoped after later migrations are committed', async () => {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const historyTable = (
      await client.query("SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table")
    ).rows[0]?.migration_table;
    assert.equal(historyTable, null, 'disposable database must start without migration history');
  } finally {
    client.release();
  }

  const prefixFolder = createPrefixMigrationFolder(targetIndex);
  try {
    await migrate(drizzle(pool), { migrationsFolder: prefixFolder });
  } finally {
    fs.rmSync(prefixFolder, { recursive: true, force: true });
    await pool.end();
  }

  const beforePool = new Pool({ connectionString, max: 1 });
  try {
    const before = await beforePool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM "drizzle"."__drizzle_migrations") AS history_count,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'product_variants_option_signature_guard'
            AND NOT tgisinternal
        ) AS trigger_present,
        EXISTS (
          SELECT 1 FROM pg_proc
          WHERE proname = 'fawri_normalize_catalog_variant_signature'
        ) AS normalizer_present
    `);
    assert.equal(Number(before.rows[0].history_count), targetIndex);
    assert.equal(Boolean(before.rows[0].trigger_present), false);
    assert.equal(Boolean(before.rows[0].normalizer_present), false);
  } finally {
    await beforePool.end();
  }

  const first = parseJsonOutput(runNode(applyScript));
  assert.equal(first.ok, true);
  assert.equal(first.already_applied, false);
  assert.equal(first.database_writes_performed, true);
  assert.equal(first.migration_history_count, targetIndex + 1);
  assert.equal(first.trigger_present, true);
  assert.equal(first.normalizer_present, true);

  const verifyPool = new Pool({ connectionString, max: 1 });
  try {
    const history = await verifyPool.query(`
      SELECT created_at::text AS created_at
      FROM "drizzle"."__drizzle_migrations"
      ORDER BY created_at ASC, id ASC
    `);
    assert.equal(history.rows.length, targetIndex + 1);
    assert.equal(Number(history.rows[targetIndex].created_at), Number(journal.entries[targetIndex].when));
    assert.equal(
      history.rows.some((row) => Number(row.created_at) === Number(journal.entries[targetIndex + 1].when)),
      false,
      'guarded apply must not advance into migration 0013',
    );
  } finally {
    await verifyPool.end();
  }

  const readiness = parseJsonOutput(runNode(readinessScript));
  assert.equal(readiness.ok, true);
  assert.equal(readiness.signature_guard_trigger_present, true);
  assert.equal(readiness.signature_normalizer_present, true);
  assert.equal(readiness.database_writes_performed, false);

  const replay = parseJsonOutput(runNode(applyScript));
  assert.equal(replay.ok, true);
  assert.equal(replay.already_applied, true);
  assert.equal(replay.database_writes_performed, false);
  assert.equal(replay.migration_history_count, targetIndex + 1);
});
