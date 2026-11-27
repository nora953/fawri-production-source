import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { backupClientEnv, BACKUP_TARGET, dumpArguments, READER_PREFLIGHT_SQL, sealRecurringDump } from "../v1-recurring-encrypted-db-backup.mjs";
import { openIsolatedDump } from "../lib/v1-isolated-neon-dump-safety.mjs";
const url = "postgresql://" + BACKUP_TARGET.role + ":fixture-password@" + BACKUP_TARGET.host + "/fawri?sslmode=verify-full";
const base = {FAWRI_V1_RECURRING_DB_EXPORT_APPROVED:"1",FAWRI_V1_RECURRING_BACKUP_READER_URL:url,PATH:"/usr/bin",HOME:"/tmp"};
test("reader-only command checks the pinned TLS session and cannot fall through to export", () => {
  const dir = mkdtempSync(join(tmpdir(), "fawri-reader-test-"));
  try {
    const entry = fileURLToPath(new URL("../v1-recurring-encrypted-db-backup.mjs", import.meta.url));
    const withReader = { PATH: dir, HOME: dir, FAWRI_V1_RECURRING_BACKUP_READER_URL: url };
    const stub = join(dir, "psql");
    writeFileSync(stub, `#!/bin/sh
[ "$PGSSLMODE/$PGSSLROOTCERT/$PGCHANNELBINDING" = 'verify-full/system/require' ] || exit 9
[ "$PGUSER/$PGDATABASE" = '${BACKUP_TARGET.role}/fawri' ] || exit 10
[ "$PGHOST" = '${BACKUP_TARGET.host}' ] || exit 11
[ "$PGOPTIONS" = '-c default_transaction_read_only=on' ] || exit 12
case "$*" in *rolbypassrls*transaction_read_only*|*transaction_read_only*rolbypassrls*) ;; *) exit 13 ;; esac
printf 'G5_READER_ACCEPTED\\n'
`, { mode: 0o700 });
    const run = (args, env = withReader) => spawnSync(process.execPath, [entry, ...args], { env, encoding: "utf8" });
    const ok = run(["--reader-preflight"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout.trim(), "G5_READER_ACCEPTED");
    assert.equal(run([]).status, 1);
    assert.equal(run(["--reader-preflight", "extra"]).status, 1);
    assert.equal(run(["--reader-preflight"], { ...withReader, FAWRI_V1_RECURRING_BACKUP_READER_URL: url.replace("verify-full", "require") }).status, 1);
    writeFileSync(stub, "#!/bin/sh\nprintf '%s\\n' \"$PGPASSWORD\" >&2\nexit 1\n");
    const denied = run(["--reader-preflight"]);
    assert.equal(denied.status, 1);
    assert.equal(denied.stdout, "");
    assert.equal(denied.stderr.trim(), "G5_RECURRING_READER_PREFLIGHT_FAILED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("only approved dedicated direct reader with verified TLS; inherited routing ignored",()=>{
 const env=backupClientEnv({...base,PGHOST:"evil",PGSERVICE:"evil",PGOPTIONS:"evil",FAWRI_OWNER_SECRET:"never-forward"});
 assert.equal(env.PGHOST,BACKUP_TARGET.host);
 assert.equal(env.PGUSER,BACKUP_TARGET.role);
 assert.equal(env.PGSSLMODE,"verify-full");
 assert.equal(env.PGSSLROOTCERT,"system");
 assert.equal(env.PGCHANNELBINDING,"require");
 assert.equal(env.PGOPTIONS,"-c default_transaction_read_only=on");
 assert.equal(env.PGSERVICE,undefined);
 assert.equal(env.FAWRI_OWNER_SECRET,undefined);
});
test("refuses absent approval, privileged role, wrong database/host, TLS downgrade and routing override",()=>{
 assert.throws(()=>backupClientEnv({...base,FAWRI_V1_RECURRING_DB_EXPORT_APPROVED:"0"}));
 for(const invalid of [url.replace(BACKUP_TARGET.role,"fawri_owner"),url.replace(BACKUP_TARGET.host,"127.0.0.1"),url.replace("/fawri?","/other?"),url.replace("verify-full","require"),url+"&host=evil",url+"&sslmode=verify-full",url+"#fragment"]){
  assert.throws(()=>backupClientEnv({...base,FAWRI_V1_RECURRING_BACKUP_READER_URL:invalid}));
 }
});
test("reader preflight checks effective temporary and large-object write privileges",()=>{
 assert.match(READER_PREFLIGHT_SQL,/NOT has_database_privilege\(current_database\(\),'CREATE,TEMPORARY'\)/);
 assert.match(READER_PREFLIGHT_SQL,/n\.nspname='pg_catalog'\s+AND p\.proname IN \('lo_creat','lo_create','lo_from_bytea'[\s\S]+?AND has_function_privilege\(p\.oid,'EXECUTE'\)/);
});
test("full archive request never opts into partial RLS-filtered export",()=>{
 assert.deepEqual(dumpArguments(),["--format=custom","--compress=6","--no-password","--dbname=fawri"]);
 assert.match(READER_PREFLIGHT_SQL,/rolbypassrls/);
 assert.match(READER_PREFLIGHT_SQL,/transaction_read_only/);
 assert.match(READER_PREFLIGHT_SQL,/has_any_column_privilege/);
 assert.match(READER_PREFLIGHT_SQL,/prosecdef AND has_function_privilege/);
});
test("encrypted output and manifest are honest about unverified recovery",()=>{
 const plain=Buffer.concat([Buffer.from("PGDMP"),Buffer.alloc(180,7)]);
 const pass="synthetic recurring archive fixture passphrase";
 const {encrypted,manifest}=sealRecurringDump(plain,pass,"2026-11-24T00:00:00Z");
 assert.deepEqual(openIsolatedDump(encrypted,pass),plain);
 assert.equal(manifest.encrypted_sha256,createHash("sha256").update(encrypted).digest("hex"));
 assert.equal(manifest.offsite_verified,false);
 assert.equal(manifest.isolated_restore_verified,false);
 assert.equal(manifest.media_pair_verified,false);
 assert.equal(manifest.commercial_recovery_accepted,false);
 assert.throws(()=>sealRecurringDump(plain,"short","x"));
 assert.throws(()=>sealRecurringDump(Buffer.alloc(200),pass,"x"));
});
