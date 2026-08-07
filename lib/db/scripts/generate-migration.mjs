import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const repositoryRoot = path.resolve(dbRoot, "../..");
const drizzleDir = path.join(dbRoot, "drizzle");
const journalPath = path.join(drizzleDir, "meta", "_journal.json");
const bootstrap = {
  id: "8996172940",
  zipSha256: "f453ca2da2acbdc6033e80e4aaa236976928d949c3d4a77a2fdb7e7c85984ba0",
  sql: ["0002_outstanding_kylun.sql", "f1a7d3435b2b636a03053d7bff77b2c1d25fe1766e4825f8b01c6b3e456b3eda"],
  snapshot: ["meta/0002_snapshot.json", "75998d8f656d6d33f4099f4eb095aac080a3499f6a087d2bbab5da3dfafd192c"],
  journal: ["meta/_journal.json", "ca15203871331fb59cdaf52e9126b005da105a2f6dfd4146a0f9d215447267a6"],
};

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function readJournal() {
  return JSON.parse(fs.readFileSync(journalPath, "utf8"));
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || dbRoot,
    env: process.env,
    encoding: options.encoding,
    stdio: options.stdio || (options.encoding ? undefined : "inherit"),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = options.encoding
      ? `${command} failed (${result.status}): ${String(result.stderr || result.stdout || "").trim()}`
      : `${command} failed (${result.status})`;
    throw new Error(message);
  }
  return result;
}
function checkoutAuthorizationHeader() {
  const result = run(
    "git",
    ["config", "--local", "--get", "http.https://github.com/.extraheader"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  const header = String(result.stdout || "").trim();
  if (!/^AUTHORIZATION:\s+/i.test(header)) {
    throw new Error("GitHub checkout authorization header is unavailable for read-only artifact bootstrap");
  }
  return header;
}
function bootstrapStageOneIfNeeded() {
  const entries = readJournal().entries || [];
  if (entries.length !== 2 || fs.existsSync(path.join(drizzleDir, bootstrap.sql[0]))) return;
  if (!process.env.GITHUB_ACTIONS) {
    throw new Error("Generated 0002 bootstrap is required; run schema generation in GitHub Actions");
  }
  const authorizationHeader = checkoutAuthorizationHeader();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-migration-bootstrap-"));
  const zipPath = path.join(temp, "artifact.zip");
  const extractDir = path.join(temp, "artifact");
  fs.mkdirSync(extractDir);
  try {
    run("curl", [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "-H",
      authorizationHeader,
      "-H",
      "X-GitHub-Api-Version: 2022-11-28",
      `https://api.github.com/repos/nora953/fawri-production-source/actions/artifacts/${bootstrap.id}/zip`,
      "-o",
      zipPath,
    ]);
    if (sha256(zipPath) !== bootstrap.zipSha256) throw new Error("0002 bootstrap ZIP SHA-256 mismatch");
    run("unzip", ["-q", zipPath, "-d", extractDir]);
    for (const [relative, expected] of [bootstrap.sql, bootstrap.snapshot, bootstrap.journal]) {
      const source = path.join(extractDir, relative);
      if (sha256(source) !== expected) throw new Error(`0002 bootstrap SHA-256 mismatch: ${relative}`);
      const target = path.join(drizzleDir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    if ((readJournal().entries || []).length !== 3) throw new Error("0002 bootstrap journal is invalid");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

bootstrapStageOneIfNeeded();
const before = readJournal();
const beforeEntries = Array.isArray(before.entries) ? before.entries.length : 0;
const beforeSql = new Set(fs.readdirSync(drizzleDir).filter((name) => /^\d{4}_.*\.sql$/.test(name)));
run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "drizzle-kit", "generate", "--config", "./drizzle.config.ts"]);
const after = readJournal();
const afterEntries = Array.isArray(after.entries) ? after.entries.length : 0;
const afterSql = fs.readdirSync(drizzleDir).filter((name) => /^\d{4}_.*\.sql$/.test(name));
const newSql = afterSql.filter((name) => !beforeSql.has(name));
if (afterEntries !== beforeEntries + 1 || newSql.length !== 1) {
  throw new Error(`Drizzle generation must produce exactly one migration: journal ${beforeEntries}->${afterEntries}, newSql=${JSON.stringify(newSql)}`);
}
console.log(JSON.stringify({ ok: true, previous_entries: beforeEntries, current_entries: afterEntries, migration: newSql[0] }));
