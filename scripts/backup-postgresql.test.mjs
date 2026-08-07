import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

function run(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/backup-postgresql.mjs", ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("PostgreSQL backup drill is fail-closed without the explicit disposable guard", () => {
  const url = "postgresql://fixture_user:do-not-log-secret@127.0.0.1:5432/fawri_backup_source";
  const result = run(["--url", url, "--output", "missing.dump", "--manifest", "missing.json"], {
    FAWRI_ALLOW_DISPOSABLE_POSTGRES_BACKUP: "0",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit disposable guard/i);
  assert.equal(result.stderr.includes("do-not-log-secret"), false);
});

test("PostgreSQL backup drill rejects remote and Replit-like targets before invoking pg_dump", () => {
  const url = "postgresql://fixture_user:do-not-log-secret@db.example.replit.com:5432/fawri_backup_source";
  const result = run(["--url", url, "--output", "missing.dump", "--manifest", "missing.json"], {
    FAWRI_ALLOW_DISPOSABLE_POSTGRES_BACKUP: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /loopback-only and disposable/i);
  assert.equal(result.stderr.includes("db.example.replit.com"), false);
  assert.equal(result.stderr.includes("do-not-log-secret"), false);
});

test("PostgreSQL backup drill rejects non-disposable local database names", () => {
  const url = "postgresql://fixture_user:fixture_password@127.0.0.1:5432/production";
  const result = run(["--url", url, "--output", "missing.dump", "--manifest", "missing.json"], {
    FAWRI_ALLOW_DISPOSABLE_POSTGRES_BACKUP: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not approved for disposable use/i);
  assert.equal(result.stderr.includes("fixture_password"), false);
});
