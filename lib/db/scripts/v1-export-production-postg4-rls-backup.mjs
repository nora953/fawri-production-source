/** Read-only production export after the six owner-approved HELD Google/WhatsApp/trial migrations.
 * Contains sensitive account credential hashes: encrypt, verify restore,
 * upload only ciphertext and secret-free manifest; never log input values.
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
  POSTG4_TARGET, validatePostG4Url,
  assertPostG4Catalog,
} from "../../../scripts/lib/v1-production-postg4-rls-backup-safety.mjs";
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
 (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) public_tables,
 (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) rls_tables,
 (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public') rls_policies,
 (SELECT COUNT(*)::int FROM public.merchants) merchants,
 (SELECT COUNT(*)::int FROM public.accounts) accounts,
 (SELECT COUNT(*)::int FROM public.admin_profiles WHERE role='owner_admin') owners,
 (SELECT COUNT(*)::int FROM public.admin_profiles p JOIN public.accounts a ON a.id=p.account_id WHERE p.role='owner_admin' AND a.kind='admin' AND a.state='active' AND a.phone_verified=TRUE AND p.profile_kind='admin' AND p.enabled=TRUE AND length(a.password_hash)>0) usable_owners,
 (SELECT COUNT(*)::int FROM public.orders) orders,
 (SELECT COUNT(*)::int FROM public.background_jobs) jobs,
 (SELECT COUNT(*)::int FROM public.job_attempts) job_attempts,
 (SELECT COUNT(*)::int FROM public.job_dead_letters) dead_letters,
 (SELECT COUNT(*)::int FROM public.cashier_device_streams) cashier_streams,
 (SELECT COUNT(*)::int FROM public.cashier_operation_receipts) cashier_receipts,
 (SELECT COUNT(*)::int FROM pg_roles WHERE rolname IN ('fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer') AND rolcanlogin AND NOT (rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) safe_login_roles,
 EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fawri_cashier_retirement_writer' AND NOT rolcanlogin) dormant_cashier_role,
 EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname='cashier_device_streams_merchant_deleted' AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgrelid=to_regclass('public.merchants') AND t.tgfoid=to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()')) v1_delete_trigger,
 to_regprocedure('public.fawri_v1_pos_off_merchant_deleted()') IS NOT NULL v1_pos_guard_installed,
 (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relname IN ('job_attempts','job_dead_letters') AND c.relrowsecurity) worker_rls_tables,
 (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('job_attempts','job_dead_letters') AND column_name='merchant_id') worker_tenant_columns
, (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name IN ('google_issuer','google_subject','trial_wa_proof_hash','trial_wa_proof_verified_at','trial_wa_proof_challenge_id')) google_account_columns
, (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='merchants' AND column_name IN ('google_signup_terms_version','google_signup_privacy_version','google_signup_consented_at')) google_consent_columns
, (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_otp_challenges' AND column_name IN ('wa_auth_message_id_hash','wa_auth_accepted_at')) whatsapp_receipt_columns
, (SELECT COUNT(*)::int FROM pg_class WHERE oid IN (to_regclass('public.google_oidc_challenges'),to_regclass('public.merchant_trial_claims'),to_regclass('public.merchant_trial_evidence')) AND relrowsecurity) google_rls_authority_tables
, (SELECT COUNT(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('accounts_google_identity_immutable_guard','merchants_google_signup_consent_immutable_guard')) google_immutable_triggers
, (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public' AND indexname IN ('accounts_google_identity_unique_idx','accounts_trial_wa_proof_challenge_unique','auth_otp_wa_message_id_unique')) google_unique_indexes
, (SELECT COUNT(*)::int FROM public.google_oidc_challenges) google_challenges
, (SELECT COUNT(*)::int FROM public.merchant_trial_claims) trial_claims
, (SELECT COUNT(*)::int FROM public.merchant_trial_evidence) trial_evidence

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
    fail("V1_POSTG4_PG18_CLIENT_" + category);
  }
  return String(result.stdout ?? "");
}
function localTarget() {
  let url;
  try { url = new URL(process.env.DATABASE_URL ?? ""); }
  catch { fail("V1_POSTG4_LOCAL_PG18_NOT_CONFIGURED"); }
  if (url.hostname !== "127.0.0.1" || url.port !== "5432" ||
      url.pathname !== "/fawri_ci" || url.username !== "fawri_ci" ||
      url.password !== "fawri_ci" || url.search || url.hash) {
    fail("V1_POSTG4_LOCAL_RESTORE_TARGET_REJECTED");
  }
  return {host:"127.0.0.1",port:5432,user:"fawri_ci",
    database:"fawri_ci",password:"fawri_ci",sslmode:"disable"};
}
async function main() {
  assert.equal(process.argv.length, 2);
  const url = process.env.FAWRI_V1_PRODUCTION_PREWRITE_DUMP_URL;
  const target = validatePostG4Url(url);
  const passphrase = process.env.FAWRI_V1_PRODUCTION_PREWRITE_PASSPHRASE;
  if (typeof passphrase !== "string" || passphrase.length < 24) {
    fail("V1_POSTG4_ENCRYPTION_PASSPHRASE_REQUIRED");
  }
  const local = localTarget();
  const remote = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  let connected = false;
  let temporary;
  try {
    await remote.connect();
    connected = true;
    assertPostG4Catalog((await remote.query(preimageSQL)).rows[0]);
    // No remote SQL modifications. Require 54-stage journal + six G4 HELD schema objects and restricted roles.
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-v1-postg4-"));
    const localArchive = "/safe-out/production-postg4-rls-postg4.pgcustom";
    const plainPath = path.join(temporary, "production-postg4-rls-postg4.pgcustom");
    dockerPostgres(temporary, {
      ...target, sslmode:"require",
    }, ["pg_dump", "--format=custom", "--no-password",
       "--file=" + localArchive]);
    const raw = fs.readFileSync(plainPath);
    if (raw.length < 100 || raw.subarray(0,5).toString() !== "PGDMP") {
      fail("V1_POSTG4_ARCHIVE_NOT_PG_CUSTOM");
    }
    const toc = dockerPostgres(temporary, local, ["pg_restore", "--list", localArchive]);
    if (!toc.includes("TOC Entries:") ||
        !toc.includes("Format: CUSTOM")) {
      fail("V1_POSTG4_ARCHIVE_TOC_INVALID");
    }
    // PG18 pg_dump excludes GLOBAL roles, yet two historic cashier RLS
    // policies explicitly name the dormant writer. Recreate that name
    // ONLY on the disposable local PG18 for restore; NEVER on Neon.
    const fixtureAdmin = new pg.Client({
      connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,
    });
    try {
      await fixtureAdmin.connect();
      await fixtureAdmin.query(
        "CREATE ROLE fawri_cashier_retirement_writer NOLOGIN NOINHERIT"
      );
      // pg_dump excludes global roles. The NEW G4 auth policies require
      // an issuer role only in disposable restore, never in production.
      await fixtureAdmin.query("CREATE ROLE fawri_auth_issuer NOLOGIN NOINHERIT");
    } finally { await fixtureAdmin.end().catch(()=>{}); }
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
      assertPostG4Catalog(catalog,{restored:true});
    } finally { await restored.end().catch(() => {}); }
    assertPostG4Catalog((await remote.query(preimageSQL)).rows[0]);
    const sealed = sealIsolatedDump(raw, passphrase);
    if (!openIsolatedDump(sealed,passphrase).equals(raw)) {
      fail("V1_POSTG4_ENCRYPTED_ROUNDTRIP_FAILED");
    }
    const out = path.join(root, "lib/db/v1-production-postg4-rls-export-out");
    fs.mkdirSync(out, {mode:0o700});
    const archive = "fawri-v1-production-postg4-rls-postg4.pgcustom.enc";
    fs.writeFileSync(path.join(out, archive), sealed, {flag:"wx",mode:0o600});
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({
      format:"fawri-postg4-worker-rls-pg18-aes256gcm-v1",
      source_project:POSTG4_TARGET.project_id,
      source_branch:POSTG4_TARGET.branch_id,
      source_database:POSTG4_TARGET.database,
      source_endpoint:POSTG4_TARGET.endpoint_host,
      source_commit:process.env.GITHUB_SHA ?? null,
      target_scope:"EXACT_OWNER1_POS_OFF_WORKER_RLS2_POST_G4",
      public_tables:102, rls_tables:84, rls_policies:83, restored_ledger:54, held_g4_schema_files:6, owner_accounts:1, usable_owners:1, global_roles_not_in_pg_dump:true,
      custom_archive_sha256:sha256(raw),
      custom_archive_bytes:raw.length,
      encrypted_sha256:sha256(sealed),
      encrypted_bytes:sealed.length,
      crypto:"AES-256-GCM / scrypt N16384 r8 p1",
      independently_restored_pg18_current_prego_rls:true,
      offsite_verified:false,
      hosted_full_schema_recovery_accepted:false,
      media_recovery_accepted:false,
      secrets_in_artifact:false,
    },null,2)+"\n",{flag:"wx",mode:0o600});
    console.log("V1_PRODUCTION_POSTG4_RLS_PG18_EXPORT_RESTORED_AND_ENCRYPTED");
    console.log("V1_POSTG4_BACKUP_OFFSITE_READBACK_STILL_REQUIRED");
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
    error.code.startsWith("V1_POSTG4_") ? error.code :
    "V1_POSTG4_EXPORT_FAILED_DETAILS_REDACTED");
  process.exitCode=1;
}
