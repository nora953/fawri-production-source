import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const connectionString = String(process.env.DATABASE_URL || "").trim();
assert.ok(connectionString, "DATABASE_URL is required");

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(currentDirectory, "../drizzle");
const journal = JSON.parse(
  fs.readFileSync(path.join(migrationsRoot, "meta", "_journal.json"), "utf8"),
);
const entries = (Array.isArray(journal.entries) ? journal.entries : []).map((entry) => ({
  idx: Number(entry.idx),
  tag: String(entry.tag || ""),
  when: Number(entry.when),
}));
assert.ok(entries.length > 0, "migration journal is empty");

const targetTag = "0012_catalog_variant_signature_guard";
const targetIndex = entries.findIndex((entry) => entry.tag === targetTag);
assert.ok(targetIndex >= 0, `${targetTag} is missing from the migration journal`);
const targetEntry = entries[targetIndex];
const targetSqlPath = path.join(migrationsRoot, `${targetTag}.sql`);
assert.ok(fs.existsSync(targetSqlPath), `${targetTag}.sql is missing`);
const targetHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(targetSqlPath, "utf8"))
  .digest("hex");

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN READ ONLY");

  const [{ current_database: database }] = (
    await client.query("SELECT current_database() AS current_database")
  ).rows;

  const [{ migration_table }] = (
    await client.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table",
    )
  ).rows;

  let history = [];
  if (migration_table) {
    history = (
      await client.query(`
        SELECT id, hash, created_at::text AS created_at
        FROM "drizzle"."__drizzle_migrations"
        ORDER BY created_at ASC, id ASC
      `)
    ).rows.map((row) => ({
      id: Number(row.id),
      hash: String(row.hash || ""),
      created_at: Number(row.created_at),
    }));
  }

  const actualTimes = history.map((row) => row.created_at);
  const expectedPrefix = entries.slice(0, history.length).map((entry) => entry.when);
  const historyIsKnownPrefix =
    Boolean(migration_table) &&
    history.length <= entries.length &&
    actualTimes.every((value, index) => value === expectedPrefix[index]);
  const uniqueHistoryTimes = new Set(actualTimes).size === actualTimes.length;
  const unknownHistoryTimes = actualTimes.filter(
    (value) => !entries.some((entry) => entry.when === value),
  );
  const appliedEntries = historyIsKnownPrefix ? entries.slice(0, history.length) : [];
  const latestApplied = appliedEntries.at(-1) || null;
  const nextPending = historyIsKnownPrefix ? entries[history.length] || null : null;
  const targetAlreadyRecorded = actualTimes.includes(targetEntry.when);

  const [{ product_variants_table }] = (
    await client.query(
      "SELECT to_regclass('public.product_variants')::text AS product_variants_table",
    )
  ).rows;

  let invalidSignatureCount = null;
  if (product_variants_table) {
    const row = (
      await client.query(`
        SELECT COUNT(*) FILTER (
          WHERE char_length(option_signature) NOT BETWEEN 16 AND 256
        )::int AS invalid_signature_count
        FROM product_variants
      `)
    ).rows[0];
    invalidSignatureCount = Number(row.invalid_signature_count);
  }

  const safeToApplyTarget =
    Boolean(migration_table) &&
    Boolean(product_variants_table) &&
    historyIsKnownPrefix &&
    uniqueHistoryTimes &&
    unknownHistoryTimes.length === 0 &&
    history.length === targetIndex &&
    nextPending?.tag === targetTag &&
    !targetAlreadyRecorded &&
    invalidSignatureCount === 0;

  await client.query("ROLLBACK");

  const report = {
    ok: safeToApplyTarget || targetAlreadyRecorded,
    mode: "read_only_catalog_variant_signature_migration_history_readiness",
    database,
    migration_table_present: Boolean(migration_table),
    migration_history_count: history.length,
    committed_journal_count: entries.length,
    history_is_exact_known_prefix: historyIsKnownPrefix && uniqueHistoryTimes,
    unknown_history_times: unknownHistoryTimes,
    latest_applied_migration: latestApplied,
    next_pending_migration: nextPending,
    target_migration: targetEntry,
    target_sql_sha256: targetHash,
    target_already_recorded: targetAlreadyRecorded,
    product_variants_table_present: Boolean(product_variants_table),
    invalid_signature_count: invalidSignatureCount,
    safe_to_apply_target_migration: safeToApplyTarget,
    database_writes_performed: false,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 2;
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
