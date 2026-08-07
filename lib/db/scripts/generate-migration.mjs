import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const committedDrizzleDir = path.join(dbRoot, "drizzle");
const currentSchemaDir = path.join(dbRoot, "src", "schema");
const stageSourceDir = path.join(dbRoot, "migration-stages", "0002");
const stageOverrides = [
  "sessions.ts",
  "channels.ts",
  "jobs.ts",
  "knowledge.ts",
  "subscriptions.ts",
  "tenant-security.ts",
];
const targetOutput = path.resolve(
  process.env.FAWRI_MIGRATION_OUTPUT_DIR || committedDrizzleDir,
);

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function journal(directory) {
  return JSON.parse(
    fs.readFileSync(path.join(directory, "meta", "_journal.json"), "utf8"),
  );
}

function journalEntries(directory) {
  const value = journal(directory);
  return Array.isArray(value.entries) ? value.entries : [];
}

function sqlFiles(directory) {
  return fs
    .readdirSync(directory)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
}

function schemaFiles(directory) {
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .sort();
}

function relativeFromDb(filePath) {
  const relative = path.relative(dbRoot, filePath).replaceAll("\\", "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function emitDiagnostic(event, data) {
  process.stdout.write(
    `[fawri-migration-diagnostic] ${JSON.stringify({ event, ...data })}\n`,
  );
}

function runGenerate(configPath, migrationName) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    command,
    [
      "exec",
      "drizzle-kit",
      "generate",
      "--config",
      configPath,
      "--name",
      migrationName,
    ],
    {
      cwd: dbRoot,
      encoding: "utf8",
      env: { ...process.env, CI: process.env.CI || "1" },
    },
  );
  if (result.error) throw result.error;

  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  emitDiagnostic("drizzle-result", {
    migration: migrationName,
    status: result.status,
    stdout,
    stderr,
  });

  if (result.status !== 0) {
    throw new Error(
      `drizzle-kit generate failed for ${migrationName} with status ${result.status}; stdout=${stdout}; stderr=${stderr}`,
    );
  }

  return { stdout, stderr };
}

function writeConfig(configPath, schemaDirectory, outputDirectory) {
  const schemaGlob = `${relativeFromDb(schemaDirectory)}/*.ts`;
  const out = relativeFromDb(outputDirectory);
  fs.writeFileSync(
    configPath,
    `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ dialect: "postgresql", schema: ${JSON.stringify(
      schemaGlob,
    )}, out: ${JSON.stringify(out)} });\n`,
    "utf8",
  );
  return { schemaGlob, out };
}

