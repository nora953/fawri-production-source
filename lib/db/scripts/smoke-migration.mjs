import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

function requireSafeCiDatabase(connectionString) {
  assert.equal(
    process.env.FAWRI_ALLOW_MIGRATION_SMOKE,
    "1",
    "FAWRI_ALLOW_MIGRATION_SMOKE=1 is required",
  );

  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "migration smoke test only permits a local PostgreSQL host",
  );
  assert.equal(
    databaseName,
    "fawri_ci",
    "migration smoke test only permits the fawri_ci database",
  );
}

function loadCommittedSchemaExpectation(migrationsFolder) {
  const metaDirectory = path.join(migrationsFolder, "meta");
  const journal = JSON.parse(
    fs.readFileSync(path.join(metaDirectory, "_journal.json"), "utf8"),
  );
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const latest = entries.at(-1);
  assert.ok(latest && Number.isInteger(latest.idx), "migration journal is empty");

  const snapshotName = `${String(latest.idx).padStart(4, "0")}_snapshot.json`;
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(metaDirectory, snapshotName), "utf8"),
  );
  const tables = Object.keys(snapshot.tables || {})
    .map((name) => name.replace(/^public\./, ""))
    .sort();
  const enums = Object.keys(snapshot.enums || {})
    .map((name) => name.replace(/^public\./, ""))
    .sort();
  const compositeForeignKeys = Object.values(snapshot.tables || {})
    .flatMap((table) => Object.values(table.foreignKeys || {}))
    .filter((foreignKey) => (foreignKey.columnsFrom || []).length > 1)
    .map((foreignKey) => foreignKey.name)
    .filter(Boolean)
    .sort();

  return {
    snapshotName,
    tables,
    enums,
    compositeForeignKeys,
    migrationCount: entries.length,
  };
}

async function listPublicTables(pool) {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => row.table_name);
}

async function listPublicEnums(pool) {
  const result = await pool.query(`
    SELECT type.typname AS enum_name
    FROM pg_type AS type
    INNER JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'public' AND type.typtype = 'e'
    ORDER BY type.typname
  `);
  return result.rows.map((row) => row.enum_name);
}

async function assertCriticalForeignKeys(pool) {
  const expected = [
    ["merchants", "account_id", "accounts", "id"],
    ["subscriptions", "merchant_id", "merchants", "id"],
    ["messages", "conversation_id", "conversations", "id"],
    ["orders", "merchant_id", "merchants", "id"],
    ["support_attachments", "message_id", "support_messages", "id"],
    ["emergency_access_requests", "merchant_id", "merchants", "id"],
  ];

  const result = await pool.query(`
    SELECT
      source_table.relname AS source_table,
      source_column.attname AS source_column,
      target_table.relname AS target_table,
      target_column.attname AS target_column
    FROM pg_constraint AS fk_constraint
    INNER JOIN pg_class AS source_table ON source_table.oid = fk_constraint.conrelid
    INNER JOIN pg_class AS target_table ON target_table.oid = fk_constraint.confrelid
    INNER JOIN LATERAL unnest(fk_constraint.conkey) WITH ORDINALITY AS source_key(attnum, position) ON true
    INNER JOIN LATERAL unnest(fk_constraint.confkey) WITH ORDINALITY AS target_key(attnum, position)
      ON target_key.position = source_key.position
    INNER JOIN pg_attribute AS source_column
      ON source_column.attrelid = source_table.oid AND source_column.attnum = source_key.attnum
    INNER JOIN pg_attribute AS target_column
      ON target_column.attrelid = target_table.oid AND target_column.attnum = target_key.attnum
    WHERE fk_constraint.contype = 'f'
  `);

  const actual = new Set(
    result.rows.map((row) =>
      [row.source_table, row.source_column, row.target_table, row.target_column].join("."),
    ),
  );

  for (const relationship of expected) {
    assert.ok(
      actual.has(relationship.join(".")),
      `missing critical foreign key ${relationship.join(" -> ")}`,
    );
  }
}

async function assertCompositeTenantConstraints(pool, expectedNames) {
  const result = await pool.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'
  `);
  const actual = new Set(result.rows.map((row) => row.constraint_name));
  for (const name of expectedNames) {
    assert.ok(actual.has(name), `missing composite tenant foreign key ${name}`);
  }
}

async function assertMerchantSettingsChecks(pool) {
  const expected = [
    "merchant_settings_delivery_days_check",
    "merchant_settings_payment_availability_check",
  ];
  const result = await pool.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'merchant_settings'
      AND constraint_type = 'CHECK'
  `);
  const actual = new Set(result.rows.map((row) => row.constraint_name));
  for (const name of expected) {
    assert.ok(actual.has(name), `missing merchant settings check ${name}`);
  }
}

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
requireSafeCiDatabase(connectionString);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDirectory, "../drizzle");
const expected = loadCommittedSchemaExpectation(migrationsFolder);
const pool = new Pool({ connectionString });
const database = drizzle(pool);

try {
  assert.deepEqual(
    await listPublicTables(pool),
    [],
    "fawri_ci must be empty before applying migrations",
  );

  await migrate(database, { migrationsFolder });
  await migrate(database, { migrationsFolder });

  assert.deepEqual(await listPublicTables(pool), expected.tables);
  assert.deepEqual(await listPublicEnums(pool), expected.enums);
  await assertCriticalForeignKeys(pool);
  await assertCompositeTenantConstraints(pool, expected.compositeForeignKeys);
  await assertMerchantSettingsChecks(pool);

  const history = await pool.query(
    'SELECT COUNT(*)::integer AS count FROM "drizzle"."__drizzle_migrations"',
  );
  assert.equal(
    history.rows[0]?.count,
    expected.migrationCount,
    "migration history must match the committed Drizzle journal",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        database: "fawri_ci",
        snapshot: expected.snapshotName,
        tables: expected.tables.length,
        enums: expected.enums.length,
        composite_foreign_keys: expected.compositeForeignKeys.length,
        migrations: expected.migrationCount,
        applied_twice_without_changes: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
}
