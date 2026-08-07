import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dbRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const drizzleDir = path.join(dbRoot, "drizzle");
const journalPath = path.join(drizzleDir, "meta", "_journal.json");

function readJournal() {
  return JSON.parse(fs.readFileSync(journalPath, "utf8"));
}

const before = readJournal();
const beforeEntries = Array.isArray(before.entries) ? before.entries.length : 0;
const beforeSql = new Set(fs.readdirSync(drizzleDir).filter((name) => /^\d{4}_.*\.sql$/.test(name)));

const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "drizzle-kit", "generate", "--config", "./drizzle.config.ts"],
  { cwd: dbRoot, stdio: "inherit", env: process.env },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const after = readJournal();
const afterEntries = Array.isArray(after.entries) ? after.entries.length : 0;
const afterSql = fs.readdirSync(drizzleDir).filter((name) => /^\d{4}_.*\.sql$/.test(name));
const newSql = afterSql.filter((name) => !beforeSql.has(name));

if (afterEntries !== beforeEntries + 1 || newSql.length !== 1) {
  console.error(
    `Drizzle generation did not produce exactly one new migration: journal ${beforeEntries}->${afterEntries}, newSql=${JSON.stringify(newSql)}`,
  );
  process.exit(2);
}

console.log(JSON.stringify({ ok: true, previous_entries: beforeEntries, current_entries: afterEntries, migration: newSql[0] }));
