import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
const migration18Path = path.join(
  committedMigrations,
  "0018_cashier_location_binding.sql",
);
const statementDelimiter = "--> statement-breakpoint\n";

function requireSafeDatabase(connectionString) {
  assert.equal(
    process.env.FAWRI_ALLOW_CASHIER_LOCATION_BINDING_TEST,
    "1",
    "FAWRI_ALLOW_CASHIER_LOCATION_BINDING_TEST=1 is required",
  );
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier location binding test only permits a local PostgreSQL host",
  );
  assert.equal(
    databaseName,
    "fawri_ci",
    "cashier location binding test only permits the fawri_ci database",
  );
}

async function resetDatabase(pool) {
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

function migrationsThrough17() {
  const folder = createStabilizedMigrationFolder(committedMigrations);
  fs.rmSync(path.join(folder, "0018_cashier_location_binding.sql"), {
    force: true,
  });
  fs.rmSync(path.join(folder, "meta", "0018_snapshot.json"), {
    force: true,
  });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry) => Number(entry.idx) <= 17);
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
  return folder;
}

function migration18Statements() {
  return fs
    .readFileSync(migration18Path, "utf8")
    .split(statementDelimiter)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyStatements(client, statements) {
  for (const statement of statements) {
    await client.query(statement);
  }
}

test("0018 binds legacy cashier branches to stable locations without inventing stock", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  requireSafeDatabase(connectionString);

  const pool = new Pool({ connectionString, max: 2 });
  const migrationFolder = migrationsThrough17();

  try {
    await resetDatabase(pool);
    await migrate(drizzle(pool), { migrationsFolder: migrationFolder });

    const client = await pool.connect();
    try {
      const merchantId = "cashier_location_binding_test";
      await client.query(
        `INSERT INTO accounts (id, kind, phone, password_hash)
         VALUES ($1, 'merchant', '07710000000', 'cashier-location-binding-test-hash')`,
        [merchantId],
      );
      await client.query(
        `INSERT INTO merchants (
           id, account_id, owner_name, store_name, activity_type
         ) VALUES ($1, $1, 'Binding Test Owner', 'Binding Test Store', 'retail')`,
        [merchantId],
      );

      await client.query(
        `INSERT INTO merchant_locations (
           id, merchant_id, name, is_default, online_fulfillment_enabled
         ) VALUES ('loc_default', $1, 'Main Location', TRUE, TRUE)`,
        [merchantId],
      );
      await client.query(
        `INSERT INTO products (
           id, merchant_id, name, quantity, low_stock_threshold, metadata
         ) VALUES (
           'product_existing',
           $1,
           'Existing Product',
           25,
           5,
           '{"fawri_catalog_v2":{"item_type":"product","track_inventory":true}}'::jsonb
         )`,
        [merchantId],
      );
      await client.query(
        `INSERT INTO location_inventory_levels (
           id, merchant_id, location_id, product_id,
           on_hand_quantity, reserved_quantity, low_stock_threshold
         ) VALUES (
           'inventory_existing',
           $1,
           'loc_default',
           'product_existing',
           25,
           0,
           5
         )`,
        [merchantId],
      );

      await client.query(
        `INSERT INTO merchant_cashier_stations (
           id, merchant_id, name, branch_key, branch_label,
           status, offline_inventory_authority
         ) VALUES
           ('station_main', $1, 'Main POS', 'main', 'Main', 'active', FALSE),
           ('station_karrada_a', $1, 'Karrada POS A', 'karrada', 'Karrada', 'active', TRUE),
           ('station_karrada_b', $1, 'Karrada POS B', 'karrada', 'Karrada', 'active', FALSE),
           ('station_adhamiya', $1, 'Adhamiya POS', 'adhamiya', 'Adhamiya', 'active', FALSE)`,
        [merchantId],
      );

      const lateMerchantId = "cashier_location_binding_late_merchant";
      await client.query(
        `INSERT INTO accounts (id, kind, phone, password_hash)
         VALUES ($1, 'merchant', '07710000001', 'cashier-location-binding-late-hash')`,
        [lateMerchantId],
      );
      await client.query(
        `INSERT INTO merchants (
           id, account_id, owner_name, store_name, activity_type
         ) VALUES ($1, $1, 'Late Owner', 'Late Store', 'retail')`,
        [lateMerchantId],
      );
      await client.query(
        `INSERT INTO merchant_cashier_stations (
           id, merchant_id, name, branch_key, branch_label,
           status, offline_inventory_authority
         ) VALUES (
           'station_late_main',
           $1,
           'Late Main POS',
           'main',
           'Main',
           'active',
           FALSE
         )`,
        [lateMerchantId],
      );

      await applyStatements(client, migration18Statements());

      const locations = await client.query(
        `SELECT
           id,
           legacy_branch_key,
           is_default,
           online_fulfillment_enabled
         FROM merchant_locations
         WHERE merchant_id = $1
         ORDER BY legacy_branch_key`,
        [merchantId],
      );
      assert.equal(locations.rowCount, 3);

      const byBranch = new Map(
        locations.rows.map((row) => [row.legacy_branch_key, row]),
      );
      assert.equal(byBranch.get("main")?.id, "loc_default");
      assert.equal(byBranch.get("main")?.is_default, true);
      assert.equal(byBranch.get("main")?.online_fulfillment_enabled, true);
      assert.equal(byBranch.get("karrada")?.is_default, false);
      assert.equal(byBranch.get("karrada")?.online_fulfillment_enabled, false);
      assert.equal(byBranch.get("adhamiya")?.online_fulfillment_enabled, false);

      const stations = await client.query(
        `SELECT id, branch_key, location_id
         FROM merchant_cashier_stations
         WHERE merchant_id = $1
         ORDER BY id`,
        [merchantId],
      );
      const stationLocation = Object.fromEntries(
        stations.rows.map((row) => [row.id, row.location_id]),
      );
      assert.equal(stationLocation.station_main, "loc_default");
      assert.equal(
        stationLocation.station_karrada_a,
        stationLocation.station_karrada_b,
      );
      assert.equal(
        stationLocation.station_karrada_a,
        byBranch.get("karrada")?.id,
      );
      assert.equal(
        stationLocation.station_adhamiya,
        byBranch.get("adhamiya")?.id,
      );
      assert.notEqual(
        stationLocation.station_karrada_a,
        stationLocation.station_adhamiya,
      );

      const lateDefault = await client.query(
        `SELECT
           location.id,
           location.legacy_branch_key,
           location.is_default,
           location.online_fulfillment_enabled,
           station.location_id AS station_location_id
         FROM merchant_locations AS location
         JOIN merchant_cashier_stations AS station
           ON station.merchant_id = location.merchant_id
          AND station.id = 'station_late_main'
         WHERE location.merchant_id = $1
           AND location.is_default = TRUE`,
        [lateMerchantId],
      );
      assert.equal(lateDefault.rowCount, 1);
      assert.equal(lateDefault.rows[0].legacy_branch_key, "main");
      assert.equal(lateDefault.rows[0].is_default, true);
      assert.equal(lateDefault.rows[0].online_fulfillment_enabled, true);
      assert.equal(
        lateDefault.rows[0].station_location_id,
        lateDefault.rows[0].id,
      );

      const inventory = await client.query(
        `SELECT location_id, product_id, on_hand_quantity, reserved_quantity
         FROM location_inventory_levels
         WHERE merchant_id = $1
         ORDER BY location_id, product_id`,
        [merchantId],
      );
      assert.deepEqual(inventory.rows, [
        {
          location_id: "loc_default",
          product_id: "product_existing",
          on_hand_quantity: 25,
          reserved_quantity: 0,
        },
      ]);

      const indexes = await client.query(
        `SELECT indexname
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'merchant_cashier_stations'`,
      );
      const indexNames = new Set(indexes.rows.map((row) => row.indexname));
      assert.ok(
        indexNames.has("merchant_cashier_stations_offline_location_unique"),
      );
      assert.equal(
        indexNames.has("merchant_cashier_stations_offline_branch_unique"),
        false,
      );

      await client.query(
        `UPDATE merchant_cashier_stations
            SET branch_key = 'karrada-renamed'
          WHERE merchant_id = $1
            AND id = 'station_karrada_b'`,
        [merchantId],
      );

      let offlineConflict = null;
      try {
        await client.query(
          `UPDATE merchant_cashier_stations
              SET offline_inventory_authority = TRUE
            WHERE merchant_id = $1
              AND id = 'station_karrada_b'`,
          [merchantId],
        );
      } catch (error) {
        offlineConflict = error;
      }
      assert.ok(offlineConflict, "same-location offline authority must conflict");
      assert.equal(String(offlineConflict.code), "23505");
      assert.equal(
        String(offlineConflict.constraint),
        "merchant_cashier_stations_offline_location_unique",
      );

      const rls = await client.query(
        `SELECT relname, relrowsecurity
         FROM pg_class
         WHERE relname IN ('merchant_locations', 'location_inventory_levels')
         ORDER BY relname`,
      );
      assert.deepEqual(
        Object.fromEntries(
          rls.rows.map((row) => [row.relname, row.relrowsecurity]),
        ),
        {
          location_inventory_levels: true,
          merchant_locations: true,
        },
      );

      const policies = await client.query(
        `SELECT tablename, policyname
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('merchant_locations', 'location_inventory_levels')
         ORDER BY tablename`,
      );
      assert.deepEqual(
        Object.fromEntries(
          policies.rows.map((row) => [row.tablename, row.policyname]),
        ),
        {
          location_inventory_levels:
            "location_inventory_levels_tenant_boundary",
          merchant_locations: "merchant_locations_tenant_boundary",
        },
      );
    } finally {
      client.release();
    }
  } finally {
    fs.rmSync(migrationFolder, { recursive: true, force: true });
    await resetDatabase(pool).catch(() => undefined);
    await pool.end();
  }
});
