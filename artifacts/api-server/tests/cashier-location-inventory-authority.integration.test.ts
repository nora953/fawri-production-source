import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createStabilizedMigrationFolder } from "../../../lib/db/scripts/lib/migration-sql-order.mjs";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const migrations = path.join(repoRoot, "lib/db/drizzle");

function requireSafeDatabase(connectionString: string): void {
  assert.equal(
    process.env.FAWRI_ALLOW_CASHIER_LOCATION_INVENTORY_AUTHORITY_TEST,
    "1",
    "FAWRI_ALLOW_CASHIER_LOCATION_INVENTORY_AUTHORITY_TEST=1 is required",
  );
  const parsed = new URL(connectionString);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "location inventory authority test only permits a local PostgreSQL host",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "location inventory authority test only permits the fawri_ci database",
  );
}

async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

test("cashier location inventory mutates only the selected location and keeps compatibility aggregate truthful", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  requireSafeDatabase(connectionString);

  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
  const pool = new Pool({ connectionString, max: 2 });
  const migrationFolder = createStabilizedMigrationFolder(migrations);

  try {
    await resetDatabase(pool);
    await migrate(drizzle(pool), { migrationsFolder: migrationFolder });

    const merchantId = "location_inventory_authority_merchant";
    const defaultLocationId = "location_default";
    const branchLocationId = "location_branch";
    await pool.query(
      `INSERT INTO accounts (id, kind, phone, password_hash)
       VALUES ($1, 'merchant', '07730000000', 'location-inventory-authority-hash')`,
      [merchantId],
    );
    await pool.query(
      `INSERT INTO merchants (
         id, account_id, owner_name, store_name, activity_type
       ) VALUES ($1, $1, 'Inventory Owner', 'Inventory Store', 'retail')`,
      [merchantId],
    );
    await pool.query(
      `INSERT INTO merchant_locations (
         id, merchant_id, name, legacy_branch_key, is_default,
         online_fulfillment_enabled
       ) VALUES
         ($1, $3, 'Main', 'main', TRUE, TRUE),
         ($2, $3, 'Branch', 'branch', FALSE, FALSE)`,
      [defaultLocationId, branchLocationId, merchantId],
    );

    const trackedMetadata = JSON.stringify({
      fawri_catalog_v2: {
        item_type: "product",
        track_inventory: true,
      },
    });
    await pool.query(
      `INSERT INTO products (
         id, merchant_id, name, current_price_iqd, quantity,
         low_stock_threshold, variant_stock_mode, version, status, metadata
       ) VALUES
         ('simple_product', $1, 'Simple Product', 1000, 12, 2, FALSE, 1, 'available', $2::jsonb),
         ('variant_product', $1, 'Variant Product', 2000, 12, 2, TRUE, 1, 'available', $2::jsonb)`,
      [merchantId, trackedMetadata],
    );
    await pool.query(
      `INSERT INTO product_variants (
         id, product_id, merchant_id, name, quantity,
         option_signature, version, metadata
       ) VALUES
         ('variant_red', 'variant_product', $1, 'Red', 5, 'color:red', 1, '{}'::jsonb),
         ('variant_blue', 'variant_product', $1, 'Blue', 7, 'color:blue', 1, '{}'::jsonb)`,
      [merchantId],
    );

    await pool.query(
      `INSERT INTO location_inventory_levels (
         id, merchant_id, location_id, product_id, variant_id,
         on_hand_quantity, reserved_quantity, low_stock_threshold,
         version, inventory_fresh_at
       ) VALUES
         ('simple_main', $1, $2, 'simple_product', NULL, 10, 0, 2, 1, now()),
         ('simple_branch', $1, $3, 'simple_product', NULL, 2, 0, 2, 1, now()),
         ('red_main', $1, $2, 'variant_product', 'variant_red', 4, 0, 2, 1, now()),
         ('red_branch', $1, $3, 'variant_product', 'variant_red', 1, 0, 2, 1, now()),
         ('blue_main', $1, $2, 'variant_product', 'variant_blue', 6, 0, 2, 1, now()),
         ('blue_branch', $1, $3, 'variant_product', 'variant_blue', 1, 0, 2, 1, now())`,
      [merchantId, defaultLocationId, branchLocationId],
    );

    const {
      mutateCashierLocationInventoryInTransaction,
      projectCashierCatalogForLocationAuthoritative,
    } = await import("../src/services/cashierLocationInventoryAuthority");
    const { listCatalogProductsAuthoritative } = await import(
      "../src/services/postgresCatalogAuthority"
    );
    const { withMerchantOperationalTransaction } = await import(
      "../src/services/operationalPostgresAuthority"
    );

    const baseProducts = await listCatalogProductsAuthoritative(merchantId);
    const mainSnapshot = await projectCashierCatalogForLocationAuthoritative({
      merchantId,
      locationId: defaultLocationId,
      products: baseProducts,
    });
    const branchSnapshot = await projectCashierCatalogForLocationAuthoritative({
      merchantId,
      locationId: branchLocationId,
      products: baseProducts,
    });

    const mainSimple = mainSnapshot.products.find(
      (product) => product.id === "simple_product",
    );
    const branchSimple = branchSnapshot.products.find(
      (product) => product.id === "simple_product",
    );
    assert.equal(mainSimple?.stock_quantity, 10);
    assert.equal(branchSimple?.stock_quantity, 2);

    await withMerchantOperationalTransaction(merchantId, (client) =>
      mutateCashierLocationInventoryInTransaction(client, {
        merchantId,
        locationId: branchLocationId,
        productId: "simple_product",
        delta: -2,
      }),
    );

    const afterSale = await pool.query(
      `SELECT location_id, on_hand_quantity
         FROM location_inventory_levels
        WHERE merchant_id = $1
          AND product_id = 'simple_product'
        ORDER BY location_id`,
      [merchantId],
    );
    assert.deepEqual(
      Object.fromEntries(
        afterSale.rows.map((row) => [
          row.location_id,
          Number(row.on_hand_quantity),
        ]),
      ),
      {
        [branchLocationId]: 0,
        [defaultLocationId]: 10,
      },
    );
    const simpleAggregate = await pool.query(
      `SELECT quantity, version
         FROM products
        WHERE merchant_id = $1 AND id = 'simple_product'`,
      [merchantId],
    );
    assert.equal(Number(simpleAggregate.rows[0].quantity), 10);
    assert.equal(Number(simpleAggregate.rows[0].version), 2);

    await assert.rejects(
      () =>
        withMerchantOperationalTransaction(merchantId, (client) =>
          mutateCashierLocationInventoryInTransaction(client, {
            merchantId,
            locationId: branchLocationId,
            productId: "simple_product",
            delta: -1,
          }),
        ),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "CASHIER_SYNC_NEGATIVE_STOCK",
        ),
    );

    const afterRejected = await pool.query(
      `SELECT location_id, on_hand_quantity
         FROM location_inventory_levels
        WHERE merchant_id = $1
          AND product_id = 'simple_product'
        ORDER BY location_id`,
      [merchantId],
    );
    assert.deepEqual(
      Object.fromEntries(
        afterRejected.rows.map((row) => [
          row.location_id,
          Number(row.on_hand_quantity),
        ]),
      ),
      {
        [branchLocationId]: 0,
        [defaultLocationId]: 10,
      },
    );

    await withMerchantOperationalTransaction(merchantId, (client) =>
      mutateCashierLocationInventoryInTransaction(client, {
        merchantId,
        locationId: branchLocationId,
        productId: "simple_product",
        delta: 3,
      }),
    );
    const afterRestock = await pool.query(
      `SELECT
         product.quantity AS aggregate_quantity,
         branch.on_hand_quantity AS branch_quantity,
         main.on_hand_quantity AS main_quantity
       FROM products AS product
       JOIN location_inventory_levels AS branch
         ON branch.merchant_id = product.merchant_id
        AND branch.product_id = product.id
        AND branch.location_id = $2
        AND branch.variant_id IS NULL
       JOIN location_inventory_levels AS main
         ON main.merchant_id = product.merchant_id
        AND main.product_id = product.id
        AND main.location_id = $3
        AND main.variant_id IS NULL
      WHERE product.merchant_id = $1
        AND product.id = 'simple_product'`,
      [merchantId, branchLocationId, defaultLocationId],
    );
    assert.equal(Number(afterRestock.rows[0].branch_quantity), 3);
    assert.equal(Number(afterRestock.rows[0].main_quantity), 10);
    assert.equal(Number(afterRestock.rows[0].aggregate_quantity), 13);

    await pool.query(
      `UPDATE location_inventory_levels
          SET reserved_quantity = 2
        WHERE merchant_id = $1
          AND location_id = $2
          AND product_id = 'simple_product'
          AND variant_id IS NULL`,
      [merchantId, branchLocationId],
    );
    await assert.rejects(
      () =>
        withMerchantOperationalTransaction(merchantId, (client) =>
          mutateCashierLocationInventoryInTransaction(client, {
            merchantId,
            locationId: branchLocationId,
            productId: "simple_product",
            delta: -2,
          }),
        ),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "CASHIER_SYNC_NEGATIVE_STOCK",
        ),
    );

    await withMerchantOperationalTransaction(merchantId, (client) =>
      mutateCashierLocationInventoryInTransaction(client, {
        merchantId,
        locationId: branchLocationId,
        productId: "variant_product",
        variantId: "variant_red",
        delta: -1,
      }),
    );

    const variantState = await pool.query(
      `SELECT
         product.quantity AS product_quantity,
         red.quantity AS red_quantity,
         blue.quantity AS blue_quantity,
         branch_red.on_hand_quantity AS branch_red_quantity,
         main_red.on_hand_quantity AS main_red_quantity
       FROM products AS product
       JOIN product_variants AS red
         ON red.merchant_id = product.merchant_id
        AND red.product_id = product.id
        AND red.id = 'variant_red'
       JOIN product_variants AS blue
         ON blue.merchant_id = product.merchant_id
        AND blue.product_id = product.id
        AND blue.id = 'variant_blue'
       JOIN location_inventory_levels AS branch_red
         ON branch_red.merchant_id = product.merchant_id
        AND branch_red.product_id = product.id
        AND branch_red.variant_id = red.id
        AND branch_red.location_id = $2
       JOIN location_inventory_levels AS main_red
         ON main_red.merchant_id = product.merchant_id
        AND main_red.product_id = product.id
        AND main_red.variant_id = red.id
        AND main_red.location_id = $3
      WHERE product.merchant_id = $1
        AND product.id = 'variant_product'`,
      [merchantId, branchLocationId, defaultLocationId],
    );
    assert.equal(Number(variantState.rows[0].branch_red_quantity), 0);
    assert.equal(Number(variantState.rows[0].main_red_quantity), 4);
    assert.equal(Number(variantState.rows[0].red_quantity), 4);
    assert.equal(Number(variantState.rows[0].blue_quantity), 7);
    assert.equal(Number(variantState.rows[0].product_quantity), 11);
  } finally {
    fs.rmSync(migrationFolder, { recursive: true, force: true });
    await resetDatabase(pool).catch(() => undefined);
    await pool.end();
  }
});
