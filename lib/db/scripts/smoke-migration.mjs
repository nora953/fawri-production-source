import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;
const expectedTables = [
  "account_sessions",
  "accounts",
  "admin_permissions",
  "admin_profiles",
  "audit_events",
  "conversations",
  "emergency_access_requests",
  "emergency_authorizations",
  "emergency_merchant_notices",
  "emergency_owner_alerts",
  "learned_answers",
  "login_attempts",
  "merchant_channels",
  "merchants",
  "messages",
  "notifications",
  "order_drafts",
  "order_items",
  "orders",
  "processed_channel_events",
  "product_variants",
  "products",
  "reply_ledger",
  "saved_answers",
  "subscription_reply_batches",
  "subscriptions",
  "support_attachments",
  "support_inspection_requests",
  "support_messages",
  "support_preview_sessions",
  "support_tickets",
  "training_requests",
  "trusted_devices",
].sort();

const expectedEnums = [
  "account_kind",
  "account_state",
  "admin_permission",
  "admin_role",
  "audit_actor_kind",
  "channel_platform",
  "channel_status",
  "consent_decision",
  "conversation_status",
  "device_trust_status",
  "emergency_access_status",
  "emergency_activation_mode",
  "emergency_severity",
  "inspection_mode",
  "inspection_status",
  "interface_language",
  "learned_answer_source",
  "merchant_account_status",
  "merchant_status",
  "message_sender",
  "message_status",
  "notification_audience",
  "onboarding_status",
  "order_status",
  "payment_method",
  "payment_status",
  "preview_session_status",
  "reply_batch_source",
  "reply_type",
  "saved_answer_category",
  "session_kind",
  "session_status",
  "signup_source",
  "subscription_plan",
  "subscription_status",
  "support_sender_type",
  "support_ticket_status",
  "support_waiting_on",
  "training_status",
  "trial_status",
].sort();

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

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
requireSafeCiDatabase(connectionString);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDirectory, "../drizzle");
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

  assert.deepEqual(await listPublicTables(pool), expectedTables);
  assert.deepEqual(await listPublicEnums(pool), expectedEnums);
  await assertCriticalForeignKeys(pool);

  const history = await pool.query(
    'SELECT COUNT(*)::integer AS count FROM "drizzle"."__drizzle_migrations"',
  );
  assert.equal(history.rows[0]?.count, 1, "exactly one migration must be recorded");

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        database: "fawri_ci",
        tables: expectedTables.length,
        enums: expectedEnums.length,
        migrations: 1,
        applied_twice_without_changes: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
}
