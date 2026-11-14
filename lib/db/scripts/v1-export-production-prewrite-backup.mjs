/**
 * Bounded READ-ONLY export of exact EMPTY first-commercial Neon branch.
 * Never performs production DDL/DML or logs connection parameters.
 * Workflow stays inert until explicit owner-controlled Actions opt-in.
 * Real commercial data/media recovery is a separate post-provision gate.
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
  FIRST_PREWRITE_TARGET, validateProductionPrewriteBackupUrl,
  assertProductionPrewriteCatalog,
} from "../../../scripts/lib/v1-production-prewrite-backup-safety.mjs";
import { sealIsolatedDump, openIsolatedDump }
  from "../../../scripts/lib/v1-isolated-neon-dump-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function fail(code) { const error = new Error(code); error.code = code; throw error; }
const preimageSQL = `
  SELECT current_database()::text AS db,
         session_user::text AS actor,
         current_setting('server_version_num')::integer / 10000 AS major,
         (SELECT count(*)::int FROM pg_roles WHERE rolname IN
           ('fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'))
           AS runtime_roles,
         (SELECT count(*)::int FROM pg_class c
           JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S'))
           AS public_relations,
         (SELECT count(*)::int FROM pg_class c
           JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='drizzle' AND c.relname='__drizzle_migrations')
           AS migration_relations
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
    fail("V1_PREWRITE_PG18_CLIENT_" + category);
  }
  return String(result.stdout ?? "");
}
function localTarget() {
  let url;
  try { url = new URL(process.env.DATABASE_URL ?? ""); }
  catch { fail("V1_PREWRITE_LOCAL_PG18_NOT_CONFIGURED"); }
  if (url.hostname !== "127.0.0.1" || url.port !== "5432" ||
      url.pathname !== "/fawri_ci" || url.username !== "fawri_ci" ||
      url.password !== "fawri_ci" || url.search || url.hash) {
    fail("V1_PREWRITE_LOCAL_RESTORE_TARGET_REJECTED");
  }
  return {host:"127.0.0.1",port:5432,user:"fawri_ci",
    database:"fawri_ci",password:"fawri_ci",sslmode:"disable"};
}
async function main() {
  assert.equal(process.argv.length, 2);
  const url = process.env.FAWRI_V1_PRODUCTION_PREWRITE_DUMP_URL;
  const target = validateProductionPrewriteBackupUrl(url);
  const passphrase = process.env.FAWRI_V1_PRODUCTION_PREWRITE_PASSPHRASE;
  if (typeof passphrase !== "string" || passphrase.length < 24) {
    fail("V1_PREWRITE_ENCRYPTION_PASSPHRASE_REQUIRED");
  }
  const local = localTarget();
  const remote = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  let connected = false;
  let temporary;
  try {
    await remote.connect();
    connected = true;
    assertProductionPrewriteCatalog((await remote.query(preimageSQL)).rows[0]);
    // No remote SQL modifications. An empty public catalog and zero runtime
    // roles are mandatory, even if the owner has a privileged DB role.
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-v1-prewrite-"));
    const localArchive = "/safe-out/production-prewrite.pgcustom";
    const plainPath = path.join(temporary, "production-prewrite.pgcustom");
    dockerPostgres(temporary, {
      ...target, sslmode:"require",
    }, ["pg_dump", "--format=custom", "--no-password",
       "--file=" + localArchive]);
    const raw = fs.readFileSync(plainPath);
    if (raw.length < 100 || raw.subarray(0,5).toString() !== "PGDMP") {
      fail("V1_PREWRITE_ARCHIVE_NOT_PG_CUSTOM");
    }
    const toc = dockerPostgres(temporary, local, ["pg_restore", "--list", localArchive]);
    if (!toc.includes("PostgreSQL database dump") ||
        !toc.includes("Format: CUSTOM")) {
      fail("V1_PREWRITE_ARCHIVE_TOC_INVALID");
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
      // The restored local role is disposable fawri_ci, unlike real owner.
      assertProductionPrewriteCatalog({...catalog, actor: FIRST_PREWRITE_TARGET.owner_login});
    } finally { await restored.end().catch(() => {}); }
    assertProductionPrewriteCatalog((await remote.query(preimageSQL)).rows[0]);
    const sealed = sealIsolatedDump(raw, passphrase);
    if (!openIsolatedDump(sealed,passphrase).equals(raw)) {
      fail("V1_PREWRITE_ENCRYPTED_ROUNDTRIP_FAILED");
    }
    const out = path.join(root, "lib/db/v1-production-prewrite-export-out");
    fs.mkdirSync(out, {mode:0o700});
    const archive = "fawri-v1-production-prewrite.pgcustom.enc";
    fs.writeFileSync(path.join(out, archive), sealed, {flag:"wx",mode:0o600});
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({
      format:"fawri-empty-production-prewrite-pg18-aes256gcm-v1",
      source_project:FIRST_PREWRITE_TARGET.project_id,
      source_branch:FIRST_PREWRITE_TARGET.branch_id,
      source_database:FIRST_PREWRITE_TARGET.database,
      source_endpoint:FIRST_PREWRITE_TARGET.endpoint_host,
      source_commit:process.env.GITHUB_SHA ?? null,
      target_scope:"EXACT_EMPTY_PREWRITE_ONLY",
      public_relations:0, runtime_roles:0,
      custom_archive_sha256:sha256(raw),
      custom_archive_bytes:raw.length,
      encrypted_sha256:sha256(sealed),
      encrypted_bytes:sealed.length,
      crypto:"AES-256-GCM / scrypt N16384 r8 p1",
      independently_restored_pg18_prewrite:true,
      offsite_verified:false,
      hosted_full_schema_recovery_accepted:false,
      media_recovery_accepted:false,
      secrets_in_artifact:false,
    },null,2)+"\n",{flag:"wx",mode:0o600});
    console.log("V1_PRODUCTION_EMPTY_PREWRITE_PG18_EXPORT_RESTORED_AND_ENCRYPTED");
    console.log("V1_PREWRITE_BACKUP_OFFSITE_READBACK_STILL_REQUIRED");
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
    error.code.startsWith("V1_PREWRITE_") ? error.code :
    "V1_PREWRITE_EXPORT_FAILED_DETAILS_REDACTED");
  process.exitCode=1;
}
