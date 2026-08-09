import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const committedDrizzleDir = path.join(dbRoot, "drizzle");
const currentSchemaDir = path.join(dbRoot, "src", "schema");
const migrationStagesDir = path.join(dbRoot, "migration-stages");
const legacyStageSourceDir = path.join(migrationStagesDir, "0002");
const legacyStageOverrides = [
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

const baselineHistory = [
  {
    index: 0,
    name: "even_kulan_gath",
    when: 1786021331544,
  },
  {
    index: 1,
    name: "military_proteus",
    when: 1786100550622,
  },
];

const legacyGeneratedStages = [
  {
    index: 2,
    name: "cross_lane_stage",
    when: 1786120375361,
  },
  {
    index: 3,
    name: "cross_lane_cleanup",
    when: 1786120376886,
  },
];

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

function writeJournal(directory, value) {
  fs.writeFileSync(
    path.join(directory, "meta", "_journal.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
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

function snapshotFileName(index) {
  return `${String(index).padStart(4, "0")}_snapshot.json`;
}

function migrationFileName(stage) {
  return `${String(stage.index).padStart(4, "0")}_${stage.name}.sql`;
}

function migrationTag(stage) {
  return `${String(stage.index).padStart(4, "0")}_${stage.name}`;
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
  const snapshotPath = path.join(directory, "meta", snapshotFileName(index));
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const hashInput = JSON.stringify({ ...snapshot, id: "<generated-id>" });
  snapshot.id = deterministicUuidFromHex(sha256Bytes(hashInput));
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { id: snapshot.id, sha256: sha256(snapshotPath) };
}

function canonicalizeJournalEntry(directory, stage) {
  const value = journal(directory);
  const entries = Array.isArray(value.entries) ? value.entries : [];
  const entry = entries.find((item) => item?.idx === stage.index);
  if (!entry) {
    throw new Error(`Generated journal entry ${stage.index} is missing`);
  }
  entry.version = "7";
  entry.when = stage.when;
  entry.tag = migrationTag(stage);
  entry.breakpoints = true;
  writeJournal(directory, value);
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

function assertLegacyStageSources() {
  for (const name of legacyStageOverrides) {
    const filePath = path.join(legacyStageSourceDir, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing archived migration stage source: ${filePath}`);
    }
  }
}

function loadAppendStages() {
  if (!fs.existsSync(migrationStagesDir)) return [];

  const stages = fs
    .readdirSync(migrationStagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .filter((index) => index >= 4)
    .sort((left, right) => left - right)
    .map((index) => {
      const directory = path.join(
        migrationStagesDir,
        String(index).padStart(4, "0"),
      );
      const metadataPath = path.join(directory, "stage.json");
      if (!fs.existsSync(metadataPath)) {
        throw new Error(`Append migration stage ${index} is missing stage.json`);
      }
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      const preimageFiles = Array.isArray(metadata.preimage_files)
        ? metadata.preimage_files
        : [];
      if (metadata.index !== index) {
        throw new Error(
          `Append migration stage directory ${index} does not match stage.json index ${metadata.index}`,
        );
      }
      if (!/^[a-z0-9_]+$/.test(String(metadata.name || ""))) {
        throw new Error(`Append migration stage ${index} has an invalid name`);
      }
      if (!Number.isSafeInteger(metadata.when) || metadata.when <= 0) {
        throw new Error(`Append migration stage ${index} has an invalid when value`);
      }
      if (
        preimageFiles.length === 0 ||
        new Set(preimageFiles).size !== preimageFiles.length
      ) {
        throw new Error(
          `Append migration stage ${index} must declare unique preimage_files`,
        );
      }
      const preimageDirectory = path.join(directory, "preimage");
      for (const fileName of preimageFiles) {
        if (
          typeof fileName !== "string" ||
          !fileName.endsWith(".ts") ||
          path.basename(fileName) !== fileName
        ) {
          throw new Error(
            `Append migration stage ${index} has an invalid preimage file ${fileName}`,
          );
        }
        const filePath = path.join(preimageDirectory, fileName);
        if (!fs.existsSync(filePath)) {
          throw new Error(
            `Append migration stage ${index} is missing preimage source ${filePath}`,
          );
        }
      }
      return {
        index,
        name: metadata.name,
        when: metadata.when,
        preimageFiles,
        preimageDirectory,
      };
    });

  stages.forEach((stage, position) => {
    const expectedIndex = 4 + position;
    if (stage.index !== expectedIndex) {
      throw new Error(
        `Append migration stages must be contiguous from 0004; expected ${expectedIndex}, found ${stage.index}`,
      );
    }
  });

  return stages;
}

function copySchemaAtBoundary(destination, boundaryIndex, appendStages) {
  copyCurrentSchema(destination);
  for (const stage of [...appendStages].sort((a, b) => b.index - a.index)) {
    if (stage.index <= boundaryIndex) continue;
    for (const fileName of stage.preimageFiles) {
      fs.copyFileSync(
        path.join(stage.preimageDirectory, fileName),
        path.join(destination, fileName),
      );
    }
  }
}

function legacyOverrideHashes(schemaDirectory) {
  return Object.fromEntries(
    legacyStageOverrides.map((name) => [
      name,
      {
        archived_sha256: sha256(path.join(legacyStageSourceDir, name)),
        effective_sha256: sha256(path.join(schemaDirectory, name)),
      },
    ]),
  );
}

function appendPreimageHashes(appendStages) {
  return Object.fromEntries(
    appendStages.map((stage) => [
      stage.index,
      Object.fromEntries(
        stage.preimageFiles.map((name) => [
          name,
          sha256(path.join(stage.preimageDirectory, name)),
        ]),
      ),
    ]),
  );
}

function prepareBaseline(source, destination) {
  copyDirectory(source, destination);

  for (const name of sqlFiles(destination)) {
    const index = Number(name.slice(0, 4));
    if (index >= 2) fs.rmSync(path.join(destination, name), { force: true });
  }

  const metaDirectory = path.join(destination, "meta");
  for (const entry of fs.readdirSync(metaDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^(\d{4})_snapshot\.json$/);
    if (match && Number(match[1]) >= 2) {
      fs.rmSync(path.join(metaDirectory, entry.name), { force: true });
    }
  }

  const value = journal(destination);
  value.entries = (Array.isArray(value.entries) ? value.entries : []).slice(0, 2);
  writeJournal(destination, value);
}

function expectedHistory(appendStages) {
  return [...baselineHistory, ...legacyGeneratedStages, ...appendStages].map(
    (stage) => ({
      index: stage.index,
      name: stage.name,
      when: stage.when,
      tag: migrationTag(stage),
      sql: migrationFileName(stage),
      snapshot: snapshotFileName(stage.index),
    }),
  );
}

function assertJournalEntry(entry, expected, label) {
  if (
    entry?.idx !== expected.index ||
    entry?.version !== "7" ||
    entry?.when !== expected.when ||
    entry?.tag !== expected.tag ||
    entry?.breakpoints !== true
  ) {
    throw new Error(
      `${label} migration journal mismatch at index ${expected.index}; expected ${JSON.stringify(
        {
          idx: expected.index,
          version: "7",
          when: expected.when,
          tag: expected.tag,
          breakpoints: true,
        },
      )}, got ${JSON.stringify(entry)}`,
    );
  }
}

function inspectCommittedState(expected) {
  const entries = journalEntries(committedDrizzleDir);
  const sql = sqlFiles(committedDrizzleDir);
  if (entries.length !== sql.length) {
    throw new Error(
      `Committed migration SQL/journal count mismatch; journal=${entries.length}, sql=${sql.length}`,
    );
  }
  if (entries.length < 2 || entries.length > expected.length) {
    throw new Error(
      `Committed migration count ${entries.length} is outside supported history 2..${expected.length}`,
    );
  }
  if (entries.length === 3) {
    throw new Error(
      "Committed legacy cross-lane history cannot stop between 0002 and 0003",
    );
  }

  const expectedSql = expected.slice(0, entries.length).map((item) => item.sql);
  if (JSON.stringify(sql) !== JSON.stringify(expectedSql)) {
    throw new Error(
      `Committed migration filenames do not match canonical history; expected=${JSON.stringify(
        expectedSql,
      )}, actual=${JSON.stringify(sql)}`,
    );
  }

  entries.forEach((entry, position) => {
    assertJournalEntry(entry, expected[position], "Committed");
  });

  let missingLatestSnapshot = false;
  entries.forEach((_, index) => {
    const snapshotPath = path.join(
      committedDrizzleDir,
      "meta",
      snapshotFileName(index),
    );
    if (fs.existsSync(snapshotPath)) return;
    const latestIndex = entries.length - 1;
    if (index === latestIndex && index >= 4 && entries.length === expected.length) {
      missingLatestSnapshot = true;
      return;
    }
    throw new Error(`Committed migration snapshot is missing: ${snapshotPath}`);
  });

  return {
    entries,
    sql,
    missingLatestSnapshot,
    complete:
      entries.length === expected.length &&
      !missingLatestSnapshot,
  };
}

function comparePath(generatedDirectory, relativePath) {
  const generatedPath = path.join(generatedDirectory, relativePath);
  const committedPath = path.join(committedDrizzleDir, relativePath);
  const generated = sha256(generatedPath);
  const committed = sha256(committedPath);
  if (generated !== committed) {
    throw new Error(
      `Committed migration reproducibility mismatch for ${relativePath}; generated=${generated}, committed=${committed}`,
    );
  }
  return { generated, committed };
}

function assertCommittedReproducible(
  generatedDirectory,
  committedState,
  expected,
) {
  let pendingLatestSql = null;
  const latestCommittedIndex = committedState.entries.length - 1;
  for (let index = 0; index < committedState.entries.length; index += 1) {
    if (index >= 2) {
      const isPendingLatest =
        committedState.missingLatestSnapshot && index === latestCommittedIndex;
      if (isPendingLatest) {
        pendingLatestSql = {
          path: expected[index].sql,
          generated_sha256: sha256(
            path.join(generatedDirectory, expected[index].sql),
          ),
          committed_sha256: sha256(
            path.join(committedDrizzleDir, expected[index].sql),
          ),
        };
      } else {
        comparePath(generatedDirectory, expected[index].sql);
      }
    }
    const committedSnapshot = path.join(
      committedDrizzleDir,
      "meta",
      expected[index].snapshot,
    );
    if (fs.existsSync(committedSnapshot)) {
      comparePath(
        generatedDirectory,
        path.join("meta", expected[index].snapshot),
      );
    }
  }

  const generatedEntries = journalEntries(generatedDirectory);
  committedState.entries.forEach((_, index) => {
    assertJournalEntry(generatedEntries[index], expected[index], "Generated");
    assertJournalEntry(
      committedState.entries[index],
      expected[index],
      "Committed",
    );
  });
  return { pendingLatestSql };
}

function generateStage({
  stage,
  tempSchema,
  tempOutput,
  configPath,
  prepareSchema,
  diagnosticName,
}) {
  prepareSchema();
  const configInfo = writeConfig(configPath, tempSchema, tempOutput);
  const beforeEntries = journalEntries(tempOutput).length;
  const beforeSql = sqlFiles(tempOutput);
  emitDiagnostic(`${diagnosticName}-preflight`, {
    migration_index: stage.index,
    migration_name: stage.name,
    schema_files: schemaFiles(tempSchema),
    schema_sha256: schemaDigest(tempSchema),
    config: configInfo,
    journal_entries_before: beforeEntries,
    sql_files_before: beforeSql,
  });

  const log = runGenerate(configPath, stage.name);
  const afterEntries = journalEntries(tempOutput).length;
  const beforeSqlSet = new Set(beforeSql);
  const createdSql = sqlFiles(tempOutput).filter(
    (name) => !beforeSqlSet.has(name),
  );
  const expectedSql = migrationFileName(stage);
  emitDiagnostic(`${diagnosticName}-postflight`, {
    migration_index: stage.index,
    journal_entries_before: beforeEntries,
    journal_entries_after: afterEntries,
    sql_files_created: createdSql,
    stdout: log.stdout,
    stderr: log.stderr,
  });

  if (
    afterEntries !== beforeEntries + 1 ||
    createdSql.length !== 1 ||
    createdSql[0] !== expectedSql
  ) {
    throw new Error(
      `Migration ${stage.index} must create only ${expectedSql}; journal ${beforeEntries}->${afterEntries}, files=${JSON.stringify(
        createdSql,
      )}`,
    );
  }

  const snapshot = canonicalizeSnapshot(tempOutput, stage.index);
  canonicalizeJournalEntry(tempOutput, stage);
  return snapshot;
}

assertLegacyStageSources();
const appendStages = loadAppendStages();
const expected = expectedHistory(appendStages);
const committedState = inspectCommittedState(expected);

const tempRoot = fs.mkdtempSync(
  path.join(dbRoot, ".fawri-cross-lane-drizzle-"),
);
const tempSchema = path.join(tempRoot, "schema");
const tempOutput = path.join(tempRoot, "drizzle");
const tempName = path.basename(tempRoot);
const configPath = path.join(dbRoot, `${tempName}.config.ts`);

try {
  prepareBaseline(committedDrizzleDir, tempOutput);
  const baselineEntries = journalEntries(tempOutput);
  const baselineSql = sqlFiles(tempOutput);
  if (baselineEntries.length !== 2 || baselineSql.length !== 2) {
    throw new Error(
      `Derived baseline must contain 0000+0001 only; journal=${baselineEntries.length}, sql=${baselineSql.length}`,
    );
  }
  baselineEntries.forEach((entry, index) => {
    assertJournalEntry(entry, expected[index], "Baseline");
  });

  const stage2Snapshot = generateStage({
    stage: legacyGeneratedStages[0],
    tempSchema,
    tempOutput,
    configPath,
    diagnosticName: "legacy-stage",
    prepareSchema: () => {
      copySchemaAtBoundary(tempSchema, 3, appendStages);
      for (const name of legacyStageOverrides) {
        fs.copyFileSync(
          path.join(legacyStageSourceDir, name),
          path.join(tempSchema, name),
        );
      }
      emitDiagnostic("legacy-stage-overrides", {
        override_hashes: legacyOverrideHashes(tempSchema),
        append_preimage_hashes: appendPreimageHashes(appendStages),
      });
    },
  });

  const stage3Snapshot = generateStage({
    stage: legacyGeneratedStages[1],
    tempSchema,
    tempOutput,
    configPath,
    diagnosticName: "legacy-cleanup",
    prepareSchema: () => copySchemaAtBoundary(tempSchema, 3, appendStages),
  });

  const appendSnapshots = [];
  for (const stage of appendStages) {
    appendSnapshots.push({
      index: stage.index,
      ...(generateStage({
        stage,
        tempSchema,
        tempOutput,
        configPath,
        diagnosticName: "append-stage",
        prepareSchema: () =>
          copySchemaAtBoundary(tempSchema, stage.index, appendStages),
      })),
    });
  }

  const generatedSql = sqlFiles(tempOutput);
  const generatedEntries = journalEntries(tempOutput);
  if (
    generatedSql.length !== expected.length ||
    generatedEntries.length !== expected.length
  ) {
    throw new Error(
      `Canonical generation count mismatch; expected=${expected.length}, sql=${generatedSql.length}, journal=${generatedEntries.length}`,
    );
  }
  expected.forEach((stage, index) => {
    assertJournalEntry(generatedEntries[index], stage, "Generated");
  });

  const reproducibility = assertCommittedReproducible(
    tempOutput,
    committedState,
    expected,
  );

  const externalOutput = targetOutput !== committedDrizzleDir;
  const needsCompletion = !committedState.complete;
  if (needsCompletion || externalOutput) {
    copyGeneratedOutput(tempOutput);
  }

  const artifactRoot = needsCompletion || externalOutput
    ? targetOutput
    : committedDrizzleDir;
  const artifactSql = sqlFiles(artifactRoot);
  const artifactEntries = journalEntries(artifactRoot);
  const artifacts = [
    ...artifactSql.map((name) => ({
      path: name,
      sha256: sha256(path.join(artifactRoot, name)),
      bytes: fs.statSync(path.join(artifactRoot, name)).size,
    })),
    ...artifactEntries.map((entry) => {
      const name = snapshotFileName(entry.idx);
      const filePath = path.join(artifactRoot, "meta", name);
      return {
        path: `meta/${name}`,
        sha256: sha256(filePath),
        bytes: fs.statSync(filePath).size,
      };
    }),
    {
      path: "meta/_journal.json",
      sha256: sha256(path.join(artifactRoot, "meta", "_journal.json")),
      bytes: fs.statSync(path.join(artifactRoot, "meta", "_journal.json")).size,
    },
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: committedState.complete
          ? externalOutput
            ? "verify_committed_external_copy"
            : "verify_committed"
          : committedState.missingLatestSnapshot
            ? "complete_committed_metadata"
            : "generate_candidate",
        committed_reproducible: committedState.complete,
        historical_reproducible: true,
        pending_latest_sql: reproducibility.pendingLatestSql,
        historical_0002_snapshot: stage2Snapshot,
        historical_0003_snapshot: stage3Snapshot,
        append_stages: appendStages.map((stage) => ({
          index: stage.index,
          name: stage.name,
          preimage_files: stage.preimageFiles,
        })),
        append_snapshots: appendSnapshots,
        generated_entries: generatedEntries.length,
        migrations: generatedSql,
        artifacts,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  fs.rmSync(configPath, { force: true });
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
