/**
 * Rollback-only PostgreSQL 18 proof of held Google merchant legal evidence.
 * Synthetic disposable local runner only. NEVER points at hosted Neon.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const sql = readFileSync(
  new URL("../first-commercial/held/v1_google_merchant_legal_consent_source.sql", import.meta.url),
  "utf8",
);
const REVIEWED_BLOB_SHA = "d92165862bc9782395df734fba9a5f09bd039967";
const sha = createHash("sha1").update(
  "blob " + Buffer.byteLength(sql) + "\0" + sql,
).digest("hex");
assert.equal(sha, REVIEWED_BLOB_SHA, "GOOGLE_LEGAL_HELD_SQL_DRIFT");
assert.equal(process.argv.length, 2, "NO_CLI_ARGS");
assert.equal(process.env.GITHUB_ACTIONS, "true", "CI_ONLY");
assert.equal(process.env.GITHUB_REPOSITORY, "nora953/fawri-production-source", "WRONG_REPO");
assert.equal(process.env.FAWRI_ALLOW_LOCAL_GOOGLE_CONSENT_PG18, "1", "LOCAL_OPT_IN_REQUIRED");
assert.equal(process.env.NODE_ENV, "test", "TEST_ONLY");
const uri = new URL(process.env.DATABASE_URL || "");
assert.deepEqual(
  [uri.protocol, uri.hostname, uri.port, uri.pathname, uri.username,
    decodeURIComponent(uri.password), uri.search, uri.hash],
  ["postgresql:", "127.0.0.1", "5432", "/fawri_ci", "fawri_ci",
    "fawri_ci", "", ""],
  "DISPOSABLE_LOCAL_DB_ONLY",
);
assert.ok(sql.startsWith("-- HELD / REVIEW REQUIRED / NOT IN DRIZZLE LEDGER."));
assert.match(sql, /\nBEGIN;\n/);
assert.match(sql, /\nCOMMIT;\n$/);
assert.equal(sql.match(/\bCOMMIT;/g)?.length, 1);
const local = sql
  .replace("\nBEGIN;\n", "\n")
  .replace(/\nCOMMIT;\n$/, "\n")
  .replace("current_database() <> 'fawri'", "current_database() <> 'fawri_ci'")
  .replace("session_user <> 'fawri_owner'", "session_user <> 'fawri_ci'");

const db = new pg.Client({connectionString: uri.toString(), connectionTimeoutMillis: 3000});
await db.connect();
let transactionOpen = false;
try {
  const version = Number((await db.query("SHOW server_version_num")).rows[0].server_version_num);
  assert.ok(version >= 180000 && version < 190000, "POSTGRESQL_18_REQUIRED");
  assert.equal((await db.query("SELECT current_user AS role, current_database() AS db"))
    .rows[0].role, "fawri_ci");
  await db.query("BEGIN");
  transactionOpen = true;
  await db.query("CREATE TABLE public.accounts (id text PRIMARY KEY)");
  await db.query("CREATE TABLE public.merchants (id text PRIMARY KEY)");
  await db.query(
    "CREATE ROLE fawri_auth_issuer LOGIN NOSUPERUSER NOBYPASSRLS " +
    "NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION",
  );
  await db.query("GRANT INSERT ON public.merchants TO fawri_auth_issuer");
  await db.query(local);
  const legacy = (await db.query(
    "INSERT INTO public.merchants(id) VALUES ('legacy-one') " +
    "RETURNING google_signup_terms_version,google_signup_privacy_version,google_signup_consented_at",
  )).rows[0];
  assert.deepEqual(legacy, {
    google_signup_terms_version: null,
    google_signup_privacy_version: null,
    google_signup_consented_at: null,
  });
  const negative = async (statement, values, expectedCode) => {
    await db.query("SAVEPOINT google_consent_negative");
    let caught = null;
    try { await db.query(statement, values); } catch (error) { caught = error; }
    await db.query("ROLLBACK TO SAVEPOINT google_consent_negative");
    await db.query("RELEASE SAVEPOINT google_consent_negative");
    assert.equal(caught?.code, expectedCode, "EXPECTED_DATABASE_REJECTION");
  };
  await negative(
    "INSERT INTO public.merchants(id, google_signup_terms_version) VALUES ($1,$2)",
    ["partial", "2026.11.20"], "23514",
  );
  await db.query(
    "INSERT INTO public.merchants(id,google_signup_terms_version,google_signup_privacy_version,google_signup_consented_at) " +
    "VALUES($1,$2,$3,now())",
    ["google-one", "terms.2026-11", "privacy.2026-11"],
  );
  await negative(
    "UPDATE public.merchants SET google_signup_terms_version=$1 WHERE id='google-one'",
    ["terms.tampered"], "P0001",
  );
  const saved = (await db.query(
    "SELECT google_signup_terms_version,google_signup_privacy_version,google_signup_consented_at " +
    "FROM public.merchants WHERE id='google-one'",
  )).rows[0];
  assert.equal(saved.google_signup_terms_version, "terms.2026-11");
  assert.equal(saved.google_signup_privacy_version, "privacy.2026-11");
  assert.ok(saved.google_signup_consented_at instanceof Date);
  console.log("V1_GOOGLE_LEGAL_CONSENT_PG18_NO_BACKFILL_PARTIAL_REJECT_IMMUTABLE_PASS");
} finally {
  if (transactionOpen) await db.query("ROLLBACK");
  const leftover = (await db.query(
    "SELECT to_regclass('public.merchants')::text AS merchants, " +
    "to_regclass('public.accounts')::text AS accounts",
  )).rows[0];
  assert.deepEqual(leftover, {merchants: null, accounts: null});
  await db.end();
  console.log("V1_GOOGLE_LEGAL_CONSENT_NO_NEON_ROLLBACK_PASS");
}
