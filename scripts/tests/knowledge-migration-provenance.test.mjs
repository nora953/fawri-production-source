import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildValidatedMigrationPlan } from "../lib/postgresql-migration-plan-safe.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const fixtureScript = path.join(
  repositoryRoot,
  "scripts",
  "tests",
  "fixtures",
  "create-postgresql-migration-fixture.mjs",
);

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fawri-knowledge-provenance-"),
  );
  const result = spawnSync(process.execPath, [fixtureScript, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return directory;
}

test("ambiguous legacy Knowledge suggestion provenance fails closed", () => {
  const directory = createFixture();
  try {
    const filePath = path.join(directory, "training-requests.json");
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    delete value.requests[0].suggestedReplySource;
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

    const { report } = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: false,
    });
    assert.equal(report.ok, false);
    assert.ok(
      report.errors.some(
        (error) =>
          error.code === "AMBIGUOUS_KNOWLEDGE_PROVENANCE" &&
          error.table === "training_requests" &&
          error.record_id === "training-1",
      ),
      JSON.stringify(report.errors, null, 2),
    );
    assert.equal("rows" in report, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
