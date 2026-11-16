/**
 * Bounded READ-ONLY export of exact EMPTY first-commercial Neon branch.
 * Never performs production DDL/DML or logs connection parameters.
 * Workflow stays inert until explicit owner-controlled Actions opt-in.
 * Independent offsite readback and media recovery remain separate gates.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  POSTSCHEMA_TARGET, validatePostSchemaUrl,
  assertPostSchemaCatalog,
} from "../../../scripts/lib/v1-production-postschema-backup-safety.mjs";
import { sealIsolatedDump, openIsolatedDump }
  from "../../../scripts/lib/v1-isolated-neon-dump-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function fail(code) { const error = new Error(code); error.code = code; throw error; }
const preimageSQL = `
 SELECT current_database()::text AS db,
        session_user::text AS actor,
        current_setting('server_version_num')::integer/10000 AS major,
        (SELECT COUNT(*)::int FROM drizzle.__drizzle_migrations) migrations,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n
          ON n.oid=c.relnamespace WHERE n.nspname='public'
          AND c.relkind IN('r','p')) public_tables,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n
          ON n.oid=c.relnamespace WHERE n.nspname='public'
          AND c.relkind IN('r','p') AND c.relrowsecurity) rls_tables,
        (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public') rls_policies,
        (SELECT COUNT(*)::int FROM public.merchants) merchants,
        (SELECT COUNT(*)::int FROM public.accounts) accounts,
        (SELECT COUNT(*)::int FROM public.orders) orders,
        (SELECT COUNT(*)::int FROM public.cashier_device_streams) cashier_streams,
        (SELECT COUNT(*)::int FROM public.cashier_operation_receipts) cashier_receipts,
        (SELECT COUNT(*)::int FROM pg_roles WHERE rolname IN
          ('fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer')
          AND rolcanlogin AND NOT (rolinherit OR rolsuper OR rolbypassrls
          OR rolcreaterole OR rolcreatedb OR rolreplication)) safe_login_roles,
        EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fawri_cashier_retirement_writer'
          AND NOT rolcanlogin) dormant_cashier_role,
        EXISTS (SELECT 1 FROM pg_trigger t
          WHERE t.tgname='cashier_device_streams_merchant_deleted'
            AND NOT t.tgisinternal AND t.tgenabled='O'
            AND t.tgrelid=to_regclass('public.merchants')
            AND t.tgfoid=to_regprocedure('public.fawri_sequence_merchant_deleted()'))
          AS legacy_delete_trigger,
        to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()') IS NOT NULL
          AS v1_pos_guard_installed
`;

function dockerPostgres(folder, variables, args) {
  const names = ["PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD", "PGSSLMODE"];
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME,
    PGHOST: variables.host, PGPORT: String(variables.port),
    PGUSER: variables.user, PGDATABASE: variables.database,
    PGPASSWORD: variables.password, PGSSLMODE: variables.sslmode,
  };
  const result = spawnSync("docker", [
    "run", "--rm", "--network=host", "--user=0:0",
    "-v", folder + ":/safe-out",
    ...names.flatMap(name => ["-e", name]),
    "postgres:18-alpine", ...args,
  ], { env, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    // Provider CLI stderr can contain database URLs: never output it.
    const msg = String(result.stderr ?? "").toLowerCase();
    const category = /permission denied|insufficient privilege|must be owner/.test(msg)
      ? "ACL" : /password authentication failed|no password supplied/.test(msg)
      ? "AUTH" : /could not translate host name|name resolution/.test(msg)
      ? "DNS" : /connection refused|timed out|timeout expired/.test(msg)
      ? "NETWORK" : /ssl|certificate|tls/.test(msg)
      ? "TLS" : "UNCLASSIFIED";
    fail("V1_POSTSCHEMA_PG18_CLIENT_" + category);
  }
  return String(result.stdout ?? "");
}
function localTarget() {
  let url;
  try { url = new URL(process.env.DATABASE_URL ?? ""); }
  catch { fail("V1_POSTSCHEMA_LOCAL_PG18_NOT_CONFIGURED"); }
  if (url.hostname !== "127.0.0.1" || url.port !== "5432" ||
      url.pathname !== "/fawri_ci" || url.username !== "fawri_ci" ||
      url.password !== "fawri_ci" || url.search || url.hash) {
    fail("V1_POSTSCHEMA_LOCAL_RESTORE_TARGET_REJECTED");
  }
  return {host:"127.0.0.1",port:5432,user:"fawri_ci",
    database:"fawri_ci",password:"fawri_ci",sslmode:"disable"};
}
async function main() {
  assert.equal(process.argv.length, 2);
  const url = process.env.FAWRI_V1_PRODUCTION_POSTSCHEMA_DUMP_URL;
  const target = validatePostSchemaUrl(url);
  const passphrase = process.env.FAWRI_V1_PRODUCTION_POSTSCHEMA_PASSPHRASE;
  if (typeof passphrase !== "string" || passphrase.length < 24) {
    fail("V1_POSTSCHEMA_ENCRYPTION_PASSPHRASE_REQUIRED");
  }
  const local = localTarget();
  const remote = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  let connected = false;
  let temporary;
  try {
    await remote.connect();
    connected = true;
    assertPostSchemaCatalog((await remote.query(preimageSQL)).rows[0]);
    // No remote SQL modifications. Exact existing 54-stage schema and safe three-role catalog required.
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-v1-postschema-"));
    const localArchive = "/safe-out/production-postschema54.pgcustom";
    const plainPath = path.join(temporary, "production-postschema54.pgcustom");
    dockerPostgres(temporary, {
      ...target, sslmode:"require",
    }, ["pg_dump", "--format=custom", "--no-password",
       "--file=" + localArchive]);
    const raw = fs.readFileSync(plainPath);
    if (raw.length < 100 || raw.subarray(0,5).toString() !== "PGDMP") {
      fail("V1_POSTSCHEMA_ARCHIVE_NOT_PG_CUSTOM");
    }
    const toc = dockerPostgres(temporary, local, ["pg_restore", "--list", localArchive]);
    if (!toc.includes("TOC Entries:") ||
        !toc.includes("Format: CUSTOM")) {
      fail("V1_POSTSCHEMA_ARCHIVE_TOC_INVALID");
    }
    dockerPostgres(temporary, local, [
      "pg_restore", "--dbname=fawri_ci", "--no-owner", "--no-acl",
      "--single-transaction", "--exit-on-error", localArchive,
    ]);
    const restored = new pg.Client({connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000});
    try {
      await restored.connect();
      const catalog = (await restored.query(preimageSQL)).rows[0];
      // Validate disposable restore identity explicitly; its local database
      // and role intentionally differ from the production preimage.
      assert.equal(catalog.db, "fawri_ci");
      assert.equal(catalog.actor, "fawri_ci");
      assertPostSchemaCatalog(catalog,{restored:true});
    } finally { await restored.end().catch(() => {}); }
    assertPostSchemaCatalog((await remote.query(preimageSQL)).rows[0]);
    const sealed = sealIsolatedDump(raw, passphrase);
    if (!openIsolatedDump(sealed,passphrase).equals(raw)) {
      fail("V1_POSTSCHEMA_ENCRYPTED_ROUNDTRIP_FAILED");
    }
    const out = path.join(root, "lib/db/v1-production-postschema-export-out");
    fs.mkdirSync(out, {mode:0o700});
    const archive = "fawri-v1-production-postschema54.pgcustom.enc";
    fs.writeFileSync(path.join(out, archive), sealed, {flag:"wx",mode:0o600});
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({
      format:"fawri-production-postschema54-pg18-aes256gcm-v1",
      source_project:POSTSCHEMA_TARGET.project_id,
      source_branch:POSTSCHEMA_TARGET.branch_id,
      source_database:POSTSCHEMA_TARGET.database,
      source_endpoint:POSTSCHEMA_TARGET.endpoint_host,
      source_commit:process.env.GITHUB_SHA ?? null,
      target_scope:"EXACT_FRESH_SCHEMA54_ZERO_MERCHANTS_PRE_POS_OFF",
      public_tables:99, rls_tables:79, rls_policies:78, restored_ledger:54, global_roles_not_in_pg_dump:true,
      custom_archive_sha256:sha256(raw),
      custom_archive_bytes:raw.length,
      encrypted_sha256:sha256(sealed),
      encrypted_bytes:sealed.length,
      crypto:"AES-256-GCM / scrypt N16384 r8 p1",
      independently_restored_pg18_postschema54:true,
      offsite_verified:false,
      hosted_full_schema_recovery_accepted:false,
      media_recovery_accepted:false,
      secrets_in_artifact:false,
    },null,2)+"\n",{flag:"wx",mode:0o600});
    console.log("V1_PRODUCTION_POSTSCHEMA54_PG18_EXPORT_RESTORED_AND_ENCRYPTED");
    console.log("V1_POSTSCHEMA_BACKUP_OFFSITE_READBACK_STILL_REQUIRED");
    console.log("V1_PRODUCTION_SQL_WRITES_NONE");
  } finally {
    if (connected) await remote.end().catch(() => {});
    if (temporary) fs.rmSync(temporary, {recursive:true,force:true});
  }
}
try { await main(); }
catch (error) {
  // Do not show driver errors, URLs, credentials, raw queries or provider logs.
  console.error(typeof error?.code === "string" &&
    error.code.startsWith("V1_POSTSCHEMA_") ? error.code :
    "V1_POSTSCHEMA_EXPORT_FAILED_DETAILS_REDACTED");
  process.exitCode=1;
}
