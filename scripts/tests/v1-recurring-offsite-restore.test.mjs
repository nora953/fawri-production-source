import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { sealRecurringDump } from "../v1-recurring-encrypted-db-backup.mjs";
import { verifyRecurringArchive } from "../v1-recurring-offsite-restore.mjs";

const plain = Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(180, 7)]);
const passphrase = "synthetic recurring archive fixture passphrase";
const { encrypted, manifest } = sealRecurringDump(plain, passphrase, "2026-11-26T00:00:00Z");
const expectedHash = manifest.encrypted_sha256;

test("accepts a matching independently recorded hash and authenticated archive", () => {
  assert.deepEqual(verifyRecurringArchive(manifest, encrypted, passphrase, expectedHash), plain);
});

test("rejects scope drift, a missing or wrong hash, and truncated ciphertext", () => {
  assert.throws(() => verifyRecurringArchive({ ...manifest, database: "other" }, encrypted, passphrase, expectedHash), /SCOPE_MISMATCH/);
  for (const hash of [undefined, "0".repeat(64)]) {
    assert.throws(() => verifyRecurringArchive(manifest, encrypted, passphrase, hash), /CIPHERTEXT_MISMATCH/);
  }
  assert.throws(() => verifyRecurringArchive(manifest, encrypted.subarray(1), passphrase, expectedHash), /CIPHERTEXT_MISMATCH/);
});

test("rejects a wrong passphrase or forged plaintext digest", () => {
  assert.throws(() => verifyRecurringArchive(manifest, encrypted, "incorrect fixture passphrase", expectedHash));
  assert.throws(() => verifyRecurringArchive({ ...manifest, custom_archive_sha256: "0".repeat(64) },
    encrypted, passphrase, expectedHash), /PLAINTEXT_MISMATCH/);
});

test("CLI refuses an invocation without explicit restore approval", () => {
  const cli = new URL("../v1-recurring-offsite-restore.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [cli.pathname, "manifest.json", "database.pgcustom.enc"],
    { env: {}, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /G5_RECURRING_OFFSITE_RESTORE_REFUSED_OR_FAILED/);
});
