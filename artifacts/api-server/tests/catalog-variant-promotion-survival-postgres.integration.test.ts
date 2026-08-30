import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "catalog-variant-promotion-survival-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../src/services/postgresCatalogAuthority.js");
const promotions = await import(
  "../src/services/postgresCommercePromotionAuthority.js"
);

async function createMerchant(suffix: string) {
  const phone = `077${crypto.randomInt(0, 100_000_000)
    .toString()
    .padStart(8, "0")}`;
  const pending = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Promotion Owner ${suffix}`,
    storeName: `Promotion Store ${suffix}`,
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

test("variant promotion survives an ordinary catalog rebuild that preserves the variant", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(suffix);
  const productId = `prd-promo-survival-${suffix}`;
  const variantId = `var-promo-survival-${suffix}`;

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `promo-survival-create-${suffix}`,
    input: {
      id: productId,
      name: "Variant promotion survival proof",
      price_iqd: 20_000,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      variants: [
        {
          id: variantId,
          name: "Large",
          price_iqd: 22_000,
          stock_quantity: 6,
          options: { Size: "Large" },
        },
      ],
    },
  });
  assert.equal(created.product.version, 1);
  assert.equal(created.product.variants[0]?.id, variantId);

  const promotion = await promotions.createCommercePromotionAuthoritative({
    merchantId,
    idempotencyKey: `promo-survival-${suffix}`,
    input: {
      name: "Large variant discount",
      scope: "catalog_item",
      effect: "percentage_off",
      product_id: productId,
      variant_id: variantId,
      percentage_bps: 1_000,
      starts_local: "2030-01-01T09:00",
      ends_local: "2030-01-02T09:00",
      priority: 10,
      enabled: true,
    },
  });
  assert.equal(promotion.replayed, false);
  assert.equal(promotion.promotion.product_id, productId);
  assert.equal(promotion.promotion.variant_id, variantId);

  const before = await promotions.listCommercePromotionsAuthoritative(merchantId);
  const beforeRow = before.find((item) => item.id === promotion.promotion.id);
  assert.ok(beforeRow);
  assert.equal(beforeRow.variant_id, variantId);

  const current = await catalog.listCatalogProductsAuthoritative(merchantId);
  const currentProduct = current.find((item) => item.id === productId);
  assert.ok(currentProduct);

  const rebuilt = await catalog.updateCatalogProductAuthoritative({
    merchantId,
    productId,
    expectedVersion: currentProduct.version,
    input: {
      name: `${currentProduct.name} renamed`,
      description: currentProduct.description,
      category: currentProduct.category,
      sku: currentProduct.sku,
      barcode: currentProduct.barcode,
      price_iqd: currentProduct.price_iqd,
      compare_at_price_iqd: currentProduct.compare_at_price_iqd,
      low_stock_threshold: currentProduct.low_stock_threshold,
      status: currentProduct.status,
      allow_fawri_reply: currentProduct.allow_fawri_reply,
      image_refs: currentProduct.image_refs,
      variants: currentProduct.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        price_iqd: variant.price_iqd,
        stock_quantity: variant.stock_quantity,
        options: variant.options,
        image_refs: variant.image_refs,
      })),
    },
  });
  assert.equal(rebuilt.product.variants[0]?.id, variantId);

  const after = await promotions.listCommercePromotionsAuthoritative(merchantId);
  const preserved = after.find((item) => item.id === promotion.promotion.id);
  assert.ok(
    preserved,
    "an ordinary catalog rebuild must not cascade-delete a promotion that still targets the same variant",
  );
  assert.equal(preserved.product_id, productId);
  assert.equal(preserved.variant_id, variantId);
  assert.equal(preserved.version, promotion.promotion.version);
});

test.after(async () => {
  await pool.end();
});
