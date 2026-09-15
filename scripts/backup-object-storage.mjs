import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walk(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in disposable object backup");
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...walk(root, absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function safeRelative(root, file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || relative.includes("/../") || path.isAbsolute(relative)) {
    throw new Error("Unsafe object path in disposable backup");
  }
  return relative;
}

function parseArgs(argv) {
  if (argv.length % 2 !== 0) throw new Error("Invalid object backup argument list");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("Invalid object backup argument list");
    values.set(key, value);
  }
  for (const key of values.keys()) {
    if (!new Set(["--source", "--output"]).has(key)) throw new Error("Unknown object backup argument");
  }
  return { source: values.get("--source"), output: values.get("--output") };
}

function assertInsideDisposableRoot(candidate) {
  const configuredRoot = process.env.FAWRI_DISPOSABLE_OBJECT_ROOT;
  if (!configuredRoot) throw new Error("Disposable object root is required");
  const root = path.resolve(configuredRoot);
  const resolved = path.resolve(candidate);
  if (root === path.parse(root).root || resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Object backup path is outside the approved disposable root");
  }
  return resolved;
}

function main() {
  if (process.env.FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP !== "1") {
    throw new Error("Object-storage backup drill is disabled; explicit disposable guard is required");
  }

  const { source, output } = parseArgs(process.argv.slice(2));
  if (!source || !output) {
    throw new Error("Usage: node scripts/backup-object-storage.mjs --source <dir> --output <dir>");
  }

  const sourceDir = assertInsideDisposableRoot(source);
  const outputDir = assertInsideDisposableRoot(output);
  const sourceStat = statSync(sourceDir, { throwIfNoEntry: false });
  if (!sourceStat?.isDirectory()) throw new Error("Object storage source must be a disposable directory");
  if (outputDir === sourceDir || outputDir.startsWith(`${sourceDir}${path.sep}`)) {
    throw new Error("Backup output must not be inside the source directory");
  }

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(path.join(outputDir, "objects"), { recursive: true });

  const entries = walk(sourceDir)
    .map((file) => {
      const relative = safeRelative(sourceDir, file);
      const destination = path.join(outputDir, "objects", relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(file, destination, { force: false, errorOnExist: true });
      const stat = statSync(file);
      return { path: relative, size: stat.size, sha256: sha256(file) };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const manifest = {
    format: "fawri-object-backup-v1",
    created_at: new Date().toISOString(),
    object_count: entries.length,
    total_bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    objects: entries,
  };
  writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Disposable object backup created and checksummed: ${entries.length} objects\n`);
}

main();
