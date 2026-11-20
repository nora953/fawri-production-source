/**
 * Google identity candidate: disposable LOCAL PG18 proof only.
 * Cannot connect to Neon, Render or any user database. No release authorization.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const source = readFileSync(new URL("../first-commercial/held/v1_google_oidc_merchant_identity.sql", import.meta.url), "utf8");
const pinnedGitBlob = "804ee192999f907b6a87624b9ceedb8c4beedf25";
const calculated = createHash("sha1").update("blob " + Buffer.byteLength(source) + "\0" + source).digest("hex");
assert.equal(calculated, pinnedGitBlob, "GOOGLE_HELD_SOURCE_SHA_DRIFT");

function exactLocalTarget() {
  assert.equal(process.argv.length, 2, "NO_TEST_ARGS");
  assert.equal(process.env.GITHUB_ACTIONS, "true", "CI_ONLY");
  assert.equal(process.env.GITHUB_REPOSITORY, "nora953/fawri-production-source", "REPO_NOT_ALLOWED");
  assert.equal(process.env.FAWRI_ALLOW_GOOGLE_HELD_LOCAL_PG18, "1", "LOCAL_TEST_OPT_IN_REQUIRED");
  const u = new URL(process.env.DATABASE_URL || "");
  assert.equal(u.protocol, "postgresql:");
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, "5432");
  assert.equal(u.pathname, "/fawri_ci");
  assert.equal(decodeURIComponent(u.username), "fawri_ci");
  assert.equal(decodeURIComponent(u.password), "fawri_ci");
  assert.equal(u.search, "");
  assert.equal(u.hash, "");
  return u.toString();
}

function localize() {
  const header = "BEGIN;\nSET LOCAL statement_timeout = '20s';\nSET LOCAL lock_timeout = '3s';\n";
  assert.ok(source.includes(header), "REVIEWED_TRANSACTION_HEADER_DRIFT");
  assert.match(source, /\nCOMMIT;\n$/, "REVIEWED_TRANSACTION_END_DRIFT");
  const sql = source.replace(header, "").replace(/\nCOMMIT;\n$/, "\n")
    .replace("current_database() <> 'fawri'", "current_database() <> 'fawri_ci'")
    .replace("session_user <> 'fawri_owner'", "session_user <> 'fawri_ci'");
  assert.ok(sql.includes("current_database() <> 'fawri_ci'"));
  assert.ok(sql.includes("session_user <> 'fawri_ci'"));
  return sql;
}

async function mustReject(db, statement, state, label) {
  await db.query("SAVEPOINT google_negative");
  try {
    await assert.rejects(db.query(statement), e => e?.code === state, label);
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT google_negative");
    await db.query("RELEASE SAVEPOINT google_negative");
  }
}

async function main() {
  const db = new pg.Client({ connectionString: exactLocalTarget(), ssl: false, connectionTimeoutMillis: 3000 });
  await db.connect();
  let begun = false;
  try {
    const pre = (await db.query("SELECT current_database() AS db, current_setting('server_version_num')::int / 10000 AS major, (SELECT count(*)::int FROM pg_roles WHERE rolname IN ('fawri_auth_issuer','fawri_restricted_runtime','fawri_operator_issuer')) AS roles, to_regclass('public.accounts')::text AS accounts")).rows[0];
    assert.deepEqual(pre, { db: "fawri_ci", major: 18, roles: 0, accounts: null }, "FRESH_LOCAL_PG18_REQUIRED");
    await db.query("BEGIN"); begun = true;
    await db.query("SET LOCAL statement_timeout='20s'");
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("CREATE TYPE public.account_kind AS ENUM ('merchant','admin')");
    await db.query("CREATE TYPE public.account_state AS ENUM ('active','closed')");
    await db.query("CREATE TABLE public.accounts (id text PRIMARY KEY, kind public.account_kind NOT NULL, state public.account_state NOT NULL DEFAULT 'active', phone text, phone_verified boolean NOT NULL DEFAULT false, CONSTRAINT accounts_active_phone_required_check CHECK (state = 'closed'::public.account_state OR phone IS NOT NULL))");
    // Match the real application preimage: one phone cannot be held by two
    // accounts, regardless of whether either was created via Google OIDC.
    await db.query("CREATE UNIQUE INDEX accounts_phone_unique ON public.accounts (phone)");
    for (const role of ["fawri_auth_issuer","fawri_restricted_runtime","fawri_operator_issuer"]) {
      await db.query("CREATE ROLE " + role + " LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE");
    }
    await db.query("GRANT SELECT, INSERT, UPDATE ON public.accounts TO fawri_auth_issuer");
    await db.query(localize());
    await mustReject(db, "INSERT INTO public.accounts (id,kind) VALUES ('a-bypass','admin')", "23514", "active admin must have phone");
    await mustReject(db, "INSERT INTO public.accounts (id,kind) VALUES ('m-bypass','merchant')", "23514", "merchant cannot bypass Google and phone");
    await mustReject(db, "INSERT INTO public.accounts(id,kind,google_subject) VALUES ('half','merchant','12345')", "23514", "subject cannot have missing issuer");
    await mustReject(db, "INSERT INTO public.accounts(id,kind,google_issuer) VALUES ('half2','merchant','https://accounts.google.com')", "23514", "issuer cannot have missing subject");
    await mustReject(db, "INSERT INTO public.accounts(id,kind,google_issuer,google_subject) VALUES ('bad','merchant','https://evil.invalid','12345')", "23514", "wrong issuer refused");
    await mustReject(db, "INSERT INTO public.accounts(id,kind,phone,google_issuer,google_subject) VALUES ('admin-google','admin','+15550000001','https://accounts.google.com','12345')", "23514", "admin Google-link refused");
    await db.query("INSERT INTO public.accounts(id,kind,google_issuer,google_subject) VALUES ('google-merchant-a','merchant','https://accounts.google.com','123456789012345678901')");
    const row = (await db.query("SELECT phone,phone_verified,google_subject FROM public.accounts WHERE id='google-merchant-a'")).rows[0];
    assert.deepEqual(row, { phone: null, phone_verified: false, google_subject: "123456789012345678901" });
    await mustReject(db, "INSERT INTO public.accounts(id,kind,google_issuer,google_subject) VALUES ('google-merchant-b','merchant','https://accounts.google.com','123456789012345678901')", "23505", "Google subject uniqueness");
    await mustReject(db, "UPDATE public.accounts SET google_subject='attacker' WHERE id='google-merchant-a'", "P0001", "Google identity immutable");
    await mustReject(db, "UPDATE public.accounts SET google_issuer=NULL,google_subject=NULL WHERE id='google-merchant-a'", "P0001", "no active silent unlink");
    await db.query("INSERT INTO public.accounts(id,kind,phone) VALUES ('owner-admin','admin','+15550000002'),('legacy-merchant','merchant','+15550000003')");
    await mustReject(db, "INSERT INTO public.accounts(id,kind,phone) VALUES ('google-phone-conflict','merchant','+15550000003')", "23505", "phone must be globally unique across merchant and Google accounts");
    // A first phone proof is allowed only once, as enforced by the existing
    // global phone unique index, not by a browser check or app-side lookup.
    await db.query("UPDATE public.accounts SET phone='+15550000004', phone_verified=true WHERE id='google-merchant-a'");
    await db.query("INSERT INTO public.accounts(id,kind,google_issuer,google_subject) VALUES ('google-merchant-c','merchant','https://accounts.google.com','another-subject-123')");
    await mustReject(db, "UPDATE public.accounts SET phone='+15550000004', phone_verified=true WHERE id='google-merchant-c'", "23505", "concurrent Google claim collision cannot duplicate phone");

    await db.query("UPDATE public.accounts SET state='closed',google_issuer=NULL,google_subject=NULL WHERE id='google-merchant-a'");
    const counts = (await db.query("SELECT (SELECT count(*)::int FROM public.accounts WHERE kind='admin' AND phone IS NOT NULL) AS admins, (SELECT count(*)::int FROM public.accounts WHERE kind='merchant' AND google_subject IS NOT NULL) AS linked, (SELECT count(*)::int FROM public.accounts WHERE id='google-merchant-a' AND state='closed') AS closed")).rows[0];
    assert.deepEqual(counts, { admins: 1, linked: 0, closed: 1 });
    for (const role of ["fawri_restricted_runtime","fawri_operator_issuer"]) {
      const acl = (await db.query("SELECT has_table_privilege($1::text,'public.accounts','SELECT') AS allowed", [role])).rows[0];
      assert.equal(acl.allowed, false, "TENANT_OPERATOR_ACCOUNT_READ_FORBIDDEN");
    }
    console.log("GOOGLE_HELD_LOCAL_PG18_UNIQUE_SUB_PHONE_ADMIN_AND_DENIAL_PASS");
    console.log("GOOGLE_ONLY_ACCOUNT_PHONE_UNVERIFIED_NO_TRIAL_GRANT_PASS");
  } finally {
    if (begun) await db.query("ROLLBACK");
    const clean = (await db.query("SELECT (SELECT count(*)::int FROM pg_roles WHERE rolname IN ('fawri_auth_issuer','fawri_restricted_runtime','fawri_operator_issuer')) AS roles,to_regclass('public.accounts')::text AS accounts")).rows[0];
    assert.deepEqual(clean, { roles: 0, accounts: null }, "DISPOSABLE_TEST_MUST_ROLL_BACK");
    await db.end();
  }
}
await main();
