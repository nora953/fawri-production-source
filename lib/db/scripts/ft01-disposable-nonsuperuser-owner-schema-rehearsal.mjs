/**
 * FT-01 PostgreSQL 18: run ACTUAL canonical 0000..0052 Drizzle migrations
 * under a Neon-like NON-SUPERUSER database owner, not the CI superuser.
 * This is local GitHub Actions ONLY, never a hosted bootstrap utility.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
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
      (to_regclass('drizzle.__drizzle_migrations') IS NOT NULL) AS ledger_exists,
      (SELECT count(*)::int FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables,
      (SELECT count(*)::int FROM pg_roles WHERE rolname=$1) AS role_count,
      (SELECT count(*)::int FROM pg_roles
        WHERE rolname='fawri_cashier_retirement_owner') AS retirement_roles,
      (SELECT count(*)::int FROM pg_database WHERE datname=$2) AS db_count`,
    [ROLE, DB])).rows[0];
    assert.deepEqual(row, {
      db: "fawri_ci", major: 18, ledger_exists:false, public_tables:0,
      role_count: 0, retirement_roles:0, db_count: 0,
    }, "FT01_OWNER_LOCAL_PREIMAGE_NOT_CLEAN");

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
    // The committed 0052 source and stage checksum MUST stay unchanged:
    // existing preflight explicitly rejects a non-superuser retirement-owner
    // handoff. Prove the actual 42501 first, not hide it with a permissive user.
    const original0052 = path.join(source,"0052_cashier_stream_receipt_storage.sql");
    const originalSql = fs.readFileSync(original0052,"utf8");
    assert.equal(createHash("sha256").update(originalSql).digest("hex"),
      "aaf7ee97fbdef0c1b4600e905216117ee8ff89f31ccd67d783ab61a9c4bd9b8e",
      "FT01_0052_CANONICAL_HASH_CHANGED");
    await assert.rejects(
      () => migrate(database, { migrationsFolder: migrationFolder }),
      error => {
        const code = error?.cause?.code ?? error?.code;
        return code === "42501" &&
          /must be able to SET ROLE/.test(String(error?.cause?.message ?? error?.message));
      },
      "FT01_0052_NON_SUPERUSER_OWNERSHIP_MUST_FAIL_IN_CANONICAL_SOURCE",
    );
    const partial = await ownerPool.query(
      'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations',
    );
    // A missing Drizzle ledger does NOT establish atomic rollback of every
    // role/schema object. Inspect the *isolated-cluster* global catalog below.
    assert.equal(partial.rows[0]?.n,0,"FT01_0052_LEDGER_NOT_COMMITTED");

    // Explore a *temporary local-only migration variant*. Never write this
    // altered SQL back to the repository's committed 0052, never run it on
    // Neon, and NEVER mark the hosted superuser preflight as accepted.
    // PostgreSQL requires SET privilege to transfer a function to a role.
    // Grant only in the same migration transaction, then revoke, ensuring
    // zero membership after completion. Source SHA remains unchanged.
    const variantFile = path.join(migrationFolder,
      "0052_cashier_stream_receipt_storage.sql");
    const localSql = fs.readFileSync(variantFile,"utf8");
    const anchor = "ALTER FUNCTION public.fawri_sequence_merchant_deleted() OWNER TO fawri_cashier_retirement_owner;";
    assert.equal(localSql.split(anchor).length,2,"FT01_0052_UNIQUE_OWNER_ANCHOR");
    fs.writeFileSync(variantFile,localSql.replace(anchor,
      "GRANT fawri_cashier_retirement_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;\n" +
      anchor + "\n" +
      "REVOKE fawri_cashier_retirement_owner FROM CURRENT_USER;"),"utf8");

    // CREATEROLE alone cannot grant the new NOLOGIN role to this creator
    // in PG18. Prove the *proposed workaround* also FAILS CLOSED; do not
    // modify canonical 0052, weaken OWNER readiness, or leave memberships.
    await assert.rejects(
      () => migrate(database, { migrationsFolder: migrationFolder }),
      error => {
        const code = error?.cause?.code ?? error?.code;
        return code === "42501" &&
          /permission denied to grant role/.test(
            String(error?.cause?.message ?? error?.message));
      },
      "FT01_TEMPORARY_SET_MEMBERSHIP_MUST_REMAIN_BLOCKED",
    );
    const after = (await ownerPool.query(`
      SELECT
        (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
        (SELECT count(*)::int FROM pg_roles
          WHERE rolname='fawri_cashier_retirement_owner') AS retirement_roles,
        (SELECT count(*)::int FROM pg_proc
          WHERE oid=to_regprocedure('public.fawri_sequence_merchant_deleted()')) AS definer_functions,
        (SELECT count(*)::int FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables
    `)).rows[0];
    assert.equal(after.migrations,0,"FT01_0052_LEDGER_MUST_NOT_RECORD_FAILURE");
    assert.equal(after.definer_functions,0,"FT01_0052_DEF_FUNCTION_NOT_ALLOWED_AFTER_FAILURE");
    console.log("FT01_CLEAN_CLUSTER_NON_SUPERUSER_0052_NEGATIVE_STATE",
      JSON.stringify(after));
    console.log("FT01_0052_REQUIRES_REVIEWED_SAFE_OWNER_HANDOFF");
  } finally {
    await ownerPool.end();
    if (migrationFolder) {
      fs.rmSync(migrationFolder, { recursive: true, force: true });
    }
    if (dbCreated) await admin.query(`DROP DATABASE "${DB}" WITH (FORCE)`);
    // The local source may leave a CLUSTER-GLOBAL role after failed SQL.
    // Cleanup is only on the GitHub disposable PostgreSQL18 service and must
    // be checked before the ordinary superuser 53-step smoke runs.
    const leftover = await admin.query(`SELECT count(*)::int AS n FROM pg_roles
      WHERE rolname='fawri_cashier_retirement_owner'`);
    if (leftover.rows[0]?.n === 1) {
      await admin.query("DROP ROLE fawri_cashier_retirement_owner");
    }
    if (roleCreated) await admin.query(`DROP ROLE "${ROLE}"`);
    const remaining = await admin.query(`SELECT
      (SELECT count(*)::int FROM pg_roles WHERE rolname=$1) AS roles,
      (SELECT count(*)::int FROM pg_database WHERE datname=$2) AS databases`,
      [ROLE,DB]);
    assert.deepEqual(remaining.rows[0], {roles:0,databases:0});
    const unowned = await admin.query(`SELECT count(*)::int AS n FROM pg_roles
      WHERE rolname='fawri_cashier_retirement_owner'`);
    assert.equal(unowned.rows[0]?.n,0,"FT01_DISPOSABLE_GLOBAL_ROLE_LEAK");
    await admin.end();
  }
}
await main();
