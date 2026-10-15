import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function parseArgs(argv) {
  if (argv.length % 2 !== 0) throw new Error("Invalid object restore argument list");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("Invalid object restore argument list");
    values.set(key, value);
  }
  for (const key of values.keys()) {
    if (!new Set(["--backup", "--target"]).has(key)) throw new Error("Unknown object restore argument");
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

function assertInsideDisposableRoot(candidate) {
  const configuredRoot = process.env.FAWRI_DISPOSABLE_OBJECT_ROOT;
  if (!configuredRoot) throw new Error("Disposable object root is required");
  const root = path.resolve(configuredRoot);
  const resolved = path.resolve(candidate);
  if (root === path.parse(root).root || resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Object restore path is outside the approved disposable root");
  }
  return resolved;
}

function main() {
  if (process.env.FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE !== "1") {
    throw new Error("Object-storage restore drill is disabled; explicit disposable guard is required");
  }

  const { backup, target } = parseArgs(process.argv.slice(2));
  if (!backup || !target) {
    throw new Error("Usage: node scripts/restore-object-storage.mjs --backup <dir> --target <dir>");
  }

  const backupDir = assertInsideDisposableRoot(backup);
  const targetDir = assertInsideDisposableRoot(target);
  if (targetDir === backupDir || targetDir.startsWith(`${backupDir}${path.sep}`)) {
    throw new Error("Object restore target must be separate from the backup directory");
  }

  const manifest = JSON.parse(readFileSync(path.join(backupDir, "manifest.json"), "utf8"));
  if (manifest.format !== "fawri-object-backup-v1" || !Array.isArray(manifest.objects)) {
    throw new Error("Unsupported object backup manifest");
  }

  for (const entry of manifest.objects) {
    const relative = safeObjectPath(entry.path);
    const source = path.join(backupDir, "objects", relative);
    const stat = statSync(source, { throwIfNoEntry: false });
    if (
      typeof entry.size !== "number" ||
      typeof entry.sha256 !== "string" ||
      !stat?.isFile() ||
      stat.size !== entry.size ||
      sha256(source) !== entry.sha256
    ) {
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

  process.stdout.write(`Disposable object restore verified: ${manifest.objects.length} objects\n`);
}

main();
