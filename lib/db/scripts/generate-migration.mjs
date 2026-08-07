import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const committedDrizzleDir = path.join(dbRoot, "drizzle");
const currentSchemaDir = path.join(dbRoot, "src", "schema");
const stageSourceDir = path.join(dbRoot, "migration-stages", "0002");
const stageOverrides = ["sessions.ts", "channels.ts", "jobs.ts", "knowledge.ts"];
const targetOutput = path.resolve(process.env.FAWRI_MIGRATION_OUTPUT_DIR || committedDrizzleDir);

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function journalEntries(directory) {
  const journal = JSON.parse(fs.readFileSync(path.join(directory, "meta", "_journal.json"), "utf8"));
  return Array.isArray(journal.entries) ? journal.entries : [];
}
function sqlFiles(directory) {
  return fs.readdirSync(directory).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
}
function runGenerate(configPath, migrationName) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    command,
    ["exec", "drizzle-kit", "generate", "--config", configPath, "--name", migrationName],
    { cwd: dbRoot, encoding: "utf8", env: process.env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `drizzle-kit generate failed for ${migrationName}: ${String(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return String(result.stdout || "").trim();
}
function writeConfig(configPath, schemaDirectory, outputDirectory) {
  const schemaGlob = path.join(schemaDirectory, "*.ts").replaceAll("\\", "/");
  const out = outputDirectory.replaceAll("\\", "/");
  fs.writeFileSync(
    configPath,
    `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ dialect: "postgresql", schema: ${JSON.stringify(schemaGlob)}, out: ${JSON.stringify(out)} });\n`,
    "utf8",
  );
}
function copyCurrentSchema(destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(currentSchemaDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    fs.copyFileSync(path.join(currentSchemaDir, entry.name), path.join(destination, entry.name));
  }
}
function assertStageSources() {
  for (const name of stageOverrides) {
    const filePath = path.join(stageSourceDir, name);
    if (!fs.existsSync(filePath)) throw new Error(`Missing archived migration stage source: ${filePath}`);
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

assertStageSources();
const baselineEntries = journalEntries(committedDrizzleDir);
if (baselineEntries.length !== 2) {
  throw new Error(`Cross-lane generator expects committed Drizzle baseline through 0001; found ${baselineEntries.length} journal entries`);
}
const baselineSql = sqlFiles(committedDrizzleDir);
if (baselineSql.length !== 2) {
  throw new Error(`Cross-lane generator expects exactly 2 committed SQL migrations; found ${baselineSql.length}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-cross-lane-drizzle-"));
const tempSchema = path.join(tempRoot, "schema");
const tempOutput = path.join(tempRoot, "drizzle");
const stageConfig = path.join(tempRoot, "stage.config.ts");
const finalConfig = path.join(tempRoot, "final.config.ts");

try {
  copyDirectory(committedDrizzleDir, tempOutput);
  copyCurrentSchema(tempSchema);
  for (const name of stageOverrides) {
    fs.copyFileSync(path.join(stageSourceDir, name), path.join(tempSchema, name));
  }
  writeConfig(stageConfig, tempSchema, tempOutput);

  const stageBefore = journalEntries(tempOutput).length;
  const stageBeforeSql = new Set(sqlFiles(tempOutput));
  const stageLog = runGenerate(stageConfig, "cross_lane_stage");
  const stageAfter = journalEntries(tempOutput).length;
  const stageNewSql = sqlFiles(tempOutput).filter((name) => !stageBeforeSql.has(name));
  if (stageAfter !== stageBefore + 1 || stageNewSql.length !== 1 || !/^0002_cross_lane_stage\.sql$/.test(stageNewSql[0])) {
    throw new Error(`Stage generation must create only 0002_cross_lane_stage.sql; journal ${stageBefore}->${stageAfter}, files=${JSON.stringify(stageNewSql)}, output=${stageLog}`);
  }

  copyCurrentSchema(tempSchema);
  writeConfig(finalConfig, tempSchema, tempOutput);
  const finalBefore = journalEntries(tempOutput).length;
  const finalBeforeSql = new Set(sqlFiles(tempOutput));
  const finalLog = runGenerate(finalConfig, "cross_lane_cleanup");
  const finalAfter = journalEntries(tempOutput).length;
  const finalNewSql = sqlFiles(tempOutput).filter((name) => !finalBeforeSql.has(name));
  if (finalAfter !== finalBefore + 1 || finalNewSql.length !== 1 || !/^0003_cross_lane_cleanup\.sql$/.test(finalNewSql[0])) {
    throw new Error(`Final generation must create only 0003_cross_lane_cleanup.sql; journal ${finalBefore}->${finalAfter}, files=${JSON.stringify(finalNewSql)}, output=${finalLog}`);
  }

  const finalSql = sqlFiles(tempOutput);
  if (finalSql.length !== 4 || journalEntries(tempOutput).length !== 4) {
    throw new Error(`Cross-lane generation must produce exactly 4 total migrations; sql=${finalSql.length}, journal=${journalEntries(tempOutput).length}`);
  }

  copyGeneratedOutput(tempOutput);
  const artifacts = [
    ...finalSql.slice(2).map((name) => ({ path: name, sha256: sha256(path.join(targetOutput, name)), bytes: fs.statSync(path.join(targetOutput, name)).size })),
    ...["0002_snapshot.json", "0003_snapshot.json", "_journal.json"].map((name) => ({ path: `meta/${name}`, sha256: sha256(path.join(targetOutput, "meta", name)), bytes: fs.statSync(path.join(targetOutput, "meta", name)).size })),
  ];
  process.stdout.write(`${JSON.stringify({ ok: true, baseline_entries: 2, generated_entries: 4, migrations: finalSql.slice(2), artifacts }, null, 2)}\n`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
