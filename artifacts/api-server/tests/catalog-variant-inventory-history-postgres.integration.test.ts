import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "catalog-variant-history-auth-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../src/services/postgresCatalogAuthority.js");

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

test("variant inventory mutations survive subsequent catalog graph rebuilds", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const phone = `077${String(Date.now()).slice(-8)}`;
  const productId = `prd-variant-history-${suffix}`;
  const variantId = `var-variant-history-${suffix}`;

  const pending = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `History Owner ${suffix}`,
    storeName: `History Store ${suffix}`,
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  const merchant = await accounts.markMerchantOtpVerifiedAuthoritative(
    pending.account.id,
  );
  assert.ok(merchant?.merchantProfile);
  const merchantId = merchant.account.id;

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `variant-history-create-${suffix}`,
    input: {
      id: productId,
      name: "Variant inventory history proof",
      price_iqd: 10_000,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      variants: [
        {
          id: variantId,
          name: "Blue",
          stock_quantity: 10,
          options: { Color: "Blue" },
        },
      ],
    },
  });
  assert.equal(created.product.version, 1);
  assert.equal(created.product.variants[0]?.id, variantId);
  assert.equal(created.product.variants[0]?.stock_quantity, 10);

  const first = await catalog.adjustCatalogInventoryAuthoritative({
    merchantId,
    productId,
    variantId,
    expectedVersion: created.product.version,
    delta: -2,
    idempotencyKey: `variant-history-adjust-1-${suffix}`,
    reason: "history regression first adjustment",
  });
  assert.equal(first.product.version, 2);
  assert.equal(first.product.variants[0]?.stock_quantity, 8);

  const afterFirst = await raw(
    `SELECT before_quantity, after_quantity, expected_version, resulting_version
       FROM inventory_mutations
      WHERE merchant_id = $1 AND product_id = $2 AND variant_id = $3
      ORDER BY created_at, id`,
    [merchantId, productId, variantId],
  );
  assert.deepEqual(
    afterFirst.rows.map((row) => ({
      before: Number(row.before_quantity),
      after: Number(row.after_quantity),
      expectedVersion: Number(row.expected_version),
      resultingVersion: Number(row.resulting_version),
    })),
    [{ before: 10, after: 8, expectedVersion: 1, resultingVersion: 2 }],
  );

  const second = await catalog.adjustCatalogInventoryAuthoritative({
    merchantId,
    productId,
    variantId,
    expectedVersion: first.product.version,
    delta: -1,
    idempotencyKey: `variant-history-adjust-2-${suffix}`,
    reason: "history regression second adjustment",
  });
  assert.equal(second.product.version, 3);
  assert.equal(second.product.variants[0]?.stock_quantity, 7);

  const history = await raw(
    `SELECT before_quantity, after_quantity, expected_version, resulting_version
       FROM inventory_mutations
      WHERE merchant_id = $1 AND product_id = $2 AND variant_id = $3
      ORDER BY expected_version, id`,
    [merchantId, productId, variantId],
  );

  assert.deepEqual(
    history.rows.map((row) => ({
      before: Number(row.before_quantity),
      after: Number(row.after_quantity),
      expectedVersion: Number(row.expected_version),
      resultingVersion: Number(row.resulting_version),
    })),
    [
      { before: 10, after: 8, expectedVersion: 1, resultingVersion: 2 },
      { before: 8, after: 7, expectedVersion: 2, resultingVersion: 3 },
    ],
    "variant inventory audit history must not be deleted when the product graph is rebuilt",
  );
});

test.after(async () => {
  await pool.end();
});
