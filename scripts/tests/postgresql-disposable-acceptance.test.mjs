import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const databaseDirectory = path.join(repositoryRoot, "lib", "db");
const committedDrizzleDirectory = path.join(databaseDirectory, "drizzle");
const dbRequire = createRequire(path.join(databaseDirectory, "package.json"));
const { Client } = dbRequire("pg");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
  });
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(" ")} failed with ${result.status}`,
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return result;
}

function safeDisposableDatabase(connectionString) {
  if (!connectionString) return false;
  try {
    const parsed = new URL(connectionString);
    return (
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      parsed.pathname.replace(/^\//, "") === "fawri_ci"
    );
  } catch {
    return false;
  }
}

function parseJsonOutput(stdout, label) {
  const trimmed = String(stdout || "").trim();
  const start = trimmed.lastIndexOf("\n{");
  const jsonText = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`${label} did not return final JSON: ${error.message}\n${stdout}`);
  }
}

function assertSameBytes(left, right, label) {
  assert.deepEqual(
    fs.readFileSync(left),
    fs.readFileSync(right),
    `${label} is not byte-for-byte reproducible`,
  );
}

async function resetDisposableSchema(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
}

test("committed Drizzle chain is reproducible from the committed 0001 baseline", () => {
  const generatedDirectory = fs.mkdtempSync(
    path.join(databaseDirectory, ".fawri-reproducibility-"),
  );
  try {
    const generator = run(
      process.execPath,
      [path.join(databaseDirectory, "scripts", "generate-migration.mjs")],
      {
        cwd: databaseDirectory,
        env: {
          CI: "1",
          FAWRI_MIGRATION_OUTPUT_DIR: generatedDirectory,
        },
      },
    );
    const report = parseJsonOutput(generator.stdout, "dual-stage generator");
    assert.equal(report.ok, true);
    assert.equal(report.mode, "verify_committed_external_copy");
    assert.equal(report.committed_reproducible, true);
    assert.equal(report.generated_entries, 5);

    for (const relativePath of [
      "0002_cross_lane_stage.sql",
      "0003_cross_lane_cleanup.sql",
      "meta/0002_snapshot.json",
      "meta/0003_snapshot.json",
      "0004_product_shipping_measurements.sql",
      "meta/0004_snapshot.json",
    ]) {
      assertSameBytes(
        path.join(generatedDirectory, relativePath),
        path.join(committedDrizzleDirectory, relativePath),
        relativePath,
      );
    }

    const journal = JSON.parse(
      fs.readFileSync(
        path.join(generatedDirectory, "meta", "_journal.json"),
        "utf8",
      ),
    );
    assert.equal(journal.entries?.length, 5);
    assert.deepEqual(
      journal.entries.map(({ idx, tag }) => [idx, tag]),
      [
        [0, "0000_even_kulan_gath"],
        [1, "0001_military_proteus"],
        [2, "0002_cross_lane_stage"],
        [3, "0003_cross_lane_cleanup"],
        [4, "0004_product_shipping_measurements"],
      ],
    );
  } finally {
    fs.rmSync(generatedDirectory, { recursive: true, force: true });
  }
});

const disposableDatabaseAvailable = safeDisposableDatabase(process.env.DATABASE_URL);

test(
  "disposable PostgreSQL applies migrations and completes rollback commit reconciliation and cleanup",
  { skip: !disposableDatabaseAvailable },
  async () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(process.env.RUNNER_TEMP || "/tmp", "fawri-postgresql-acceptance-"),
    );
    try {
      const smoke = run(
        process.execPath,
        [path.join(databaseDirectory, "scripts", "smoke-migration.mjs")],
        {
          env: { FAWRI_ALLOW_MIGRATION_SMOKE: "1" },
        },
      );
      const smokeReport = parseJsonOutput(smoke.stdout, "migration smoke");
      assert.equal(smokeReport.ok, true);
      assert.equal(smokeReport.snapshot, "0004_snapshot.json");
      assert.equal(smokeReport.tables, 59);
      assert.equal(smokeReport.migrations, 5);
      assert.equal(smokeReport.applied_twice_without_changes, true);
      assert.equal(smokeReport.dependency_order_stabilized, true);
      assert.ok(smokeReport.composite_foreign_keys > 0);

      run(
        process.execPath,
        [
          path.join(
            repositoryRoot,
            "scripts",
            "tests",
            "fixtures",
            "create-postgresql-migration-fixture.mjs",
          ),
          fixtureDirectory,
        ],
      );
      run(
        process.execPath,
        [
          path.join(
            repositoryRoot,
            "scripts",
            "tests",
            "fixtures",
            "create-transitional-migration-fixture.mjs",
          ),
          fixtureDirectory,
        ],
      );

      const rollback = run(
        process.execPath,
        [
          path.join(
            repositoryRoot,
            "scripts",
            "run-postgresql-migration-cutover.mjs",
          ),
          fixtureDirectory,
          "--rollback-test",
        ],
        { env: { FAWRI_ALLOW_MIGRATION_ROLLBACK_TEST: "1" } },
      );
      const rollbackOuter = parseJsonOutput(rollback.stdout, "rollback rehearsal");
      assert.equal(rollbackOuter.ok, true);
      assert.equal(rollbackOuter.mode, "rollback");
      const rollbackReport = parseJsonOutput(
        rollbackOuter.child_stdout,
        "rollback child rehearsal",
      );
      assert.equal(rollbackReport.rollback_completed, true);
      assert.equal(rollbackReport.database_restored_to_baseline, true);
      assert.equal(rollbackReport.application_writes_persisted, false);
      assert.equal(rollbackReport.metadata_writes_persisted, false);
      assert.equal(rollbackReport.source_revalidated_before_rollback, true);

      const commit = run(
        process.execPath,
        [
          path.join(
            repositoryRoot,
            "scripts",
            "run-postgresql-migration-cutover.mjs",
          ),
          fixtureDirectory,
          "--commit-test",
        ],
        { env: { FAWRI_ALLOW_MIGRATION_COMMIT_TEST: "1" } },
      );
      const commitOuter = parseJsonOutput(commit.stdout, "commit rehearsal");
      assert.equal(commitOuter.ok, true);
      assert.equal(commitOuter.mode, "commit");
      const commitReport = parseJsonOutput(
        commitOuter.child_stdout,
        "commit child rehearsal",
      );
      assert.equal(commitReport.idempotency_second_pass_inserted, 0);
      assert.equal(
        commitReport.source_revalidated_immediately_before_each_commit,
        true,
      );
      assert.equal(commitReport.row_counts_matched, true);
      assert.equal(commitReport.row_values_matched, true);
      assert.equal(commitReport.migration_metadata_reconciled, true);
      assert.equal(commitReport.cleanup_completed, true);
      assert.equal(commitReport.database_restored_to_empty, true);
    } finally {
      fs.rmSync(fixtureDirectory, { recursive: true, force: true });
      if (disposableDatabaseAvailable) {
        await resetDisposableSchema(process.env.DATABASE_URL);
      }
    }
  },
);
