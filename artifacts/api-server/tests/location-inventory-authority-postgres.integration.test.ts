import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "location-inventory-authority-test-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../src/services/postgresCatalogAuthority.js");
const inventory = await import(
  "../src/services/postgresLocationInventoryAuthority.js"
);

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

async function createMerchant(suffix: string): Promise<string> {
  const phone = `077${crypto.randomInt(10_000_000, 99_999_999)}`;
  const pending = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Location Owner ${suffix}`,
    storeName: `Location Store ${suffix}`,
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  const merchant = await accounts.markMerchantOtpVerifiedAuthoritative(
    pending.account.id,
  );
  assert.ok(merchant?.merchantProfile);
  return merchant.account.id;
}

async function createLocation(merchantId: string, suffix: string): Promise<string> {
  const locationId = `location-authority-${suffix}`;
  await raw(
    `INSERT INTO merchant_locations (
       id, merchant_id, name, is_default, operational_status,
       online_fulfillment_enabled, accept_online_orders_while_closed,
       merchant_priority
     ) VALUES ($1,$2,$3,TRUE,'open',FALSE,FALSE,0)`,
    [locationId, merchantId, `Authority Location ${suffix}`],
  );
  return locationId;
}

test("location inventory allocation and mutations use independent versions and durable idempotency", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(suffix);
  const locationId = await createLocation(merchantId, suffix);
  const productId = `prd-location-authority-${suffix}`;

  const createdProduct = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `catalog-location-authority-${suffix}`,
    input: {
      id: productId,
      name: "Location authority product",
      price_iqd: 10_000,
      stock_quantity: 99,
      low_stock_threshold: 2,
      status: "available",
      allow_fawri_reply: true,
    },
  });
  assert.equal(createdProduct.product.version, 1);

  const allocated = await inventory.createLocationInventoryLevelAuthoritative({
    merchantId,
    locationId,
    productId,
    quantity: 5,
    idempotencyKey: `location-allocation-${suffix}`,
    reason: "initial location allocation",
  });
  assert.equal(allocated.replayed, false);
  assert.equal(allocated.level.quantity, 5);
  assert.equal(allocated.level.version, 1);
  assert.equal(allocated.level.low_stock_threshold, 2);

  const allocationReplay =
    await inventory.createLocationInventoryLevelAuthoritative({
      merchantId,
      locationId,
      productId,
      quantity: 5,
      idempotencyKey: `location-allocation-${suffix}`,
      reason: "initial location allocation",
    });
  assert.equal(allocationReplay.replayed, true);
  assert.equal(allocationReplay.level.quantity, 5);
  assert.equal(allocationReplay.level.version, 1);

  const adjusted = await inventory.adjustLocationInventoryLevelAuthoritative({
    merchantId,
    locationId,
    productId,
    expectedVersion: 1,
    delta: -2,
    idempotencyKey: `location-adjust-${suffix}`,
    reason: "test sale",
  });
  assert.equal(adjusted.replayed, false);
  assert.equal(adjusted.level.quantity, 3);
  assert.equal(adjusted.level.version, 2);

  const allocationReplayAfterLaterMutation =
    await inventory.createLocationInventoryLevelAuthoritative({
      merchantId,
      locationId,
      productId,
      quantity: 5,
      idempotencyKey: `location-allocation-${suffix}`,
      reason: "initial location allocation",
    });
  assert.equal(allocationReplayAfterLaterMutation.replayed, true);
  assert.equal(
    allocationReplayAfterLaterMutation.level.quantity,
    5,
    "idempotent replay must return the original mutation result, not current stock",
  );
  assert.equal(allocationReplayAfterLaterMutation.level.version, 1);

  await assert.rejects(
    inventory.adjustLocationInventoryLevelAuthoritative({
      merchantId,
      locationId,
      productId,
      expectedVersion: 1,
      delta: -1,
      idempotencyKey: `location-stale-${suffix}`,
    }),
    (error: unknown) => {
      assert.ok(error instanceof inventory.LocationInventoryAuthorityError);
      assert.equal(error.code, "LOCATION_INVENTORY_VERSION_CONFLICT");
      assert.equal(error.status, 409);
      return true;
    },
  );

  await assert.rejects(
    inventory.adjustLocationInventoryLevelAuthoritative({
      merchantId,
      locationId,
      productId,
      expectedVersion: 2,
      delta: -4,
      idempotencyKey: `location-negative-${suffix}`,
    }),
    (error: unknown) => {
      assert.ok(error instanceof inventory.LocationInventoryAuthorityError);
      assert.equal(error.code, "LOCATION_INVENTORY_NEGATIVE_STOCK");
      assert.equal(error.status, 409);
      return true;
    },
  );

  const set = await inventory.setLocationInventoryLevelAuthoritative({
    merchantId,
    locationId,
    productId,
    expectedVersion: 2,
    quantity: 8,
    idempotencyKey: `location-set-${suffix}`,
  });
  assert.equal(set.level.quantity, 8);
  assert.equal(set.level.version, 3);

  const legacyCatalog = await catalog.getCatalogProductAuthoritative(
    merchantId,
    productId,
  );
  assert.equal(
    legacyCatalog.stock_quantity,
    99,
    "Phase 2 authority must not cut over or mutate legacy catalog quantity yet",
  );
  assert.equal(
    legacyCatalog.version,
    1,
    "location inventory versions must be independent from catalog version",
  );

  const mutations = await raw(
    `SELECT location_id, before_quantity, after_quantity,
            expected_version, resulting_version, reason_code
       FROM inventory_mutations
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
      ORDER BY resulting_version`,
    [merchantId, locationId, productId],
  );
  assert.deepEqual(
    mutations.rows.map((row) => ({
      locationId: row.location_id,
      before: Number(row.before_quantity),
      after: Number(row.after_quantity),
      expectedVersion: Number(row.expected_version),
      resultingVersion: Number(row.resulting_version),
    })),
    [
      {
        locationId,
        before: 0,
        after: 5,
        expectedVersion: 0,
        resultingVersion: 1,
      },
      {
        locationId,
        before: 5,
        after: 3,
        expectedVersion: 1,
        resultingVersion: 2,
      },
      {
        locationId,
        before: 3,
        after: 8,
        expectedVersion: 2,
        resultingVersion: 3,
      },
    ],
  );

  const freshness = await raw(
    `SELECT inventory_fresh_at
       FROM merchant_locations
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, locationId],
  );
  assert.ok(freshness.rows[0]?.inventory_fresh_at);

  const listed = await inventory.listLocationInventoryLevelsAuthoritative({
    merchantId,
    locationId,
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.quantity, 8);
  assert.equal(listed[0]?.version, 3);
});

