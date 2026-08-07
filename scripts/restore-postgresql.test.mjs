import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("PostgreSQL restore is fail-closed without the explicit restore guard", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/restore-postgresql.mjs",
      "--url",
      "postgresql://fawri_ci:fawri_ci@127.0.0.1:5432/restore",
      "--backup",
      "missing.dump",
      "--manifest",
      "missing.json",
      "--verify-sql",
      "select 1",
      "--expect",
      "1",
    ],
    { cwd: path.resolve("."), encoding: "utf8", env: { ...process.env, FAWRI_ALLOW_POSTGRES_RESTORE: "0" } },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /restore is disabled/i);
  assert.equal(result.stderr.includes("fawri_ci@"), false);
});
