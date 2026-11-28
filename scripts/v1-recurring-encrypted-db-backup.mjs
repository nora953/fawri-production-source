/**
 * HELD G5 recurring database exporter. Not enabled or scheduled.
 * Requires separate owner approval and a dedicated, read-only backup login.
 * No owner URL, no automatic role provisioning, no SQL mutation, no plaintext file.
 * A valid local encrypted archive is NOT an offsite backup or restoration.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { sealIsolatedDump, openIsolatedDump } from "./lib/v1-isolated-neon-dump-safety.mjs";

export const BACKUP_TARGET = Object.freeze({
  host: "ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech",
  database: "fawri",
  role: "fawri_v1_recurring_backup_reader",
});
const MAX_DUMP = 128 * 1024 * 1024;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const requireValue = (ok, code) => { if (!ok) throw new Error(code); };

export function backupClientEnv(env) {
  requireValue(env.FAWRI_V1_RECURRING_DB_EXPORT_APPROVED === "1", "G5_RECURRING_EXPORT_NOT_APPROVED");
  return readerClientEnv(env);
}

function readerClientEnv(env) {
  let url;
  try { url = new URL(env.FAWRI_V1_RECURRING_BACKUP_READER_URL || ""); }
  catch { throw new Error("G5_RECURRING_READER_URL_INVALID"); }
  requireValue(["postgres:", "postgresql:"].includes(url.protocol)
    && url.hostname === BACKUP_TARGET.host
    && ["", "5432"].includes(url.port)
    && decodeURIComponent(url.username) === BACKUP_TARGET.role
    && decodeURIComponent(url.pathname) === "/" + BACKUP_TARGET.database
    && url.password && !url.hash, "G5_RECURRING_WRONG_TARGET_OR_ROLE");
  const keys = [...url.searchParams.keys()];
  requireValue(keys.length === new Set(keys).size
    && keys.every(k => ["sslmode", "channel_binding"].includes(k))
    && url.searchParams.get("sslmode") === "verify-full"
    && (!url.searchParams.has("channel_binding") || url.searchParams.get("channel_binding") === "require"),
    "G5_RECURRING_TLS_VERIFY_FULL_REQUIRED");
  // Construct fresh environment; never inherit PG routing/service/options or other secrets.
  return {
    PATH: env.PATH, HOME: env.HOME,
    PGHOST: BACKUP_TARGET.host, PGPORT: "5432", PGDATABASE: BACKUP_TARGET.database,
    PGUSER: BACKUP_TARGET.role, PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: "verify-full", PGSSLROOTCERT: "system", PGCHANNELBINDING: "require",
    PGCONNECT_TIMEOUT: "10", PGOPTIONS: "-c default_transaction_read_only=on",
  };
}

// Require a dedicated direct role, with no memberships, no app-data DML,
// no database/schema creation, temporary object creation, large-object
// mutation, or writable sequence privilege.
// A full RLS-protected backup needs explicit approved bypass capability;
// if the provider cannot provision this exact restricted role, stop.
export const READER_PREFLIGHT_SQL = `
SELECT CASE WHEN
 current_database() = 'fawri'
 AND session_user = 'fawri_v1_recurring_backup_reader'
 AND current_user = session_user
 AND current_setting('server_version_num')::int / 10000 = 18
 AND current_setting('transaction_read_only') = 'on'
 AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname=session_user
   AND r.rolcanlogin AND r.rolbypassrls AND NOT
   (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit))
 AND NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=session_user)
 AND NOT has_database_privilege(current_database(),'CREATE,TEMPORARY')
 AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='pg_catalog'
   AND p.proname IN ('lo_creat','lo_create','lo_from_bytea','lo_import','lo_put',
     'lo_unlink','lo_truncate','lo_truncate64','lowrite')
   AND has_function_privilege(p.oid,'EXECUTE'))
 AND NOT EXISTS (SELECT 1 FROM pg_namespace n
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND has_schema_privilege(n.oid,'CREATE'))
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND c.relkind IN ('r','p','m','f')
   AND (has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
   OR has_any_column_privilege(c.oid,'INSERT,UPDATE,REFERENCES')
   OR NOT has_table_privilege(c.oid,'SELECT')))
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND c.relkind='S' AND (has_sequence_privilege(c.oid,'UPDATE,USAGE') OR NOT has_sequence_privilege(c.oid,'SELECT')))
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_roles r ON c.relowner=r.oid
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND r.rolname=session_user)
 AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND p.prosecdef AND has_function_privilege(p.oid,'EXECUTE'))
 THEN 'G5_READER_ACCEPTED' ELSE 'G5_READER_DENIED' END;
`;

export function dumpArguments() {
  // Do not use --enable-row-security: silently omitting protected rows is unacceptable.
  return ["--format=custom","--compress=6","--no-password","--dbname=fawri"];
}
function checkedRun(command,args,env,maxBuffer,timeout) {
  const result = spawnSync(command,args,{env,timeout,maxBuffer,stdio:["ignore","pipe","pipe"]});
  requireValue(!result.error && result.status === 0, "G5_RECURRING_SUBPROCESS_FAILED");
  return result.stdout;
}
function verifyReader(env) {
  const preflight = checkedRun("psql",["-X","-w","-Atq","-v","ON_ERROR_STOP=1","-c",READER_PREFLIGHT_SQL],env,8192,20000);
  requireValue(preflight.toString().trim() === "G5_READER_ACCEPTED","G5_RECURRING_READER_NOT_ACCEPTED");
}
export function sealRecurringDump(raw, passphrase, createdAt) {
  requireValue(Buffer.isBuffer(raw) && raw.length >= 100 && raw.length <= MAX_DUMP, "G5_RECURRING_DUMP_SIZE");
  requireValue(typeof passphrase === "string" && passphrase.length >= 24, "G5_RECURRING_SECRET_REQUIRED");
  const encrypted = sealIsolatedDump(raw,passphrase);
  const reopened = openIsolatedDump(encrypted,passphrase);
  try { requireValue(reopened.equals(raw), "G5_RECURRING_ENCRYPTION_ROUNDTRIP_FAILED"); }
  finally { reopened.fill(0); }
  return {encrypted, manifest:{
    format:"fawri-v1-recurring-pg18-aes256gcm-v1",
    created_at:createdAt, database:BACKUP_TARGET.database,
    source_commit: null,
    custom_archive_bytes:raw.length, custom_archive_sha256:sha(raw),
    encrypted_bytes:encrypted.length, encrypted_sha256:sha(encrypted),
    encryption_roundtrip_verified:true,
    offsite_verified:false, isolated_restore_verified:false,
    media_pair_verified:false, commercial_recovery_accepted:false,
  }};
}
function main() {
  if (process.argv.length === 3 && process.argv[2] === "--reader-preflight") {
    verifyReader(readerClientEnv(process.env));
    console.log("G5_READER_ACCEPTED");
    return;
  }
  requireValue(process.argv.length === 2, "G5_RECURRING_NO_ARGUMENTS_ALLOWED");
  const env = backupClientEnv(process.env);
  const pass = process.env.FAWRI_V1_RECURRING_BACKUP_PASSPHRASE;
  requireValue(typeof pass === "string" && pass.length >= 24, "G5_RECURRING_SECRET_REQUIRED");
  const version = checkedRun("pg_dump",["--version"],{PATH:env.PATH,HOME:env.HOME},4096,5000).toString();
  requireValue(/^pg_dump \(PostgreSQL\) 18(?:\.|\s)/.test(version),"G5_RECURRING_PG18_CLIENT_REQUIRED");
  verifyReader(env);
  const createdAt = new Date().toISOString(); // dump starts after read-only preflight
  const raw = checkedRun("pg_dump",dumpArguments(),env,MAX_DUMP,180000);
  let out;
  try {
    const {encrypted,manifest} = sealRecurringDump(raw,pass,createdAt);
    out = fs.mkdtempSync(path.join(os.tmpdir(),"fawri-recurring-encrypted-"));
    fs.chmodSync(out,0o700);
    fs.writeFileSync(path.join(out,"database.pgcustom.enc"),encrypted,{flag:"wx",mode:0o600});
    fs.writeFileSync(path.join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
    console.log(JSON.stringify({state:"ENCRYPTED_LOCAL_ONLY",directory:out,offsite:false,restoreAccepted:false}));
  } catch(error) {
    if(out) fs.rmSync(out,{recursive:true,force:true});
    throw error;
  } finally { raw.fill(0); }
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  try { main(); } catch {
    const preflightOnly = process.argv.length === 3 && process.argv[2] === "--reader-preflight";
    console.error(preflightOnly ? "G5_RECURRING_READER_PREFLIGHT_FAILED" : "G5_RECURRING_EXPORT_REFUSED_OR_FAILED");
    process.exitCode=1;
  }
}
