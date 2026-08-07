import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walk(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in object backup: ${entry.name}`);
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...walk(root, absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function safeRelative(root, file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe object path: ${relative}`);
  }
  return relative;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("Expected --source and --output arguments");
    values.set(key, value);
  }
  return { source: values.get("--source"), output: values.get("--output") };
}

function main() {
  const { source, output } = parseArgs(process.argv.slice(2));
  if (!source || !output) {
    throw new Error("Usage: node scripts/backup-object-storage.mjs --source <dir> --output <dir>");
  }

  const sourceDir = path.resolve(source);
  const outputDir = path.resolve(output);
  const sourceStat = statSync(sourceDir, { throwIfNoEntry: false });
  if (!sourceStat?.isDirectory()) throw new Error("Object storage source must be a directory");
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
  writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`Object backup created: ${entries.length} objects\n`);
}

main();
