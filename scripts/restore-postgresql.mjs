import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const SAFE_LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SAFE_RESTORE_DATABASES = /^(?:fawri_restore_target|fawri_restore_drill_[a-z0-9_]+)$/;

function parseArgs(argv) {
  if (argv.length % 2 !== 0) throw new Error("Invalid restore argument list");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("Invalid restore argument list");
    values.set(key, value);
  }
  const allowed = new Set(["--url", "--backup", "--manifest", "--verify-sql", "--expect"]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error("Unknown restore argument");
  }
  return {
    url: values.get("--url"),
    backup: values.get("--backup"),
    manifest: values.get("--manifest"),
    verifySql: values.get("--verify-sql"),
    expect: values.get("--expect"),
  };
}

function redact(text) {
  return String(text ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(?:password|token|secret)=\S+/gi, "$1=[REDACTED]")
    .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function assertDisposableRestoreUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Disposable PostgreSQL restore URL is invalid");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("Disposable PostgreSQL restore URL must use PostgreSQL");
  }
  if (!SAFE_LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("PostgreSQL restore target must be loopback-only and disposable");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!SAFE_RESTORE_DATABASES.test(database)) {
    throw new Error("PostgreSQL restore database name is not approved for disposable use");
  }
}

function assertSafeVerificationSql(sql) {
  const normalized = String(sql).trim();
  if (!/^select\b/i.test(normalized) || /;|--|\/\*/.test(normalized)) {
    throw new Error("Restore verification SQL must be one read-only SELECT without comments or statement separators");
  }
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.error) throw new Error(`${command} could not start: ${redact(result.error.message)}`);
  if (result.status !== 0) {
    const detail = redact(result.stderr || result.stdout || "command failed").trim();
    throw new Error(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
  return capture ? String(result.stdout ?? "").trim() : "";
}

function main() {
  if (process.env.FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE !== "1") {
    throw new Error("PostgreSQL restore drill is disabled; explicit disposable guard is required");
  }

  const { url, backup, manifest, verifySql, expect } = parseArgs(process.argv.slice(2));
  if (!url || !backup || !manifest || !verifySql || expect === undefined) {
    throw new Error(
      "Usage: node scripts/restore-postgresql.mjs --url <url> --backup <dump> --manifest <json> --verify-sql <sql> --expect <value>",
    );
  }
  assertDisposableRestoreUrl(url);
  assertSafeVerificationSql(verifySql);

  const backupPath = path.resolve(backup);
  const metadata = JSON.parse(readFileSync(path.resolve(manifest), "utf8"));
  const stat = statSync(backupPath, { throwIfNoEntry: false });
  if (
    metadata.format !== "fawri-postgresql-backup-v1" ||
    typeof metadata.size !== "number" ||
    typeof metadata.sha256 !== "string" ||
    !stat?.isFile() ||
    stat.size !== metadata.size ||
    sha256(backupPath) !== metadata.sha256
  ) {
    throw new Error("PostgreSQL backup checksum or metadata verification failed");
  }

  run("pg_restore", [
    "--dbname",
    url,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    backupPath,
  ]);

  const actual = run("psql", [url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", verifySql], true);
  if (actual !== expect) {
    throw new Error("PostgreSQL restore consistency verification failed");
  }

  process.stdout.write("PostgreSQL disposable restore completed and consistency verification passed\n");
}

main();
