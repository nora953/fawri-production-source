import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("Invalid restore argument list");
    values.set(key, value);
  }
  return {
    url: values.get("--url"),
    backup: values.get("--backup"),
    manifest: values.get("--manifest"),
    verifySql: values.get("--verify-sql"),
    expect: values.get("--expect"),
  };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "command failed").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]");
    throw new Error(`${command} failed: ${detail.trim()}`);
  }
  return (result.stdout ?? "").trim();
}

function main() {
  if (process.env.FAWRI_ALLOW_POSTGRES_RESTORE !== "1") {
    throw new Error("PostgreSQL restore is disabled; set FAWRI_ALLOW_POSTGRES_RESTORE=1 for an approved target");
  }

  const { url, backup, manifest, verifySql, expect } = parseArgs(process.argv.slice(2));
  if (!url || !backup || !manifest || !verifySql || expect === undefined) {
    throw new Error(
      "Usage: node scripts/restore-postgresql.mjs --url <url> --backup <dump> --manifest <json> --verify-sql <sql> --expect <value>",
    );
  }

  const backupPath = path.resolve(backup);
  const metadata = JSON.parse(readFileSync(path.resolve(manifest), "utf8"));
  const stat = statSync(backupPath, { throwIfNoEntry: false });
  if (
    metadata.format !== "fawri-postgresql-backup-v1" ||
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
    throw new Error(`PostgreSQL restore verification failed: expected ${JSON.stringify(expect)}, received ${JSON.stringify(actual)}`);
  }

  process.stdout.write("PostgreSQL restore completed and verification query passed\n");
}

main();
