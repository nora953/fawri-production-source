import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const script = path.join(
  repositoryRoot,
  "lib/db/scripts/staging-restore-rehearsal.mjs",
);

function run(databaseUrl, allow = "1") {
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      FAWRI_ALLOW_STAGING_RESTORE_REHEARSAL: allow,
    },
  });
}

test("staging restore rehearsal requires explicit permission", () => {
  const result = run(
    "postgresql://runner@127.0.0.1:55432/fawri_ci",
    "0",
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /FAWRI_ALLOW_STAGING_RESTORE_REHEARSAL=1 is required/,
  );
});

test("staging restore rehearsal rejects non-local PostgreSQL before connection", () => {
  const result = run(
    "postgresql://user:password@ep-example.neon.tech/fawri_ci",
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /rehearsal only permits local PostgreSQL/,
  );
  assert.doesNotMatch(result.stderr, /ENOTFOUND|ECONNREFUSED|timeout/i);
});

test("staging restore rehearsal rejects non-disposable database before connection", () => {
  const result = run(
    "postgresql://runner@127.0.0.1:55432/neondb",
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /rehearsal only permits the disposable fawri_ci database/,
  );
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|timeout/i);
});
