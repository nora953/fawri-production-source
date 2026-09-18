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
    process.env.FAWRI_ALLOW_MERCHANT_LOCATION_INVENTORY_TEST,
    "1",
    "FAWRI_ALLOW_MERCHANT_LOCATION_INVENTORY_TEST=1 is required",
  );
  const parsed = new URL(connectionString);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "merchant location inventory test only permits a local PostgreSQL host",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "merchant location inventory test only permits the fawri_ci database",
  );
}

async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
}

test("merchant inventory writes are location scoped and catalog edits cannot overwrite stock", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  requireSafeDatabase(connectionString);

  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
  const pool = new Pool({ connectionString, max: 2 });
  const migrationFolder = createStabilizedMigrationFolder(migrations);

  try {
    await resetDatabase(pool);
    await migrate(drizzle(pool), { migrationsFolder: migrationFolder });

    const merchantId = "merchant_location_inventory_test";
    const defaultLocationId = "merchant_location_default";
    const branchLocationId = "merchant_location_branch";

    await pool.query(
      `INSERT INTO accounts (id, kind, phone, password_hash)
       VALUES ($1, 'merchant', '07740000000', 'merchant-location-inventory-hash')`,
      [merchantId],
    );
    await pool.query(
      `INSERT INTO merchants (
         id, account_id, owner_name, store_name, activity_type
       ) VALUES ($1, $1, 'Merchant Owner', 'Merchant Store', 'retail')`,
      [merchantId],
    );
    await pool.query(
      `INSERT INTO merchant_locations (
         id, merchant_id, name, legacy_branch_key, status, is_default,
         operational_status, online_fulfillment_enabled
       ) VALUES
         ($1, $3, 'Main', 'main', 'active', TRUE, 'open', TRUE),
         ($2, $3, 'Branch', 'branch', 'active', FALSE, 'open', FALSE)`,
      [defaultLocationId, branchLocationId, merchantId],
    );
    await pool.query(
      `INSERT INTO products (
         id, merchant_id, name, current_price_iqd, quantity,
         low_stock_threshold, variant_stock_mode, version, status, metadata
       ) VALUES (
         'merchant_product',
         $1,
         'Merchant Product',
         1500,
         10,
         2,
         FALSE,
         1,
         'available',
         '{"fawri_catalog_v2":{"item_type":"product","track_inventory":true}}'::jsonb
       )`,
      [merchantId],
    );

    const merchantInventory = await import(
      "../src/services/postgresMerchantLocationInventoryAuthority"
    );
    const catalog = await import("../src/services/postgresCatalogAuthority");

    const firstSnapshot =
      await merchantInventory.getMerchantProductLocationInventoryAuthoritative({
        merchantId,
        productId: "merchant_product",
      });
    assert.equal(firstSnapshot.locations.length, 2);
    const firstByLocation = Object.fromEntries(
      firstSnapshot.locations.map((location) => [
        location.id,
        location.levels[0]?.on_hand_quantity ?? -1,
      ]),
    );
    assert.deepEqual(firstByLocation, {
      [defaultLocationId]: 10,
      [branchLocationId]: 0,
    });

    const firstSet =
      await merchantInventory.setMerchantLocationInventoryAuthoritative({
        merchantId,
        locationId: branchLocationId,
        productId: "merchant_product",
        expectedVersion: 1,
        quantity: 3,
      });
    assert.equal(firstSet.replayed, false);
    assert.equal(firstSet.mutated, true);

    const afterSet = await pool.query(
      `SELECT
         product.quantity AS aggregate_quantity,
         product.version AS product_version,
         main.on_hand_quantity AS main_quantity,
         branch.on_hand_quantity AS branch_quantity
       FROM products AS product
       JOIN location_inventory_levels AS main
         ON main.merchant_id = product.merchant_id
        AND main.product_id = product.id
        AND main.location_id = $2
        AND main.variant_id IS NULL
       JOIN location_inventory_levels AS branch
         ON branch.merchant_id = product.merchant_id
        AND branch.product_id = product.id
        AND branch.location_id = $3
        AND branch.variant_id IS NULL
      WHERE product.merchant_id = $1
        AND product.id = 'merchant_product'`,
      [merchantId, defaultLocationId, branchLocationId],
    );
    assert.equal(Number(afterSet.rows[0].main_quantity), 10);
    assert.equal(Number(afterSet.rows[0].branch_quantity), 3);
    assert.equal(Number(afterSet.rows[0].aggregate_quantity), 13);
    assert.equal(Number(afterSet.rows[0].product_version), 2);

    await assert.rejects(
      () =>
        catalog.setCatalogInventoryAuthoritative({
          merchantId,
          productId: "merchant_product",
          expectedVersion: 2,
          quantity: 99,
        }),
      (error: unknown) => errorCode(error) === "CATALOG_LOCATION_REQUIRED",
    );

    const edited = await catalog.updateCatalogProductAuthoritative({
      merchantId,
      productId: "merchant_product",
      expectedVersion: 2,
      input: {
        name: "Merchant Product Renamed",
        current_price: 1750,
        stock_quantity: 999,
      },
    });
    assert.equal(edited.name, "Merchant Product Renamed");
    assert.equal(edited.stock_quantity, 13);
    assert.equal(edited.version, 3);

    const afterEdit = await pool.query(
      `SELECT
         product.quantity AS aggregate_quantity,
         main.on_hand_quantity AS main_quantity,
         branch.on_hand_quantity AS branch_quantity
       FROM products AS product
       JOIN location_inventory_levels AS main
         ON main.merchant_id = product.merchant_id
        AND main.product_id = product.id
        AND main.location_id = $2
        AND main.variant_id IS NULL
       JOIN location_inventory_levels AS branch
         ON branch.merchant_id = product.merchant_id
        AND branch.product_id = product.id
        AND branch.location_id = $3
        AND branch.variant_id IS NULL
      WHERE product.merchant_id = $1
        AND product.id = 'merchant_product'`,
      [merchantId, defaultLocationId, branchLocationId],
    );
    assert.equal(Number(afterEdit.rows[0].main_quantity), 10);
    assert.equal(Number(afterEdit.rows[0].branch_quantity), 3);
    assert.equal(Number(afterEdit.rows[0].aggregate_quantity), 13);

    await assert.rejects(
      () =>
        catalog.updateCatalogProductAuthoritative({
          merchantId,
          productId: "merchant_product",
          expectedVersion: 3,
          input: {
            name: "Unsafe Variant Conversion",
            current_price: 1750,
            variants: [
              {
                name: "Red",
                options: { Color: "Red" },
                stock_quantity: 13,
              },
            ],
          },
        }),
      (error: unknown) =>
        errorCode(error) === "CATALOG_INVENTORY_SHAPE_CHANGE_BLOCKED",
    );

    await pool.query(
      `UPDATE merchant_locations
          SET status = 'disabled', updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, branchLocationId],
    );

    const request = {
      merchantId,
      locationId: branchLocationId,
      productId: "merchant_product",
      expectedVersion: 3,
      delta: 2,
      idempotencyKey: "merchant-location-adjust-disabled-branch",
      reason: "test disabled location stock administration",
    };
    const adjusted =
      await merchantInventory.adjustMerchantLocationInventoryAuthoritative(
        request,
      );
    assert.equal(adjusted.replayed, false);
    assert.equal(adjusted.mutated, true);

    const replay =
      await merchantInventory.adjustMerchantLocationInventoryAuthoritative(
        request,
      );
    assert.equal(replay.replayed, true);
    assert.equal(replay.mutated, false);

    const finalState = await pool.query(
      `SELECT
         product.quantity AS aggregate_quantity,
         product.version AS product_version,
         main.on_hand_quantity AS main_quantity,
         branch.on_hand_quantity AS branch_quantity
       FROM products AS product
       JOIN location_inventory_levels AS main
         ON main.merchant_id = product.merchant_id
        AND main.product_id = product.id
        AND main.location_id = $2
        AND main.variant_id IS NULL
       JOIN location_inventory_levels AS branch
         ON branch.merchant_id = product.merchant_id
        AND branch.product_id = product.id
        AND branch.location_id = $3
        AND branch.variant_id IS NULL
      WHERE product.merchant_id = $1
        AND product.id = 'merchant_product'`,
      [merchantId, defaultLocationId, branchLocationId],
    );
    assert.equal(Number(finalState.rows[0].main_quantity), 10);
    assert.equal(Number(finalState.rows[0].branch_quantity), 5);
    assert.equal(Number(finalState.rows[0].aggregate_quantity), 15);
    assert.equal(Number(finalState.rows[0].product_version), 4);

    const audit = await pool.query(
      `SELECT location_id, reason_code, actor_type
         FROM location_inventory_mutations
        WHERE merchant_id = $1
          AND product_id = 'merchant_product'
        ORDER BY occurred_at, created_at`,
      [merchantId],
    );
    assert.equal(audit.rowCount, 2);
    assert.deepEqual(
      audit.rows.map((row) => ({
        location_id: row.location_id,
        reason_code: row.reason_code,
        actor_type: row.actor_type,
      })),
      [
        {
          location_id: branchLocationId,
          reason_code: "merchant_location_inventory_set",
          actor_type: "merchant",
        },
        {
          location_id: branchLocationId,
          reason_code: "test disabled location stock administration",
          actor_type: "merchant",
        },
      ],
    );
  } finally {
    fs.rmSync(migrationFolder, { recursive: true, force: true });
    await resetDatabase(pool).catch(() => undefined);
    await pool.end();
  }
});
