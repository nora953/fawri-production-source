import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("Expected --backup and --target arguments");
    values.set(key, value);
  }
  return { backup: values.get("--backup"), target: values.get("--target") };
}

function safeObjectPath(relative) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    relative.startsWith("../") ||
    relative.includes("/../") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Backup manifest contains an unsafe object path");
  }
  return relative;
}

function main() {
  if (process.env.FAWRI_ALLOW_OBJECT_RESTORE !== "1") {
    throw new Error("Object restore is disabled; set FAWRI_ALLOW_OBJECT_RESTORE=1 for an approved target");
  }

  const { backup, target } = parseArgs(process.argv.slice(2));
  if (!backup || !target) {
    throw new Error("Usage: node scripts/restore-object-storage.mjs --backup <dir> --target <dir>");
  }

  const backupDir = path.resolve(backup);
  const targetDir = path.resolve(target);
  const manifest = JSON.parse(readFileSync(path.join(backupDir, "manifest.json"), "utf8"));
  if (manifest.format !== "fawri-object-backup-v1" || !Array.isArray(manifest.objects)) {
    throw new Error("Unsupported object backup manifest");
  }

  for (const entry of manifest.objects) {
    const relative = safeObjectPath(entry.path);
    const source = path.join(backupDir, "objects", relative);
    const stat = statSync(source, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size !== entry.size || sha256(source) !== entry.sha256) {
      throw new Error(`Backup object verification failed: ${relative}`);
    }
  }

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  for (const entry of manifest.objects) {
    const relative = safeObjectPath(entry.path);
    const source = path.join(backupDir, "objects", relative);
    const destination = path.join(targetDir, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination, { force: false, errorOnExist: true });
  }

  for (const entry of manifest.objects) {
    const relative = safeObjectPath(entry.path);
    const restored = path.join(targetDir, relative);
    const stat = statSync(restored, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size !== entry.size || sha256(restored) !== entry.sha256) {
      throw new Error(`Restored object verification failed: ${relative}`);
    }
  }

  process.stdout.write(`Object restore verified: ${manifest.objects.length} objects\n`);
}

main();
