import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SAFE_LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SAFE_SOURCE_DATABASES = /^(?:fawri_backup_source|fawri_backup_drill_[a-z0-9_]+)$/;

function parseArgs(argv) {
  if (argv.length % 2 !== 0) throw new Error("Invalid backup argument list");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("Invalid backup argument list");
    values.set(key, value);
  }
  for (const key of values.keys()) {
    if (!new Set(["--url", "--output", "--manifest"]).has(key)) throw new Error("Unknown backup argument");
  }
  return {
    url: values.get("--url"),
    output: values.get("--output"),
    manifest: values.get("--manifest"),
  };
}

function redact(text) {
  return String(text ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(?:password|token|secret)=\S+/gi, "$1=[REDACTED]")
    .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function parseDisposableDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Disposable PostgreSQL URL is invalid");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("Disposable PostgreSQL URL must use PostgreSQL");
  }
  if (!SAFE_LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("PostgreSQL backup drill target must be loopback-only and disposable");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!SAFE_SOURCE_DATABASES.test(database)) {
    throw new Error("PostgreSQL backup drill database name is not approved for disposable use");
  }
  return parsed;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (result.error) throw new Error(`${command} could not start: ${redact(result.error.message)}`);
  if (result.status !== 0) {
    const detail = redact(result.stderr || result.stdout || "command failed").trim();
    throw new Error(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
}

function main() {
  if (process.env.FAWRI_ALLOW_DISPOSABLE_POSTGRES_BACKUP !== "1") {
    throw new Error("PostgreSQL backup drill is disabled; explicit disposable guard is required");
  }

  const { url, output, manifest } = parseArgs(process.argv.slice(2));
  if (!url || !output || !manifest) {
    throw new Error("Usage: node scripts/backup-postgresql.mjs --url <url> --output <dump> --manifest <json>");
  }
  parseDisposableDatabaseUrl(url);

  const outputPath = path.resolve(output);
  const manifestPath = path.resolve(manifest);
  if (outputPath === manifestPath) throw new Error("Backup dump and manifest paths must differ");
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

  const stat = statSync(outputPath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size === 0) throw new Error("PostgreSQL backup is empty");

  const payload = {
    format: "fawri-postgresql-backup-v1",
    created_at: new Date().toISOString(),
    file: path.basename(outputPath),
    size: stat.size,
    sha256: sha256(outputPath),
  };
  writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`PostgreSQL disposable backup created and checksummed: ${stat.size} bytes\n`);
}

main();
