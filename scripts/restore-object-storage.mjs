import { createHash } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
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
    relative.includes("\\") ||
    relative.includes("\0") ||
    relative.split("/").some((part) => !part || part === "." || part === "..") ||
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
  const rootInfo = lstatSync(root, { throwIfNoEntry: false });
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink() || realpathSync(root) !== root) {
    throw new Error("Disposable object root must be a real directory");
  }
  let current = root;
  for (const part of path.relative(root, resolved).split(path.sep)) {
    current = path.join(current, part);
    const info = lstatSync(current, { throwIfNoEntry: false });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) {
      throw new Error("Disposable object restore path must not use aliases");
    }
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
  if (targetDir === backupDir ||
      targetDir.startsWith(`${backupDir}${path.sep}`) ||
      backupDir.startsWith(`${targetDir}${path.sep}`)) {
    // Restoring into a parent of the backup would erase the source archive.
    throw new Error("Object restore target must not overlap the backup directory");
  }

  const manifest = JSON.parse(readFileSync(path.join(backupDir, "manifest.json"), "utf8"));
  if (manifest.format !== "fawri-object-backup-v1" || !Array.isArray(manifest.objects)) {
    throw new Error("Unsupported object backup manifest");
  }

  if (manifest.object_count !== manifest.objects.length ||
      !Number.isSafeInteger(manifest.total_bytes) || manifest.total_bytes < 0) {
    throw new Error("Backup manifest totals do not match");
  }
  const objectsRoot = path.join(backupDir, "objects");
  const objectsInfo = lstatSync(objectsRoot, { throwIfNoEntry: false });
  if (!objectsInfo?.isDirectory() || objectsInfo.isSymbolicLink()) {
    throw new Error("Backup objects root must be a real directory");
  }
  const seen = new Set();
  let verifiedBytes = 0;
  for (const entry of manifest.objects) {
    const relative = safeObjectPath(entry?.path);
    if (seen.has(relative)) throw new Error("Duplicate object backup path");
    seen.add(relative);
    // Never resolve an archive entry through a symlink, even if the file
    // size/hash matches. A crafted archive could otherwise expose files
    // outside the approved disposable fixture tree.
    let parent = objectsRoot;
    for (const part of relative.split("/").slice(0, -1)) {
      parent = path.join(parent, part);
      const info = lstatSync(parent, { throwIfNoEntry: false });
      if (!info?.isDirectory() || info.isSymbolicLink()) {
        throw new Error("Backup object path contains an alias");
      }
    }
    const source = path.join(objectsRoot, relative);
    const stat = lstatSync(source, { throwIfNoEntry: false });
    if (
      !Number.isSafeInteger(entry.size) || entry.size < 0 ||
      typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !stat?.isFile() || stat.isSymbolicLink() ||
      stat.size !== entry.size ||
      sha256(source) !== entry.sha256
    ) {
      throw new Error(`Backup object verification failed: ${relative}`);
    }
    verifiedBytes += entry.size;
  }
  if (verifiedBytes !== manifest.total_bytes) {
    throw new Error("Backup manifest byte count does not match");
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
