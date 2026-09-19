import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createStabilizedMigrationFolder } from "./lib/migration-sql-order.mjs";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const committedMigrations = path.join(dbRoot, "drizzle");
const migration19Path = path.join(
  committedMigrations,
  "0019_cashier_location_inventory_cutover.sql",
);
const statementDelimiter = "--> statement-breakpoint\n";

function requireSafeDatabase(connectionString) {
  assert.equal(
    process.env.FAWRI_ALLOW_CASHIER_LOCATION_INVENTORY_CUTOVER_TEST,
    "1",
    "FAWRI_ALLOW_CASHIER_LOCATION_INVENTORY_CUTOVER_TEST=1 is required",
  );
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier location inventory cutover test only permits a local PostgreSQL host",
  );
  assert.equal(
    databaseName,
    "fawri_ci",
    "cashier location inventory cutover test only permits the fawri_ci database",
  );
}

async function resetDatabase(pool) {
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

function migrationsThrough18() {
  const folder = createStabilizedMigrationFolder(committedMigrations);
  fs.rmSync(
    path.join(folder, "0019_cashier_location_inventory_cutover.sql"),
    { force: true },
  );
  fs.rmSync(path.join(folder, "meta", "0019_snapshot.json"), {
    force: true,
  });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry) => Number(entry.idx) <= 18);
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
  return folder;
}

