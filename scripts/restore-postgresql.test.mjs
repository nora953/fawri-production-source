import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
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
  const url = "postgresql://fixture_user:do-not-log-secret@db.example.replit.com:5432/fawri_restore_target";
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
