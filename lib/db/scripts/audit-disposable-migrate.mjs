import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { createStabilizedMigrationFolder } from './lib/migration-sql-order.mjs';
await assertDisposablePostgres();
const root = path.resolve('lib/db/drizzle');
const journal = JSON.parse(fs.readFileSync(path.join(root, 'meta/_journal.json'), 'utf8'));
const migrationsFolder = createStabilizedMigrationFolder(root);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder });
  const result = await pool.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations');
  assert.equal(result.rows[0].count, journal.entries.length);
  console.log(`DISPOSABLE_MIGRATIONS_PASS count=${journal.entries.length}`);
} finally {
  await pool.end();
  fs.rmSync(migrationsFolder, { recursive: true, force: true });
}
