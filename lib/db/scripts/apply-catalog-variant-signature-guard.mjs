import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createStabilizedMigrationFolder } from "./lib/migration-sql-order.mjs";

const { Pool } = pg;
const TARGET_TAG = "0012_catalog_variant_signature_guard";
const EXPECTED_TARGET_SQL_SHA256 = "9a6522b949e99f8799635208d9288a9125933d752f70ba6e275d38c8f46d16ed";
const EXPECTED_PREVIOUS_TAG = "0011_commerce_promotions_timezone_authority";

assert.equal(
  process.env.FAWRI_ALLOW_CATALOG_SIGNATURE_MIGRATION,
  "1",
  "FAWRI_ALLOW_CATALOG_SIGNATURE_MIGRATION=1 is required",
);

const connectionString = String(process.env.DATABASE_URL || "").trim();
assert.ok(connectionString, "DATABASE_URL is required");
const expectedDatabase = String(process.env.FAWRI_EXPECT_DATABASE || "").trim();
assert.ok(expectedDatabase, "FAWRI_EXPECT_DATABASE is required");

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
const targetIndex = entries.findIndex((entry) => entry.tag === TARGET_TAG);
assert.equal(targetIndex, 12, `${TARGET_TAG} must remain migration index 12`);
assert.equal(
  entries.filter((entry) => entry.tag === TARGET_TAG).length,
  1,
  `${TARGET_TAG} must be registered exactly once`,
);
assert.ok(entries.length >= targetIndex + 1, `${TARGET_TAG} is missing from committed migration history`);
assert.equal(entries[targetIndex]?.idx, targetIndex, `${TARGET_TAG} journal index changed`);
assert.equal(entries[targetIndex - 1]?.tag, EXPECTED_PREVIOUS_TAG, "unexpected migration immediately before target");

const targetEntry = entries[targetIndex];
const targetSqlPath = path.join(migrationsRoot, `${TARGET_TAG}.sql`);
assert.ok(fs.existsSync(targetSqlPath), `${TARGET_TAG}.sql is missing`);
const targetSqlSha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(targetSqlPath, "utf8"))
  .digest("hex");
assert.equal(
  targetSqlSha256,
  EXPECTED_TARGET_SQL_SHA256,
  "target migration SQL hash changed; re-review before applying",
);

function createTargetMigrationFolder(sourceFolder) {
  const destination = createStabilizedMigrationFolder(sourceFolder);
  const journalPath = path.join(destination, "meta", "_journal.json");
  const scopedJournal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  assert.ok(Array.isArray(scopedJournal.entries), "migration journal entries are missing");
  assert.equal(scopedJournal.entries[targetIndex]?.tag, TARGET_TAG, "target migration moved in stabilized journal");
  scopedJournal.entries = scopedJournal.entries.slice(0, targetIndex + 1);
  fs.writeFileSync(journalPath, `${JSON.stringify(scopedJournal, null, 2)}\n`, "utf8");

  for (const entry of entries.slice(targetIndex + 1)) {
    fs.rmSync(path.join(destination, `${entry.tag}.sql`), { force: true });
  }
  return destination;
}

const pool = new Pool({ connectionString, max: 1 });
let migrationsFolder;

