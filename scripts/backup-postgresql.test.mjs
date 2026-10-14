import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
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
  const url =
    "postgresql://" +
    "fixture_user:" +
    "do-not-log-secret@" +
    "db.example.replit.com:5432/fawri_backup_source";
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

for (const suffix of ['?hostaddr=192.0.2.1', '?service=unexpected', '#unexpected']) {
  test('PostgreSQL backup rejects URL override options ' + suffix, () => {
    const url = 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_backup_source' + suffix;
    const result = run(['--url', url, '--output', 'missing.dump', '--manifest', 'missing.json'], { FAWRI_ALLOW_DISPOSABLE_POSTGRES_BACKUP: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /URL options are forbidden/i);
    assert.equal(result.stderr.includes('fixture_password'), false);
  });
}

test("PostgreSQL drill strips inherited libpq routing environment before tool invocation", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fawri-pg-tool-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binaryRoot = path.join(root, 'bin');
  fs.mkdirSync(binaryRoot);
  function fake(name, body) {
    fs.writeFileSync(path.join(binaryRoot, name), '#!' + process.execPath + '\n' +
      'if (Object.keys(process.env).some(k => k.startsWith("PG"))) process.exit(77);\n' + body, { mode: 0o700 });
  }
  const dump = path.join(root, 'safe.dump');
  const manifest = path.join(root, 'manifest.json');
  fake('pg_dump', 'require("node:fs").writeFileSync(process.argv[process.argv.indexOf("--file")+1], "safe-fixture");');
  const args = ['--url', 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_backup_source', '--output', dump, '--manifest', manifest];
  const result = run(args, { PATH: binaryRoot, PGHOSTADDR: '192.0.2.1', PGSERVICE: 'unexpected', PGOPTIONS: '-c search_path=unexpected', FAWRI_ALLOW_DISPOSABLE_POSTGRES_BACKUP: '1' });
  assert.equal(result.status, 0, result.stderr);
});