function migration19Statements() {
  return fs
    .readFileSync(migration19Path, "utf8")
    .split(statementDelimiter)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyStatements(client, statements) {
  for (const statement of statements) {
    await client.query(statement);
  }
}

async function expectCheckViolation(work) {
  let failure = null;
  try {
    await work();
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, "expected PostgreSQL check constraint violation");
  assert.equal(String(failure.code), "23514");
}

test("0019 backfills sale location and enables attributed standalone inventory adjustments", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  requireSafeDatabase(connectionString);

  const pool = new Pool({ connectionString, max: 2 });
  const migrationFolder = migrationsThrough18();

  try {
    await resetDatabase(pool);
    await migrate(drizzle(pool), { migrationsFolder: migrationFolder });

    const client = await pool.connect();
    try {
      const merchantId = "cashier_inventory_cutover_test";
      const locationId = "cutover_location_main";
      const stationId = "cutover_station";
      const staffId = "cutover_staff";
      const shiftId = "cutover_shift";

      await client.query(
        `INSERT INTO accounts (id, kind, phone, password_hash)
         VALUES ($1, 'merchant', '07720000000', 'cashier-inventory-cutover-account-hash')`,
        [merchantId],
      );
      await client.query(
        `INSERT INTO merchants (
           id, account_id, owner_name, store_name, activity_type
         ) VALUES ($1, $1, 'Cutover Owner', 'Cutover Store', 'retail')`,
        [merchantId],
      );
      await client.query(
        `INSERT INTO merchant_locations (
           id, merchant_id, name, legacy_branch_key, is_default,
           online_fulfillment_enabled
         ) VALUES ($1, $2, 'Main Location', 'main', TRUE, TRUE)`,
        [locationId, merchantId],
      );
      await client.query(
        `INSERT INTO merchant_cashier_stations (
           id, merchant_id, name, location_id, branch_key, branch_label,
           status, offline_inventory_authority
         ) VALUES ($1, $2, 'Main POS', $3, 'main', 'Main', 'active', FALSE)`,
        [stationId, merchantId, locationId],
      );
      await client.query(
        `INSERT INTO merchant_cashier_staff (
           id, merchant_id, display_name, role, status, pin_hash
         ) VALUES (
           $1, $2, 'Cashier', 'cashier', 'active',
           '12345678901234567890123456789012'
         )`,
        [staffId, merchantId],
      );
      await client.query(
        `INSERT INTO cashier_shifts (
           id, merchant_id, station_id, staff_id, status
         ) VALUES ($1, $2, $3, $4, 'open')`,
        [shiftId, merchantId, stationId, staffId],
      );

      await client.query(
        `INSERT INTO cashier_operation_attribution (
           id, merchant_id, operation_id, sale_id, operation_kind,
           station_id, staff_id, shift_id, device_id,
           station_credential_id, operator_session_id, occurred_at
         ) VALUES (
           'legacy_attr',
           $1,
           'legacy_sale_operation',
           'legacy_sale',
           'sale',
           $2,
           $3,
           $4,
           'device_legacy',
           'credential_legacy',
           'operator_legacy',
           now()
         )`,
        [merchantId, stationId, staffId, shiftId],
      );

      await applyStatements(client, migration19Statements());

      const backfilled = await client.query(
        `SELECT location_id, sale_id, operation_kind
           FROM cashier_operation_attribution
          WHERE merchant_id = $1
            AND operation_id = 'legacy_sale_operation'`,
        [merchantId],
      );
      assert.equal(backfilled.rowCount, 1);
      assert.equal(backfilled.rows[0].location_id, locationId);
      assert.equal(backfilled.rows[0].sale_id, "legacy_sale");
      assert.equal(backfilled.rows[0].operation_kind, "sale");

      await client.query(
        `INSERT INTO cashier_operation_attribution (
           id, merchant_id, operation_id, sale_id, operation_kind,
           station_id, location_id, staff_id, shift_id, device_id,
           station_credential_id, operator_session_id, occurred_at
         ) VALUES (
           'adjust_attr',
           $1,
           'adjust_operation',
           NULL,
           'inventory_adjustment',
           $2,
           $3,
           $4,
           $5,
           'device_adjust',
           'credential_adjust',
           'operator_adjust',
           now()
         )`,
        [merchantId, stationId, locationId, staffId, shiftId],
      );

      await expectCheckViolation(() =>
        client.query(
          `INSERT INTO cashier_operation_attribution (
             id, merchant_id, operation_id, sale_id, operation_kind,
             station_id, location_id, staff_id, shift_id, device_id,
             station_credential_id, operator_session_id, occurred_at
           ) VALUES (
             'invalid_sale_without_sale_id',
             $1,
             'invalid_sale_operation',
             NULL,
             'sale',
             $2,
             $3,
             $4,
             $5,
             'device_invalid_sale',
             'credential_invalid_sale',
             'operator_invalid_sale',
             now()
           )`,
          [merchantId, stationId, locationId, staffId, shiftId],
        ),
      );

      await expectCheckViolation(() =>
        client.query(
          `INSERT INTO cashier_operation_attribution (
             id, merchant_id, operation_id, sale_id, operation_kind,
             station_id, location_id, staff_id, shift_id, device_id,
             station_credential_id, operator_session_id, occurred_at
           ) VALUES (
             'invalid_adjust_with_sale_id',
             $1,
             'invalid_adjust_operation',
             'not_allowed',
             'inventory_adjustment',
             $2,
             $3,
             $4,
             $5,
             'device_invalid_adjust',
             'credential_invalid_adjust',
             'operator_invalid_adjust',
             now()
           )`,
          [merchantId, stationId, locationId, staffId, shiftId],
        ),
      );

      const table = await client.query(
        `SELECT relrowsecurity
           FROM pg_class
          WHERE relname = 'location_inventory_mutations'`,
      );
      assert.equal(table.rowCount, 1);
      assert.equal(table.rows[0].relrowsecurity, true);

      const policy = await client.query(
        `SELECT policyname
           FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'location_inventory_mutations'`,
      );
      assert.deepEqual(
        policy.rows.map((row) => row.policyname),
        ["location_inventory_mutations_tenant_boundary"],
      );

      const columns = await client.query(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'cashier_operation_attribution'
            AND column_name IN ('sale_id', 'location_id')
          ORDER BY column_name`,
      );
      assert.deepEqual(columns.rows, [
        { column_name: "location_id", is_nullable: "NO" },
        { column_name: "sale_id", is_nullable: "YES" },
      ]);
    } finally {
      client.release();
    }
  } finally {
    fs.rmSync(migrationFolder, { recursive: true, force: true });
    await resetDatabase(pool).catch(() => undefined);
    await pool.end();
  }
});