async function readHistory(client) {
  const table = (
    await client.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table",
    )
  ).rows[0]?.migration_table;
  assert.ok(table, "drizzle migration history table is missing");
  return (
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

function assertKnownPrefix(history) {
  assert.ok(history.length <= entries.length, "database migration history is ahead of the reviewed journal");
  const actualTimes = history.map((row) => row.created_at);
  const expectedTimes = entries.slice(0, history.length).map((entry) => entry.when);
  assert.deepEqual(actualTimes, expectedTimes, "database migration history is not the exact reviewed journal prefix");
  assert.equal(new Set(actualTimes).size, actualTimes.length, "database migration history contains duplicate timestamps");
}

async function readGuardState(client) {
  const variantsTable = (
    await client.query(
      "SELECT to_regclass('public.product_variants')::text AS product_variants_table",
    )
  ).rows[0]?.product_variants_table;
  assert.ok(variantsTable, "product_variants table is missing");

  const signatureStats = (
    await client.query(`
      SELECT COUNT(*)::int AS variant_count,
             COUNT(*) FILTER (
               WHERE char_length(option_signature) NOT BETWEEN 16 AND 256
             )::int AS invalid_signature_count
      FROM product_variants
    `)
  ).rows[0];

  const guard = (
    await client.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'product_variants_option_signature_guard'
            AND NOT tgisinternal
        ) AS trigger_present,
        EXISTS (
          SELECT 1 FROM pg_proc
          WHERE proname = 'fawri_normalize_catalog_variant_signature'
        ) AS normalizer_present
    `)
  ).rows[0];

  return {
    variant_count: Number(signatureStats.variant_count),
    invalid_signature_count: Number(signatureStats.invalid_signature_count),
    trigger_present: Boolean(guard.trigger_present),
    normalizer_present: Boolean(guard.normalizer_present),
  };
}

try {
  const client = await pool.connect();
  let alreadyApplied = false;
  try {
    const database = (
      await client.query("SELECT current_database() AS current_database")
    ).rows[0]?.current_database;
    assert.equal(database, expectedDatabase, `connected database ${database} does not match FAWRI_EXPECT_DATABASE`);

    const history = await readHistory(client);
    assertKnownPrefix(history);
    const guardBefore = await readGuardState(client);
    assert.equal(guardBefore.invalid_signature_count, 0, "invalid option signatures exist before migration");

    if (history.length >= targetIndex + 1) {
      assert.equal(history[targetIndex]?.created_at, targetEntry.when, "target migration is missing from applied history");
      assert.equal(guardBefore.trigger_present, true, "target history exists but trigger is missing");
      assert.equal(guardBefore.normalizer_present, true, "target history exists but normalizer is missing");
      alreadyApplied = true;
      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: "catalog_variant_signature_guard_apply",
        database,
        target: targetEntry,
        target_sql_sha256: targetSqlSha256,
        already_applied: true,
        migration_history_count: history.length,
        variant_count: guardBefore.variant_count,
        invalid_signature_count: guardBefore.invalid_signature_count,
        trigger_present: guardBefore.trigger_present,
        normalizer_present: guardBefore.normalizer_present,
        database_writes_performed: false,
      }, null, 2)}\n`);
    } else {
      assert.equal(history.length, targetIndex, "database must be applied exactly through migration 0011 before applying 0012");
      assert.equal(entries[history.length]?.tag, TARGET_TAG, "0012 is not the next pending migration");
      assert.equal(guardBefore.trigger_present, false, "guard trigger already exists without migration history; manual review required");
      assert.equal(guardBefore.normalizer_present, false, "guard normalizer already exists without migration history; manual review required");
    }
  } finally {
    client.release();
  }

  if (!alreadyApplied) {
    migrationsFolder = createTargetMigrationFolder(migrationsRoot);
    const database = drizzle(pool);
    await migrate(database, { migrationsFolder });

    const verifyClient = await pool.connect();
    try {
      const historyAfter = await readHistory(verifyClient);
      assertKnownPrefix(historyAfter);
      assert.equal(historyAfter.length, targetIndex + 1, "migration history count did not advance exactly through 0012");
      assert.equal(historyAfter[targetIndex]?.created_at, targetEntry.when, "0012 was not recorded at migration index 12");

      const guardAfter = await readGuardState(verifyClient);
      assert.equal(guardAfter.invalid_signature_count, 0, "invalid signatures exist after migration");
      assert.equal(guardAfter.trigger_present, true, "catalog variant signature guard trigger was not installed");
      assert.equal(guardAfter.normalizer_present, true, "catalog variant signature normalizer was not installed");

      const shortSignature = (
        await verifyClient.query(
          "SELECT fawri_normalize_catalog_variant_signature('size=s') AS normalized",
        )
      ).rows[0]?.normalized;
      assert.ok(
        typeof shortSignature === "string" && shortSignature.length >= 16 && shortSignature.length <= 256,
        "catalog variant signature normalizer failed its short-signature contract",
      );

      const databaseName = (
        await verifyClient.query("SELECT current_database() AS current_database")
      ).rows[0]?.current_database;
      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: "catalog_variant_signature_guard_apply",
        database: databaseName,
        target: targetEntry,
        target_sql_sha256: targetSqlSha256,
        already_applied: false,
        migration_history_count: historyAfter.length,
        variant_count: guardAfter.variant_count,
        invalid_signature_count: guardAfter.invalid_signature_count,
        trigger_present: guardAfter.trigger_present,
        normalizer_present: guardAfter.normalizer_present,
        short_signature_normalization_verified: true,
        database_writes_performed: true,
      }, null, 2)}\n`);
    } finally {
      verifyClient.release();
    }
  }
} finally {
  await pool.end();
  if (migrationsFolder) fs.rmSync(migrationsFolder, { recursive: true, force: true });
}
