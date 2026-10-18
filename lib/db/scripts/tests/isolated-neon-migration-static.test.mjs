import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { stabilizeMigrationDependencyOrder } from "../lib/migration-sql-order.mjs";

const drizzleFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(drizzleFolder, "meta/_journal.json"), "utf8"));

test("committed migration journal is ordered and every SQL source can be hashed", () => {
  assert.ok(journal.entries.length > 0);
  for (const [index, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, index);
    assert.ok(Number.isSafeInteger(entry.when));
    assert.match(entry.tag, /^[a-zA-Z0-9_-]+$/);
    const sql = fs.readFileSync(path.join(drizzleFolder, entry.tag + ".sql"), "utf8");
    const stabilized = stabilizeMigrationDependencyOrder(sql);
    assert.match(createHash("sha256").update(stabilized).digest("hex"), /^[a-f0-9]{64}$/);
    assert.equal(stabilizeMigrationDependencyOrder(stabilized), stabilized, "stabilization must be idempotent: " + entry.tag);
  }
});

test("preflight contains explicit read-only transaction safeguards", () => {
  const source = fs.readFileSync(path.join(drizzleFolder, "../scripts/preflight-isolated-neon-migrations.mjs"), "utf8");
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /SHOW transaction_read_only/);
  assert.match(source, /ROLLBACK/);
  assert.doesNotMatch(source, /client\.query\(["\x27](?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
  assert.match(source, /FAWRI_ISOLATED_NEON_CONFIRM_BRANCH/);
  assert.match(source, /stabilizeMigrationDependencyOrder\(sourceSql\)/);
});