function copyCurrentSchema(destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(currentSchemaDir, {
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    fs.copyFileSync(
      path.join(currentSchemaDir, entry.name),
      path.join(destination, entry.name),
    );
  }
}

function assertStageSources() {
  for (const name of stageOverrides) {
    const filePath = path.join(stageSourceDir, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing archived migration stage source: ${filePath}`);
    }
  }
}

function copyDirectory(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

function copyGeneratedOutput(source) {
  fs.rmSync(targetOutput, { recursive: true, force: true });
  fs.cpSync(source, targetOutput, { recursive: true });
}

function deterministicUuidFromHex(hex) {
  const normalized = `${hex.slice(0, 12)}4${hex.slice(13, 16)}8${hex.slice(
    17,
    32,
  )}`;
  return `${normalized.slice(0, 8)}-${normalized.slice(
    8,
    12,
  )}-${normalized.slice(12, 16)}-${normalized.slice(
    16,
    20,
  )}-${normalized.slice(20, 32)}`;
}

function canonicalizeSnapshot(directory, index) {
  const snapshotPath = path.join(
    directory,
    "meta",
    `${String(index).padStart(4, "0")}_snapshot.json`,
  );
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const hashInput = JSON.stringify({ ...snapshot, id: "<generated-id>" });
  snapshot.id = deterministicUuidFromHex(sha256Bytes(hashInput));
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { id: snapshot.id, sha256: sha256(snapshotPath) };
}

function stageOverrideHashes(schemaDirectory) {
  return Object.fromEntries(
    stageOverrides.map((name) => [
      name,
      {
        archived_sha256: sha256(path.join(stageSourceDir, name)),
        effective_sha256: sha256(path.join(schemaDirectory, name)),
      },
    ]),
  );
}

function schemaDigest(schemaDirectory) {
  const hash = createHash("sha256");
  for (const name of schemaFiles(schemaDirectory)) {
    hash.update(name);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(schemaDirectory, name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function prepareBaseline(source, destination) {
  copyDirectory(source, destination);
  for (const name of [
    "0002_cross_lane_stage.sql",
    "0003_cross_lane_cleanup.sql",
  ]) {
    fs.rmSync(path.join(destination, name), { force: true });
  }
  for (const name of ["0002_snapshot.json", "0003_snapshot.json"]) {
    fs.rmSync(path.join(destination, "meta", name), { force: true });
  }
  const value = journal(destination);
  value.entries = (Array.isArray(value.entries) ? value.entries : []).slice(0, 2);
  fs.writeFileSync(
    path.join(destination, "meta", "_journal.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function assertCommittedReproducible(generatedDirectory) {
  const comparisons = [
    "0002_cross_lane_stage.sql",
    "0003_cross_lane_cleanup.sql",
    "meta/0002_snapshot.json",
    "meta/0003_snapshot.json",
  ];
  for (const relativePath of comparisons) {
    const generated = sha256(path.join(generatedDirectory, relativePath));
    const committed = sha256(path.join(committedDrizzleDir, relativePath));
    if (generated !== committed) {
      throw new Error(
        `Committed migration reproducibility mismatch for ${relativePath}; generated=${generated}, committed=${committed}`,
      );
    }
  }

  const committedEntries = journalEntries(committedDrizzleDir);
  const generatedEntries = journalEntries(generatedDirectory);
  const expected = [
    [0, "0000_even_kulan_gath"],
    [1, "0001_military_proteus"],
    [2, "0002_cross_lane_stage"],
    [3, "0003_cross_lane_cleanup"],
  ];
  for (const [position, [idx, tag]] of expected.entries()) {
    if (
      committedEntries[position]?.idx !== idx ||
      committedEntries[position]?.tag !== tag ||
      generatedEntries[position]?.idx !== idx ||
      generatedEntries[position]?.tag !== tag
    ) {
      throw new Error(
        `Migration journal semantic mismatch at position ${position}; expected ${idx}:${tag}`,
      );
    }
  }
}

assertStageSources();

const committedEntries = journalEntries(committedDrizzleDir);
const committedSql = sqlFiles(committedDrizzleDir);
const committedDualStage = committedEntries.length === 4 && committedSql.length === 4;
const committedBaselineOnly = committedEntries.length === 2 && committedSql.length === 2;
if (!committedDualStage && !committedBaselineOnly) {
  throw new Error(
    `Cross-lane generator expects committed Drizzle chain through 0001 or 0003; journal=${committedEntries.length}, sql=${committedSql.length}`,
  );
}

const tempRoot = fs.mkdtempSync(
  path.join(dbRoot, ".fawri-cross-lane-drizzle-"),
);
const tempSchema = path.join(tempRoot, "schema");
const tempOutput = path.join(tempRoot, "drizzle");
const tempName = path.basename(tempRoot);
const stageConfig = path.join(dbRoot, `${tempName}.stage.config.ts`);
const finalConfig = path.join(dbRoot, `${tempName}.final.config.ts`);

try {
  prepareBaseline(committedDrizzleDir, tempOutput);
  const baselineEntries = journalEntries(tempOutput);
  const baselineSql = sqlFiles(tempOutput);
  if (baselineEntries.length !== 2 || baselineSql.length !== 2) {
    throw new Error(
      `Derived baseline must contain 0000+0001 only; journal=${baselineEntries.length}, sql=${baselineSql.length}`,
    );
  }

  copyCurrentSchema(tempSchema);
  for (const name of stageOverrides) {
    fs.copyFileSync(
      path.join(stageSourceDir, name),
      path.join(tempSchema, name),
    );
  }
  const stageConfigInfo = writeConfig(stageConfig, tempSchema, tempOutput);

  const stageBefore = journalEntries(tempOutput).length;
  const stageBeforeSql = sqlFiles(tempOutput);
  emitDiagnostic("stage-preflight", {
    committed_journal_entries: committedEntries.length,
    committed_sql_files: committedSql,
    baseline_journal_entries: baselineEntries.length,
    baseline_sql_files: baselineSql,
    baseline_snapshot_sha256: sha256(
      path.join(committedDrizzleDir, "meta", "0001_snapshot.json"),
    ),
    schema_files: schemaFiles(tempSchema),
    stage_override_hashes: stageOverrideHashes(tempSchema),
    stage_schema_sha256: schemaDigest(tempSchema),
    config: stageConfigInfo,
    journal_entries_before: stageBefore,
    sql_files_before: stageBeforeSql,
  });

  const stageLog = runGenerate(stageConfig, "cross_lane_stage");
  const stageAfter = journalEntries(tempOutput).length;
  const stageBeforeSqlSet = new Set(stageBeforeSql);
  const stageNewSql = sqlFiles(tempOutput).filter(
    (name) => !stageBeforeSqlSet.has(name),
  );
  emitDiagnostic("stage-postflight", {
    journal_entries_before: stageBefore,
    journal_entries_after: stageAfter,
    sql_files_before: stageBeforeSql,
    sql_files_after: sqlFiles(tempOutput),
    sql_files_created: stageNewSql,
    stdout: stageLog.stdout,
    stderr: stageLog.stderr,
  });
  if (
    stageAfter !== stageBefore + 1 ||
    stageNewSql.length !== 1 ||
    stageNewSql[0] !== "0002_cross_lane_stage.sql"
  ) {
    throw new Error(
      `Stage generation must create only 0002_cross_lane_stage.sql; journal ${stageBefore}->${stageAfter}, files=${JSON.stringify(
        stageNewSql,
      )}, stdout=${stageLog.stdout}, stderr=${stageLog.stderr}`,
    );
  }
  const stageSnapshot = canonicalizeSnapshot(tempOutput, 2);

  copyCurrentSchema(tempSchema);
  const finalConfigInfo = writeConfig(finalConfig, tempSchema, tempOutput);
  const finalBefore = journalEntries(tempOutput).length;
  const finalBeforeSql = sqlFiles(tempOutput);
  emitDiagnostic("final-preflight", {
    schema_files: schemaFiles(tempSchema),
    final_schema_sha256: schemaDigest(tempSchema),
    config: finalConfigInfo,
    journal_entries_before: finalBefore,
    sql_files_before: finalBeforeSql,
    stage_snapshot: stageSnapshot,
  });

  const finalLog = runGenerate(finalConfig, "cross_lane_cleanup");
  const finalAfter = journalEntries(tempOutput).length;
  const finalBeforeSqlSet = new Set(finalBeforeSql);
  const finalNewSql = sqlFiles(tempOutput).filter(
    (name) => !finalBeforeSqlSet.has(name),
  );
  emitDiagnostic("final-postflight", {
    journal_entries_before: finalBefore,
    journal_entries_after: finalAfter,
    sql_files_before: finalBeforeSql,
    sql_files_after: sqlFiles(tempOutput),
    sql_files_created: finalNewSql,
    stdout: finalLog.stdout,
    stderr: finalLog.stderr,
  });
  if (
    finalAfter !== finalBefore + 1 ||
    finalNewSql.length !== 1 ||
    finalNewSql[0] !== "0003_cross_lane_cleanup.sql"
  ) {
    throw new Error(
      `Final generation must create only 0003_cross_lane_cleanup.sql; journal ${finalBefore}->${finalAfter}, files=${JSON.stringify(
        finalNewSql,
      )}, stdout=${finalLog.stdout}, stderr=${finalLog.stderr}`,
    );
  }
  const finalSnapshot = canonicalizeSnapshot(tempOutput, 3);

  const finalSql = sqlFiles(tempOutput);
  if (finalSql.length !== 4 || journalEntries(tempOutput).length !== 4) {
    throw new Error(
      `Cross-lane generation must produce exactly 4 total migrations; sql=${finalSql.length}, journal=${journalEntries(tempOutput).length}`,
    );
  }

  if (committedDualStage) {
    assertCommittedReproducible(tempOutput);
  }

  const externalOutput = targetOutput !== committedDrizzleDir;
  if (committedBaselineOnly || externalOutput) {
    copyGeneratedOutput(tempOutput);
  }

  const artifactRoot =
    committedDualStage && !externalOutput ? committedDrizzleDir : targetOutput;
  const artifacts = [
    ...finalSql.slice(2).map((name) => ({
      path: name,
      sha256: sha256(path.join(artifactRoot, name)),
      bytes: fs.statSync(path.join(artifactRoot, name)).size,
    })),
    ...["0002_snapshot.json", "0003_snapshot.json", "_journal.json"].map(
      (name) => ({
        path: `meta/${name}`,
        sha256: sha256(path.join(artifactRoot, "meta", name)),
        bytes: fs.statSync(path.join(artifactRoot, "meta", name)).size,
      }),
    ),
  ];
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: committedDualStage ? "verify_committed" : "generate_candidate",
        committed_reproducible: committedDualStage,
        baseline_entries: 2,
        generated_entries: 4,
        migrations: finalSql.slice(2),
        stage_snapshot: stageSnapshot,
        final_snapshot: finalSnapshot,
        artifacts,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  fs.rmSync(stageConfig, { force: true });
  fs.rmSync(finalConfig, { force: true });
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
