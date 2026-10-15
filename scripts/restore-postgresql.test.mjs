import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";

function run(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/restore-postgresql.mjs", ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

const baseArgs = [
  "--backup",
  "missing.dump",
  "--manifest",
  "missing.json",
  "--verify-sql",
  "select count(*) from restore_drill_records",
  "--expect",
  "3",
];

test("PostgreSQL restore drill is fail-closed without the explicit disposable guard", () => {
  const url = "postgresql://fixture_user:do-not-log-secret@127.0.0.1:5432/fawri_restore_target";
  const result = run(["--url", url, ...baseArgs], {
    FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: "0",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit disposable guard/i);
  assert.equal(result.stderr.includes("do-not-log-secret"), false);
});

test("PostgreSQL restore rejects remote targets and never echoes credentials", () => {
  const url =
    "postgresql://" +
    "fixture_user:" +
    "do-not-log-secret@" +
    "db.example.replit.com:5432/fawri_restore_target";
  const result = run(["--url", url, ...baseArgs], {
    FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /loopback-only and disposable/i);
  assert.equal(result.stderr.includes("db.example.replit.com"), false);
  assert.equal(result.stderr.includes("do-not-log-secret"), false);
});

test("PostgreSQL restore verification rejects multi-statement SQL before restore", () => {
  const url = "postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target";
  const args = [
    "--url",
    url,
    "--backup",
    "missing.dump",
    "--manifest",
    "missing.json",
    "--verify-sql",
    "select 1; drop table restore_drill_records",
    "--expect",
    "1",
  ];
  const result = run(args, { FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /one read-only SELECT/i);
  assert.equal(result.stderr.includes("fixture_password"), false);
});

for (const suffix of ['?hostaddr=192.0.2.1', '?service=unexpected', '#unexpected']) {
  test('PostgreSQL restore rejects URL override options ' + suffix, () => {
    const url = 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target' + suffix;
    const result = run(['--url', url, ...baseArgs], { FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: '1' });
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
  fs.writeFileSync(dump, 'safe-fixture');
  fs.writeFileSync(manifest, JSON.stringify({ format: 'fawri-postgresql-backup-v1', size: 12, sha256: createHash('sha256').update('safe-fixture').digest('hex') }));
  fake('pg_restore', 'process.exit(0);');
  fake('psql', 'process.stdout.write("3\\n");');
  const args = ['--url', 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target', '--backup', dump, '--manifest', manifest, '--verify-sql', 'select count(*) from restore_drill_records', '--expect', '3'];
  const result = run(args, { PATH: binaryRoot, PGHOSTADDR: '192.0.2.1', PGSERVICE: 'unexpected', PGOPTIONS: '-c search_path=unexpected', FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: '1' });
  assert.equal(result.status, 0, result.stderr);
});

for (const sql of ['select write_side_effect()', 'select count(*) from records for update', "select count(*) from records where write_side_effect()", 'select * into new_table from records']) {
  test('restore verification refuses arbitrary SELECT effects: ' + sql, () => {
    const args = ['--url', 'postgresql://fixture_user:fixture_password@127.0.0.1:5432/fawri_restore_target', '--backup', 'missing.dump', '--manifest', 'missing.json', '--verify-sql', sql, '--expect', '3'];
    const result = run(args, { FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /one read-only SELECT/i);
  });
}
