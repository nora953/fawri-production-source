import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const databaseDirectory = path.join(repositoryRoot, "lib", "db");
const committedDrizzleDirectory = path.join(databaseDirectory, "drizzle");

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

function normalizeSnapshot(snapshot) {
  return {
    ...snapshot,
    id: "<generated-id>",
  };
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output.trim());
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${output}`, { cause: error });
  }
}

test("committed Drizzle 0001 is reproducible from the committed 0000 baseline", () => {
  const generatedDirectory = fs.mkdtempSync(
    path.join(databaseDirectory, ".drizzle-repro-output-"),
  );
  const generatedDirectoryName = path.basename(generatedDirectory);
  const generatedMetaDirectory = path.join(generatedDirectory, "meta");
  const configPath = path.join(
    databaseDirectory,
    `.drizzle-repro-${process.pid}-${Date.now()}.config.ts`,
  );

  try {
    fs.mkdirSync(generatedMetaDirectory, { recursive: true });
    fs.copyFileSync(
      path.join(committedDrizzleDirectory, "0000_even_kulan_gath.sql"),
      path.join(generatedDirectory, "0000_even_kulan_gath.sql"),
    );
    fs.copyFileSync(
      path.join(committedDrizzleDirectory, "meta", "0000_snapshot.json"),
      path.join(generatedMetaDirectory, "0000_snapshot.json"),
    );

    const committedJournal = JSON.parse(
      fs.readFileSync(
        path.join(committedDrizzleDirectory, "meta", "_journal.json"),
        "utf8",
      ),
    );
    assert.equal(committedJournal.entries?.length, 2);
    fs.writeFileSync(
      path.join(generatedMetaDirectory, "_journal.json"),
      `${JSON.stringify(
        { ...committedJournal, entries: [committedJournal.entries[0]] },
        null,
        2,
      )}\n`,
      "utf8",
    );

    fs.writeFileSync(
      configPath,
      `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ schema: "./src/schema/*.ts", out: "./${generatedDirectoryName}", dialect: "postgresql" });\n`,
      "utf8",
    );

    run("pnpm", ["exec", "drizzle-kit", "generate", "--config", configPath], {
      cwd: databaseDirectory,
    });

    const generatedSqlFiles = fs
      .readdirSync(generatedDirectory)
      .filter((name) => /^0001_.*\.sql$/.test(name));
    assert.equal(
      generatedSqlFiles.length,
      1,
      "expected exactly one generated 0001 SQL",
    );
    assert.deepEqual(
      fs.readFileSync(path.join(generatedDirectory, generatedSqlFiles[0])),
      fs.readFileSync(
        path.join(committedDrizzleDirectory, "0001_military_proteus.sql"),
      ),
      "generated 0001 SQL differs from committed migration",
    );

    const generatedSnapshot = JSON.parse(
      fs.readFileSync(
        path.join(generatedMetaDirectory, "0001_snapshot.json"),
        "utf8",
      ),
    );
    const committedSnapshot = JSON.parse(
      fs.readFileSync(
        path.join(committedDrizzleDirectory, "meta", "0001_snapshot.json"),
        "utf8",
      ),
    );
    assert.deepEqual(
      normalizeSnapshot(generatedSnapshot),
      normalizeSnapshot(committedSnapshot),
      "generated 0001 snapshot schema differs from committed snapshot",
    );
  } finally {
    fs.rmSync(configPath, { force: true });
    fs.rmSync(generatedDirectory, { recursive: true, force: true });
  }
});

const disposableDatabaseAvailable = safeDisposableDatabase(process.env.DATABASE_URL);

test(
  "disposable PostgreSQL applies migrations and completes rollback commit reconciliation and cleanup",
  { skip: !disposableDatabaseAvailable },
  () => {
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
      assert.equal(smokeReport.snapshot, "0001_snapshot.json");
      assert.equal(smokeReport.tables, 42);
      assert.equal(smokeReport.migrations, 2);
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
    }
  },
);