test("variant-managed products require variant-scoped location inventory", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(`variant-${suffix}`);
  const locationId = await createLocation(merchantId, `variant-${suffix}`);
  const productId = `prd-location-variant-${suffix}`;
  const variantId = `var-location-variant-${suffix}`;

  await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `catalog-location-variant-${suffix}`,
    input: {
      id: productId,
      name: "Location variant authority product",
      price_iqd: 20_000,
      stock_quantity: 4,
      variants: [
        {
          id: variantId,
          name: "Blue",
          stock_quantity: 4,
          options: { Color: "Blue" },
        },
      ],
    },
  });

  await assert.rejects(
    inventory.createLocationInventoryLevelAuthoritative({
      merchantId,
      locationId,
      productId,
      quantity: 4,
      idempotencyKey: `variant-root-rejected-${suffix}`,
    }),
    (error: unknown) => {
      assert.ok(error instanceof inventory.LocationInventoryAuthorityError);
      assert.equal(error.code, "LOCATION_INVENTORY_VARIANT_REQUIRED");
      return true;
    },
  );

  const created = await inventory.createLocationInventoryLevelAuthoritative({
    merchantId,
    locationId,
    productId,
    variantId,
    quantity: 4,
    idempotencyKey: `variant-level-${suffix}`,
  });
  assert.equal(created.level.variant_id, variantId);
  assert.equal(created.level.quantity, 4);
  assert.equal(created.level.version, 1);
});

test("catalog variant removal is blocked by migrated location inventory even before mutation history exists", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(`seeded-variant-${suffix}`);
  const locationId = await createLocation(merchantId, `seeded-variant-${suffix}`);
  const productId = `prd-seeded-location-variant-${suffix}`;
  const variantId = `var-seeded-location-variant-${suffix}`;

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `catalog-seeded-location-variant-${suffix}`,
    input: {
      id: productId,
      name: "Seeded location variant protection",
      price_iqd: 25_000,
      stock_quantity: 6,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      variants: [
        {
          id: variantId,
          name: "Large",
          stock_quantity: 6,
          options: { Size: "L" },
        },
      ],
    },
  });

  await raw(
    `INSERT INTO location_inventory_levels (
       id, merchant_id, location_id, product_id, variant_id,
       quantity, low_stock_threshold, version
     ) VALUES ($1,$2,$3,$4,$5,6,1,1)`,
    [
      `location_inventory_seeded_${suffix}`,
      merchantId,
      locationId,
      productId,
      variantId,
    ],
  );

  const beforeMutations = await raw(
    `SELECT count(*)::int AS count
       FROM inventory_mutations
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
        AND variant_id = $4`,
    [merchantId, locationId, productId, variantId],
  );
  assert.equal(Number(beforeMutations.rows[0]?.count), 0);

  await assert.rejects(
    catalog.updateCatalogProductAuthoritative({
      merchantId,
      productId,
      expectedVersion: created.product.version,
      input: {
        name: "Removal must be rejected",
        description: created.product.description,
        category: created.product.category,
        sku: created.product.sku,
        barcode: created.product.barcode,
        price_iqd: created.product.price_iqd,
        compare_at_price_iqd: created.product.compare_at_price_iqd,
        low_stock_threshold: created.product.low_stock_threshold,
        status: created.product.status,
        allow_fawri_reply: created.product.allow_fawri_reply,
        image_refs: created.product.image_refs,
        variants: [],
      },
    }),
    (error: unknown) => {
      const value = error as {
        code?: unknown;
        status?: unknown;
        details?: { dependencies?: Array<{ kind?: unknown }> };
      };
      assert.equal(value.code, "CATALOG_VARIANT_HISTORY_CONFLICT");
      assert.equal(value.status, 409);
      assert.ok(
        value.details?.dependencies?.some(
          (dependency) => dependency.kind === "location_inventory_levels",
        ),
        "variant removal must identify active location inventory as a dependency",
      );
      return true;
    },
  );

  const preserved = await raw(
    `SELECT quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
        AND variant_id = $4`,
    [merchantId, locationId, productId, variantId],
  );
  assert.equal(preserved.rows.length, 1);
  assert.equal(Number(preserved.rows[0].quantity), 6);
  assert.equal(Number(preserved.rows[0].version), 1);
});

test.after(async () => {
  await pool.end();
});
