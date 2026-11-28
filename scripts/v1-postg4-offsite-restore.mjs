/** G5: restore an independently downloaded encrypted prelaunch backup.
 * Offline only, no production database URL, no host mount, no network.
 * This validates the archived data/schema, not production ACL recovery.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { openIsolatedDump } from "./lib/v1-isolated-neon-dump-safety.mjs";

const sha256 = data => createHash("sha256").update(data).digest("hex");
const requireValue = (ok, code) => { if (!ok) throw new Error(code); };
const MAX_ARCHIVE = 128 * 1024 * 1024;
const expected = Object.freeze({
  format: "fawri-postg4-worker-rls-pg18-aes256gcm-v1",
  source_project: "crimson-cherry-65705041",
  source_branch: "br-holy-waterfall-b993zglb",
  source_database: "fawri",
  target_scope: "EXACT_OWNER1_POS_OFF_WORKER_RLS2_POST_G4",
  public_tables: 102, rls_tables: 84, rls_policies: 83,
  restored_ledger: 54, held_g4_schema_files: 6, owner_accounts: 1, usable_owners: 1,
  global_roles_not_in_pg_dump: true, secrets_in_artifact: false,
});

export function verifyOffsiteArchive(manifest, ciphertext, passphrase, expectedCipherHash) {
  requireValue(manifest && typeof manifest === "object" && !Array.isArray(manifest), "G5_MANIFEST_INVALID");
  for (const [key, value] of Object.entries(expected)) {
    requireValue(manifest[key] === value, "G5_MANIFEST_SCOPE_MISMATCH");
  }
  requireValue(Buffer.isBuffer(ciphertext) && ciphertext.length <= MAX_ARCHIVE && ciphertext.length === manifest.encrypted_bytes, "G5_CIPHERTEXT_SIZE_MISMATCH");
  requireValue(typeof expectedCipherHash === "string" && /^[0-9a-f]{64}$/.test(expectedCipherHash), "G5_INDEPENDENT_HASH_REQUIRED");
  requireValue(sha256(ciphertext) === expectedCipherHash && manifest.encrypted_sha256 === expectedCipherHash, "G5_CIPHERTEXT_HASH_MISMATCH");
  const plain = openIsolatedDump(ciphertext, passphrase);
  requireValue(plain.length === manifest.custom_archive_bytes && sha256(plain) === manifest.custom_archive_sha256, "G5_PLAINTEXT_HASH_MISMATCH");
  return plain;
}

// No caller-controlled host, database, role, options, volume, or shell source.
// The only input crossing the process boundary is the verified custom archive.
// Run with a locally available official PG18 image (pull separately if needed).
const restoreScript = `set -eu
umask 077
root=$(mktemp -d)
trap 'pg_ctl -D "$root/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$root"' EXIT
cat > "$root/archive"
mkdir "$root/socket"
initdb -D "$root/data" -A trust -U fawri_ci --no-locale >/dev/null
pg_ctl -D "$root/data" -o "-h '' -k $root/socket" -w start >/dev/null
export PGHOST="$root/socket" PGUSER=fawri_ci PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q -c "CREATE ROLE fawri_cashier_retirement_writer NOLOGIN NOINHERIT; CREATE ROLE fawri_auth_issuer NOLOGIN NOINHERIT;"
createdb fawri_ci
export PGDATABASE=fawri_ci
pg_restore --dbname=fawri_ci --no-owner --no-acl --single-transaction --exit-on-error "$root/archive"
psql -X -v ON_ERROR_STOP=1 -Atq <<'SQL'
SELECT CASE WHEN
 current_setting('server_version_num')::int/10000 = 18
 AND (SELECT count(*) FROM drizzle.__drizzle_migrations) = 54
 AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p'))=102
 AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity)=84
 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public')=83
 AND (SELECT count(*) FROM public.merchants)=0
 AND (SELECT count(*) FROM public.orders)=0
 AND (SELECT count(*) FROM public.accounts)=1
 AND (SELECT count(*) FROM public.admin_profiles p JOIN public.accounts a ON a.id=p.account_id WHERE p.role='owner_admin' AND a.kind='admin' AND a.state='active' AND a.phone_verified=true AND p.profile_kind='admin' AND p.enabled=true AND length(a.password_hash)>0)=1
 AND (SELECT count(*) FROM public.merchant_trial_claims)=0
 AND (SELECT count(*) FROM public.merchant_trial_evidence)=0
 THEN 'G5_OFFSITE_ISOLATED_PG18_CATALOG_VERIFIED' ELSE 'G5_OFFSITE_CATALOG_MISMATCH' END;
SQL
`;

export function dockerRestoreArgs() {
  return ["run","--rm","--pull=never","--network=none","--user=postgres","--cap-drop=ALL","--security-opt=no-new-privileges","-i","--entrypoint=sh","postgres:18-alpine","-c",restoreScript];
}

function readBoundedRegularFile(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    requireValue(stat.isFile() && stat.size > 0 && stat.size <= limit, "G5_INPUT_FILE_INVALID");
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}

function main() {
  requireValue(process.argv.length === 4, "G5_EXPECTS_MANIFEST_AND_ENCRYPTED_FILE");
  requireValue(process.env.FAWRI_G5_OFFSITE_RESTORE_APPROVED === "1", "G5_RESTORE_NOT_APPROVED");
  const manifest = JSON.parse(readBoundedRegularFile(process.argv[2], 64 * 1024).toString("utf8"));
  const encrypted = readBoundedRegularFile(process.argv[3], MAX_ARCHIVE);
  const plain = verifyOffsiteArchive(manifest, encrypted, process.env.FAWRI_G5_OFFSITE_PASSPHRASE, process.env.FAWRI_G5_EXPECTED_ENCRYPTED_SHA256);
  try {
    const result = spawnSync("docker", dockerRestoreArgs(), {
      input: plain, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    requireValue(!result.error && result.status === 0 && result.stdout.trim() === "G5_OFFSITE_ISOLATED_PG18_CATALOG_VERIFIED", "G5_OFFSITE_ISOLATED_RESTORE_FAILED");
    console.log("G5_OFFSITE_ISOLATED_PG18_CATALOG_VERIFIED");
    console.log("G5_PRODUCTION_CONNECTION_NONE; ACL_AND_MEDIA_RECOVERY_NOT_ACCEPTED");
  } finally { plain.fill(0); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch { console.error("G5_OFFSITE_RESTORE_REFUSED_OR_FAILED"); process.exitCode = 1; }
}
