/** Verify an independently retrieved recurring archive in a disposable PG18 cluster. */
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { openIsolatedDump } from "./lib/v1-isolated-neon-dump-safety.mjs";

const MAX_DUMP_BYTES = 128 * 1024 * 1024;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function verifyRecurringArchive(manifest, encrypted, passphrase, expectedHash) {
  if (manifest?.format !== "fawri-v1-recurring-pg18-aes256gcm-v1"
    || manifest.database !== "fawri" || manifest.encryption_roundtrip_verified !== true) {
    throw new Error("G5_RECURRING_MANIFEST_SCOPE_MISMATCH");
  }
  if (!/^[0-9a-f]{64}$/.test(expectedHash ?? "") || !Buffer.isBuffer(encrypted)
    || encrypted.length !== manifest.encrypted_bytes || encrypted.length > MAX_DUMP_BYTES + 1024
    || manifest.encrypted_sha256 !== expectedHash || sha256(encrypted) !== expectedHash) {
    throw new Error("G5_RECURRING_CIPHERTEXT_MISMATCH");
  }
  const plain = openIsolatedDump(encrypted, passphrase);
  if (plain.length < 100 || plain.length > MAX_DUMP_BYTES
    || plain.length !== manifest.custom_archive_bytes || sha256(plain) !== manifest.custom_archive_sha256
    || plain.subarray(0, 5).toString() !== "PGDMP") {
    plain.fill(0);
    throw new Error("G5_RECURRING_PLAINTEXT_MISMATCH");
  }
  return plain;
}

// The original ACLs and owners require the separate private G5 recovery drill.
// These no-login placeholders exist solely to resolve role names in restored policies.
const restoreScript = `set -eu
umask 077
root=$(mktemp -d)
trap 'pg_ctl -D "$root/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$root"' EXIT
mkdir "$root/socket"
cat > "$root/archive"
initdb -D "$root/data" -A trust -U fawri_recovery --no-locale >/dev/null
pg_ctl -D "$root/data" -o "-h '' -k $root/socket" -w start >/dev/null
export PGHOST="$root/socket" PGUSER=fawri_recovery PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE fawri_cashier_retirement_writer NOLOGIN NOINHERIT;
CREATE ROLE fawri_auth_issuer NOLOGIN NOINHERIT;
SQL
createdb fawri_recovery
export PGDATABASE=fawri_recovery
pg_restore --dbname=fawri_recovery --no-owner --no-acl --single-transaction --exit-on-error "$root/archive"
psql -X -v ON_ERROR_STOP=1 -Atq <<'SQL'
SELECT CASE WHEN current_setting('server_version_num')::int / 10000 = 18
 AND EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.orders'::regclass AND relrowsecurity)
 AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders')
 THEN 'G5_RECURRING_ISOLATED_PG18_RESTORE_OK ' || (SELECT count(*) FROM public.orders)
 ELSE 'G5_RECURRING_RESTORED_CATALOG_MISMATCH' END;
SQL
`;

export function restoreRecurringArchive(plain) {
  const name = "fawri-g5-offsite-" + randomUUID();
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  const result = spawnSync("docker", [
    "run", "--rm", "--name", name, "--pull=never", "--network=none", "--log-driver=none",
    "--user=postgres", "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "-i", "--entrypoint=sh", "postgres:18-alpine", "-c", restoreScript,
  ], {
    input: plain, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024,
    env,
  });
  if (result.error?.code === "ETIMEDOUT") {
    spawnSync("docker", ["rm", "-f", name], { env, stdio: "ignore", timeout: 20000 });
  }
  const output = result.stdout?.trim();
  if (result.error || result.status !== 0 || !/^G5_RECURRING_ISOLATED_PG18_RESTORE_OK [0-9]+$/.test(output ?? "")) {
    throw new Error("G5_RECURRING_ISOLATED_RESTORE_FAILED");
  }
  return output;
}

function readBoundedFile(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > limit) {
      throw new Error("G5_RECURRING_INPUT_FILE_INVALID");
    }
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset);
      if (count === 0) throw new Error("G5_RECURRING_INPUT_CHANGED");
      offset += count;
    }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1) !== 0) throw new Error("G5_RECURRING_INPUT_CHANGED");
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function main() {
  if (process.argv.length !== 4 || process.env.FAWRI_G5_RECURRING_OFFSITE_RESTORE_APPROVED !== "1") {
    throw new Error("G5_RECURRING_OFFSITE_RESTORE_NOT_APPROVED");
  }
  const manifest = JSON.parse(readBoundedFile(process.argv[2], 64 * 1024).toString("utf8"));
  const encrypted = readBoundedFile(process.argv[3], MAX_DUMP_BYTES + 1024);
  const plain = verifyRecurringArchive(manifest, encrypted,
    process.env.FAWRI_V1_RECURRING_BACKUP_PASSPHRASE,
    process.env.FAWRI_G5_RECURRING_EXPECTED_ENCRYPTED_SHA256);
  try {
    console.log(restoreRecurringArchive(plain).split(" ")[0]);
    console.log("G5_PRODUCTION_CONNECTION_NONE; ACL_AND_MEDIA_RECOVERY_NOT_ACCEPTED");
  } finally {
    plain.fill(0);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch {
    console.error("G5_RECURRING_OFFSITE_RESTORE_REFUSED_OR_FAILED");
    process.exitCode = 1;
  }
}
