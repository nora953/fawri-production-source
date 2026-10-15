import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-cutover-"));
  for (const script of [
    "create-postgresql-migration-fixture.mjs",
    "create-transitional-migration-fixture.mjs",
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, "scripts/tests/fixtures", script), directory],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return directory;
}

test("cutover command defaults to dry-run and never uses DATABASE_URL", () => {
  const directory = createFixture();
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, "scripts/run-postgresql-migration-cutover.mjs"), directory],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://must-not-connect.invalid/production",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "dry_run");
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("commit test requires an explicit environment permission", () => {
  const directory = createFixture();
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "scripts/run-postgresql-migration-cutover.mjs"),
        directory,
        "--commit-test",
      ],
      { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env } },
    );
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.code, "EXPLICIT_WRITE_PERMISSION_REQUIRED");
    assert.equal(report.writes_performed, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("real write mode remains fail-closed", () => {
  const directory = createFixture();
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "scripts/run-postgresql-migration-cutover.mjs"),
        directory,
        "--write",
      ],
      { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env } },
    );
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.code, "REAL_CUTOVER_NOT_IMPLEMENTED");
    assert.equal(report.writes_performed, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
