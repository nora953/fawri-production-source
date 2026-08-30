import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "catalog-variant-removal-history-conflict-secret-32-bytes";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../src/services/postgresCatalogAuthority.js");

async function createMerchant(suffix: string) {
  const phone = `077${crypto.randomInt(0, 100_000_000)
    .toString()
    .padStart(8, "0")}`;
  const pending = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Removal Guard Owner ${suffix}`,
    storeName: `Removal Guard Store ${suffix}`,
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

test("removing a variant with inventory history fails closed and rolls the catalog transaction back", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(suffix);
  const productId = `prd-removal-guard-${suffix}`;
  const variantId = `var-removal-guard-${suffix}`;

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `removal-guard-create-${suffix}`,
    input: {
      id: productId,
      name: "Removal guard proof",
      price_iqd: 12_000,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      variants: [
        {
          id: variantId,
          name: "Blue",
          stock_quantity: 5,
          options: { Color: "Blue" },
        },
      ],
    },
  });

  const adjusted = await catalog.adjustCatalogInventoryAuthoritative({
    merchantId,
    productId,
    variantId,
    expectedVersion: created.product.version,
    delta: -1,
    idempotencyKey: `removal-guard-adjust-${suffix}`,
    reason: "establish immutable variant history",
  });
  assert.equal(adjusted.product.version, 2);
  assert.equal(adjusted.product.variants[0]?.stock_quantity, 4);

  await assert.rejects(
    catalog.updateCatalogProductAuthoritative({
      merchantId,
      productId,
      expectedVersion: adjusted.product.version,
      input: {
        name: "This rename must roll back",
        description: adjusted.product.description,
        category: adjusted.product.category,
        sku: adjusted.product.sku,
        barcode: adjusted.product.barcode,
        price_iqd: adjusted.product.price_iqd,
        compare_at_price_iqd: adjusted.product.compare_at_price_iqd,
        low_stock_threshold: adjusted.product.low_stock_threshold,
        status: adjusted.product.status,
        allow_fawri_reply: adjusted.product.allow_fawri_reply,
        image_refs: adjusted.product.image_refs,
        variants: [],
      },
    }),
    (error: unknown) => {
      const value = error as {
        code?: unknown;
        status?: unknown;
        details?: { variant_ids?: unknown; dependencies?: unknown };
      };
      assert.equal(value.code, "CATALOG_VARIANT_HISTORY_CONFLICT");
      assert.equal(value.status, 409);
      assert.deepEqual(value.details?.variant_ids, [variantId]);
      assert.ok(Array.isArray(value.details?.dependencies));
      return true;
    },
  );

  const reloaded = (
    await catalog.listCatalogProductsAuthoritative(merchantId)
  ).find((item) => item.id === productId);
  assert.ok(reloaded);
  assert.equal(reloaded.name, adjusted.product.name);
  assert.equal(reloaded.version, adjusted.product.version);
  assert.equal(reloaded.variants.length, 1);
  assert.equal(reloaded.variants[0]?.id, variantId);
  assert.equal(reloaded.variants[0]?.stock_quantity, 4);
  assert.deepEqual(reloaded.variants[0]?.options, { Color: "Blue" });

  const mutation = await pool.query(
    `SELECT before_quantity, after_quantity, expected_version, resulting_version
       FROM inventory_mutations
      WHERE merchant_id = $1 AND product_id = $2 AND variant_id = $3`,
    [merchantId, productId, variantId],
  );
  assert.equal(mutation.rows.length, 1);
  assert.equal(Number(mutation.rows[0].before_quantity), 5);
  assert.equal(Number(mutation.rows[0].after_quantity), 4);
  assert.equal(Number(mutation.rows[0].expected_version), 1);
  assert.equal(Number(mutation.rows[0].resulting_version), 2);
});

test.after(async () => {
  await pool.end();
});
