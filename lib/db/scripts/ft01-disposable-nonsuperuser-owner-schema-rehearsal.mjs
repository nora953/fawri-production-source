/**
 * FT-01 PostgreSQL 18: run ACTUAL canonical 0000..0052 Drizzle migrations
 * under a Neon-like NON-SUPERUSER database owner, not the CI superuser.
 * This is local GitHub Actions ONLY, never a hosted bootstrap utility.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createStabilizedMigrationFolder } from "./lib/migration-sql-order.mjs";

const { Client, Pool } = pg;
const ROLE = "fawri_ft01_nonsuperuser_owner";
const DB = "fawri_ft01_non_superuser";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function localTarget() {
  assert.equal(process.argv.length, 2, "FT01_OWNER_NO_ARGS");
  assert.equal(process.env.GITHUB_ACTIONS, "true", "FT01_OWNER_CI_ONLY");
  assert.equal(process.env.GITHUB_REPOSITORY,
    "nora953/fawri-production-source", "FT01_OWNER_REPO_ONLY");
  assert.equal(process.env.FAWRI_ALLOW_FT01_NON_SUPERUSER_OWNER_REHEARSAL,
    "1", "FT01_OWNER_EXPLICIT_LOCAL_FLAG");
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1", "FT01_OWNER_LOCAL_ONLY");
  assert.equal(url.port, "5432", "FT01_OWNER_PORT_ONLY");
  assert.equal(url.pathname, "/fawri_ci", "FT01_OWNER_CI_DB_ONLY");
  assert.equal(decodeURIComponent(url.username), "fawri_ci");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  return url;
}

async function main() {
  const local = localTarget();
  const admin = new Client({
    connectionString: local.toString(), ssl: false, connectionTimeoutMillis: 3000,
  });
  const pass = randomBytes(32).toString("hex");
  const newUrl = new URL(local.toString());
  newUrl.username = ROLE;
  newUrl.password = pass;
  newUrl.pathname = "/" + DB;
  const ownerPool = new Pool({
    connectionString: newUrl.toString(), ssl: false,
    connectionTimeoutMillis: 3000, max: 2,
  });
  let roleCreated = false, dbCreated = false;
  let migrationFolder;
  await admin.connect();
  try {
    const row = (await admin.query(`SELECT
      current_database() AS db,
      current_setting('server_version_num')::integer / 10000 AS major,
      (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS ledger,
      (SELECT count(*)::int FROM pg_roles WHERE rolname=$1) AS role_count,
      (SELECT count(*)::int FROM pg_database WHERE datname=$2) AS db_count`,
    [ROLE, DB])).rows[0];
    assert.deepEqual(row, {
      db: "fawri_ci", major: 18, ledger: 53, role_count: 0, db_count: 0,
    }, "FT01_OWNER_LOCAL_PREIMAGE_NOT_ACCEPTED");

    await admin.query(`CREATE ROLE "${ROLE}" LOGIN NOSUPERUSER CREATEROLE
      BYPASSRLS CREATEDB REPLICATION PASSWORD '${pass}'`);
    roleCreated = true;
    await admin.query(`CREATE DATABASE "${DB}" OWNER "${ROLE}"`);
    dbCreated = true;

    const role = (await admin.query(`SELECT rolcanlogin, rolsuper,
      rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
      FROM pg_catalog.pg_roles WHERE rolname=$1`, [ROLE])).rows[0];
    assert.deepEqual(role, {
      rolcanlogin:true, rolsuper:false, rolbypassrls:true,
      rolcreatedb:true, rolcreaterole:true, rolreplication:true,
    }, "FT01_OWNER_EXPECTED_NON_SUPERUSER_ATTRIBUTES");

    const before = await ownerPool.query(`SELECT session_user AS actor,
      current_database() AS db, current_setting('server_version_num')::int / 10000 AS major,
      (SELECT count(*)::int FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
        WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables`);
    assert.deepEqual(before.rows[0], {
      actor: ROLE, db: DB, major:18, public_tables:0,
    }, "FT01_OWNER_WRONG_DATABASE_OR_NOT_EMPTY");

    const source = path.resolve(moduleDir, "../drizzle");
    migrationFolder = createStabilizedMigrationFolder(source);
    const database = drizzle(ownerPool);
    await migrate(database, { migrationsFolder: migrationFolder });
    await migrate(database, { migrationsFolder: migrationFolder });

    const post = (await ownerPool.query(`
      SELECT session_user AS actor,
        (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
        (SELECT count(*)::int FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
          WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
        (SELECT count(*)::int FROM pg_catalog.pg_type t
          JOIN pg_catalog.pg_namespace n ON t.typnamespace=n.oid
          WHERE n.nspname='public' AND t.typtype='e') AS enums,
        (SELECT count(*)::int FROM pg_catalog.pg_constraint co
          WHERE co.contype='f' AND cardinality(co.conkey)>1
          AND co.connamespace='public'::regnamespace) AS composite_fks,
        (SELECT count(*)::int FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
          WHERE n.nspname='public' AND c.relname IN (
            'cashier_device_streams','cashier_operation_receipts',
            'audit_events','manual_reply_requests','merchant_admin_notes',
            'merchant_channel_overrides','merchant_deletion_requests',
            'notifications','order_drafts','processed_channel_events')
            AND c.relrowsecurity AND c.relkind='r') AS checked_rls,
        (SELECT count(*)::int FROM public.notifications) AS notification_count
    `)).rows[0];
    assert.deepEqual(post, {
      actor:ROLE, migrations:53, tables:97, enums:69,
      composite_fks:82, checked_rls:10, notification_count:0,
    }, "FT01_OWNER_CANONICAL_SCHEMA_MISMATCH");
    console.log("FT01_NON_SUPERUSER_NEON_LIKE_OWNER_53_MIGRATIONS_PG18_PASS");
  } finally {
    await ownerPool.end();
    if (migrationFolder) {
      fs.rmSync(migrationFolder, { recursive: true, force: true });
    }
    if (dbCreated) await admin.query(`DROP DATABASE "${DB}" WITH (FORCE)`);
    if (roleCreated) await admin.query(`DROP ROLE "${ROLE}"`);
    const remaining = await admin.query(`SELECT
      (SELECT count(*)::int FROM pg_roles WHERE rolname=$1) AS roles,
      (SELECT count(*)::int FROM pg_database WHERE datname=$2) AS databases`,
      [ROLE,DB]);
    assert.deepEqual(remaining.rows[0], {roles:0,databases:0});
    await admin.end();
  }
}
await main();
