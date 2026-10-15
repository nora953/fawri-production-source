import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "catalog-variant-signature-secret-over-thirty-two-characters";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../src/services/postgresCatalogAuthority.js");

async function createMerchant(suffix: string) {
  let phone = "";
  for (let attempt = 0; attempt < 10 && !phone; attempt += 1) {
    const candidate = `077${crypto.randomInt(0, 100_000_000)
      .toString()
      .padStart(8, "0")}`;
    const collision = await pool.query(
      "SELECT id FROM accounts WHERE phone = $1 LIMIT 1",
      [candidate],
    );
    if (collision.rows.length === 0) phone = candidate;
  }
  assert.ok(phone, "failed to generate an isolated merchant phone fixture");

  const pending = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Signature Owner ${suffix}`,
    storeName: `Signature Store ${suffix}`,
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

test("short canonical variant options persist with a schema-safe deterministic signature", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(suffix);
  const productId = `prd-signature-${suffix}`;
  const variantId = `var-signature-${suffix}`;

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `signature-create-${suffix}`,
    input: {
      id: productId,
      name: "Variant signature schema proof",
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

  assert.equal(created.product.variants[0]?.id, variantId);

  const first = await pool.query(
    `SELECT option_signature
       FROM product_variants
      WHERE merchant_id = $1 AND product_id = $2 AND id = $3`,
    [merchantId, productId, variantId],
  );
  assert.equal(first.rows.length, 1);
  const firstSignature = String(first.rows[0].option_signature || "");
  assert.ok(firstSignature.length >= 16 && firstSignature.length <= 256);
  assert.match(firstSignature, /^sig_[a-f0-9]{64}$/);

  const updated = await catalog.updateCatalogProductAuthoritative({
    merchantId,
    productId,
    expectedVersion: created.product.version,
    input: {
      name: `${created.product.name} updated`,
      variants: created.product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        stock_quantity: variant.stock_quantity,
        options: variant.options,
      })),
    },
  });
  assert.equal(updated.variants[0]?.id, variantId);

  const second = await pool.query(
    `SELECT option_signature
       FROM product_variants
      WHERE merchant_id = $1 AND product_id = $2 AND id = $3`,
    [merchantId, productId, variantId],
  );
  assert.equal(second.rows.length, 1);
  assert.equal(
    String(second.rows[0].option_signature || ""),
    firstSignature,
    "the same logical variant must keep the same persisted signature across graph rebuilds",
  );
});

test("oversized canonical variant options are reduced to the same bounded signature namespace", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(`long-${suffix}`);
  const productId = `prd-signature-long-${suffix}`;
  const variantId = `var-signature-long-${suffix}`;
  const optionA = `Material-${"a".repeat(68)}`;
  const optionB = `Finish-${"b".repeat(70)}`;
  const valueA = "x".repeat(120);
  const valueB = "y".repeat(120);

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `signature-long-create-${suffix}`,
    input: {
      id: productId,
      name: "Long variant signature schema proof",
      price_iqd: 20_000,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      variants: [
        {
          id: variantId,
          name: "Long option variant",
          stock_quantity: 3,
          options: {
            [optionA]: valueA,
            [optionB]: valueB,
          },
        },
      ],
    },
  });
  assert.equal(created.product.variants[0]?.id, variantId);

  const stored = await pool.query(
    `SELECT option_signature
       FROM product_variants
      WHERE merchant_id = $1 AND product_id = $2 AND id = $3`,
    [merchantId, productId, variantId],
  );
  assert.equal(stored.rows.length, 1);
  const signature = String(stored.rows[0].option_signature || "");
  assert.equal(signature.length, 68);
  assert.match(signature, /^sig_[a-f0-9]{64}$/);
});

test.after(async () => {
  await pool.end();
});
