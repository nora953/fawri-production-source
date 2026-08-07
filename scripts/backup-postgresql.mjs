import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("Expected --url, --output, and --manifest arguments");
    values.set(key, value);
  }
  return {
    url: values.get("--url"),
    output: values.get("--output"),
    manifest: values.get("--manifest"),
  };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "command failed").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]");
    throw new Error(`${command} failed: ${detail.trim()}`);
  }
}

function main() {
  const { url, output, manifest } = parseArgs(process.argv.slice(2));
  if (!url || !output || !manifest) {
    throw new Error("Usage: node scripts/backup-postgresql.mjs --url <url> --output <dump> --manifest <json>");
  }

  const outputPath = path.resolve(output);
  const manifestPath = path.resolve(manifest);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });

  run("pg_dump", [
    "--dbname",
    url,
    "--format=custom",
    "--compress=9",
    "--no-owner",
    "--no-privileges",
    "--file",
    outputPath,
  ]);

  const stat = statSync(outputPath);
  if (!stat.isFile() || stat.size === 0) throw new Error("PostgreSQL backup is empty");

  const payload = {
    format: "fawri-postgresql-backup-v1",
    created_at: new Date().toISOString(),
    file: path.basename(outputPath),
    size: stat.size,
    sha256: sha256(outputPath),
  };
  writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`PostgreSQL backup created and checksummed: ${stat.size} bytes\n`);
}

main();
