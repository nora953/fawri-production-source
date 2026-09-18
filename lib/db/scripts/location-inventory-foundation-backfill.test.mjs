import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const migrationPath = path.join(
  dbRoot,
  "drizzle",
  "0017_location_inventory_foundation.sql",
);
const statementDelimiter = "--> statement-breakpoint\n";
const merchantId = "location_foundation_test_merchant";

function requireSafeDatabase(connectionString) {
  assert.equal(
    process.env.FAWRI_ALLOW_LOCATION_INVENTORY_BACKFILL_TEST,
    "1",
    "FAWRI_ALLOW_LOCATION_INVENTORY_BACKFILL_TEST=1 is required",
  );
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "location inventory backfill test only permits a local PostgreSQL host",
  );
  assert.equal(
    databaseName,
    "fawri_ci",
    "location inventory backfill test only permits the fawri_ci database",
  );
}

function readBackfillStatements() {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = sql
    .split(statementDelimiter)
    .map((statement) => statement.trim())
    .filter(
      (statement) =>
        statement.startsWith('INSERT INTO "merchant_locations"') ||
        statement.startsWith('INSERT INTO "location_inventory_levels"'),
    );
  assert.equal(statements.length, 3, "expected exactly three 0017 backfill statements");
  return statements;
}

async function runBackfill(client, statements) {
  for (const statement of statements) {
    await client.query(statement);
  }
}

function inventoryMap(rows) {
  return new Map(
    rows.map((row) => [
      `${row.product_id}:${row.variant_id ?? "-"}`,
      {
        onHand: Number(row.on_hand_quantity),
        reserved: Number(row.reserved_quantity),
        threshold: Number(row.low_stock_threshold),
      },
    ]),
  );
}

test("0017 backfill preserves existing merchant inventory exactly once", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  requireSafeDatabase(connectionString);

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  const backfillStatements = readBackfillStatements();

  try {
    await client.query("DELETE FROM accounts WHERE id = $1", [merchantId]);

    await client.query(
      `INSERT INTO accounts (id, kind, phone, password_hash)
       VALUES ($1, 'merchant', '07700000000', 'location-foundation-test-hash')`,
      [merchantId],
    );

    const longStoreName = "Baghdad Main Location ".repeat(10);
    await client.query(
      `INSERT INTO merchants (
         id,
         account_id,
         owner_name,
         store_name,
         activity_type
       )
       VALUES ($1, $1, 'Foundation Test Owner', $2, 'retail')`,
      [merchantId, longStoreName],
    );

    const trackedMetadata = {
      fawri_catalog_v2: {
        item_type: "product",
        track_inventory: true,
      },
    };
    const serviceMetadata = {
      fawri_catalog_v2: {
        item_type: "service",
        track_inventory: false,
      },
    };
    const untrackedMetadata = {
      fawri_catalog_v2: {
        item_type: "product",
        track_inventory: false,
      },
    };

    await client.query(
      `INSERT INTO products (
         id,
         merchant_id,
         name,
         quantity,
         low_stock_threshold,
         variant_stock_mode,
         metadata
       )
       VALUES
         ('product_simple', $1, 'Simple Product', 7, 2, FALSE, $2::jsonb),
         ('product_variants', $1, 'Variant Product', 99, 1, TRUE, $2::jsonb),
         ('product_service', $1, 'Service Item', 50, 0, FALSE, $3::jsonb),
         ('product_untracked', $1, 'Untracked Product', 12, 0, FALSE, $4::jsonb),
         ('product_legacy', $1, 'Legacy Product', 5, 3, FALSE, '{}'::jsonb)`,
      [
        merchantId,
        JSON.stringify(trackedMetadata),
        JSON.stringify(serviceMetadata),
        JSON.stringify(untrackedMetadata),
      ],
    );

    await client.query(
      `INSERT INTO product_variants (
         id,
         product_id,
         merchant_id,
         name,
         quantity,
         option_signature
       )
       VALUES
         ('variant_red', 'product_variants', $1, 'Red', 3, 'color:red|size:medium'),
         ('variant_blue', 'product_variants', $1, 'Blue', 4, 'color:blue|size:medium')`,
      [merchantId],
    );

    await runBackfill(client, backfillStatements);

    const locations = await client.query(
      `SELECT
         id,
         name,
         char_length(name)::integer AS name_length,
         is_default,
         status,
         operational_status,
         online_fulfillment_enabled,
         accept_online_orders_when_closed
       FROM merchant_locations
       WHERE merchant_id = $1`,
      [merchantId],
    );

    assert.equal(locations.rowCount, 1);
    assert.equal(locations.rows[0].is_default, true);
    assert.equal(locations.rows[0].name_length, 120);
    assert.equal(locations.rows[0].status, "active");
    assert.equal(locations.rows[0].operational_status, "open");
    assert.equal(locations.rows[0].online_fulfillment_enabled, true);
    assert.equal(locations.rows[0].accept_online_orders_when_closed, true);

    const firstInventory = await client.query(
      `SELECT
         product_id,
         variant_id,
         on_hand_quantity,
         reserved_quantity,
         low_stock_threshold
       FROM location_inventory_levels
       WHERE merchant_id = $1
       ORDER BY product_id, variant_id NULLS FIRST`,
      [merchantId],
    );

    assert.equal(firstInventory.rowCount, 4);
    const firstMap = inventoryMap(firstInventory.rows);

    assert.deepEqual(firstMap.get("product_simple:-"), {
      onHand: 7,
      reserved: 0,
      threshold: 2,
    });
    assert.deepEqual(firstMap.get("product_legacy:-"), {
      onHand: 5,
      reserved: 0,
      threshold: 3,
    });
    assert.deepEqual(firstMap.get("product_variants:variant_red"), {
      onHand: 3,
      reserved: 0,
      threshold: 1,
    });
    assert.deepEqual(firstMap.get("product_variants:variant_blue"), {
      onHand: 4,
      reserved: 0,
      threshold: 1,
    });

    assert.equal(firstMap.has("product_variants:-"), false);
    assert.equal(firstMap.has("product_service:-"), false);
    assert.equal(firstMap.has("product_untracked:-"), false);

    const sourceProducts = await client.query(
      `SELECT id, quantity
       FROM products
       WHERE merchant_id = $1
       ORDER BY id`,
      [merchantId],
    );
    assert.deepEqual(
      Object.fromEntries(
        sourceProducts.rows.map((row) => [row.id, Number(row.quantity)]),
      ),
      {
        product_legacy: 5,
        product_service: 50,
        product_simple: 7,
        product_untracked: 12,
        product_variants: 99,
      },
    );

    const sourceVariants = await client.query(
      `SELECT id, quantity
       FROM product_variants
       WHERE merchant_id = $1
       ORDER BY id`,
      [merchantId],
    );
    assert.deepEqual(
      Object.fromEntries(
        sourceVariants.rows.map((row) => [row.id, Number(row.quantity)]),
      ),
      {
        variant_blue: 4,
        variant_red: 3,
      },
    );

    await runBackfill(client, backfillStatements);

    const secondInventory = await client.query(
      `SELECT
         product_id,
         variant_id,
         on_hand_quantity,
         reserved_quantity,
         low_stock_threshold
       FROM location_inventory_levels
       WHERE merchant_id = $1
       ORDER BY product_id, variant_id NULLS FIRST`,
      [merchantId],
    );
    const secondLocations = await client.query(
      "SELECT COUNT(*)::integer AS count FROM merchant_locations WHERE merchant_id = $1",
      [merchantId],
    );

    assert.equal(secondLocations.rows[0].count, 1);
    assert.deepEqual(secondInventory.rows, firstInventory.rows);
  } finally {
    try {
      await client.query("DELETE FROM accounts WHERE id = $1", [merchantId]);
    } finally {
      client.release();
      await pool.end();
    }
  }
});
