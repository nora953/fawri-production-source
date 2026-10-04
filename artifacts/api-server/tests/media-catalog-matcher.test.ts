// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { TrustedMediaCatalogMatcher } from "../src/services/mediaCatalogMatcher.js";

function product(overrides = {}) {
  return {
    id: "product-shirt",
    merchant_id: "merchant-a",
    name: "Classic Shirt",
    price_iqd: 25000,
    stock_quantity: 10,
    low_stock_threshold: 2,
    status: "available",
    allow_fawri_reply: true,
    image_refs: [
      {
        id: "image-shirt",
        storage_key: "merchant-a/product-shirt.jpg",
      },
    ],
    variants: [
      {
        id: "variant-black",
        name: "Black",
        stock_quantity: 4,
        options: { color: "Black" },
        image_refs: [
          {
            id: "image-black",
            storage_key: "merchant-a/product-shirt-black.jpg",
          },
        ],
        created_at: "2026-10-02T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      },
    ],
    created_at: "2026-10-02T00:00:00.000Z",
    updated_at: "2026-10-02T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("trusted media catalog matcher accepts an eligible product match", async () => {
  const matcher = new TrustedMediaCatalogMatcher({
    async listCatalogProducts(merchantId) {
      assert.equal(merchantId, "merchant-a");
      return [product()];
    },
  });

  const result = await matcher.resolve({
    merchantId: "merchant-a",
    candidates: [
      {
        productId: "product-shirt",
        confidence: 0.99,
      },
    ],
  });

  assert.deepEqual(result, {
    matchedRecordId: "catalog-product:product-shirt",
    productId: "product-shirt",
    confidence: 0.99,
  });
});

test("trusted media catalog matcher accepts a variant only under its owning product", async () => {
  const matcher = new TrustedMediaCatalogMatcher({
    async listCatalogProducts() {
      return [product()];
    },
  });

  const result = await matcher.resolve({
    merchantId: "merchant-a",
    candidates: [
      {
        productId: "product-shirt",
        variantId: "variant-black",
        confidence: 0.99,
      },
    ],
  });

  assert.equal(
    result?.matchedRecordId,
    "catalog-variant:product-shirt:variant-black",
  );
  assert.equal(result?.productId, "product-shirt");
  assert.equal(result?.variantId, "variant-black");
});

test("trusted media catalog matcher fails closed for cross-tenant candidates", async () => {
  const matcher = new TrustedMediaCatalogMatcher({
    async listCatalogProducts() {
      return [product()];
    },
  });

  const result = await matcher.resolve({
    merchantId: "merchant-a",
    candidates: [
      {
        productId: "foreign-product",
        confidence: 1,
      },
    ],
  });

  assert.equal(result, null);
});

test("trusted media catalog matcher rejects products that Fawri may not use", async () => {
  for (const blocked of [
    product({ allow_fawri_reply: false }),
    product({ status: "draft" }),
    product({ status: "hidden_from_fawri" }),
    product({ version: 0 }),
  ]) {
    const matcher = new TrustedMediaCatalogMatcher({
      async listCatalogProducts() {
        return [blocked];
      },
    });

    const result = await matcher.resolve({
      merchantId: "merchant-a",
      candidates: [
        {
          productId: "product-shirt",
          confidence: 1,
        },
      ],
    });

    assert.equal(result, null);
  }
});

test("trusted media catalog matcher rejects low-confidence and ambiguous matches", async () => {
  const matcher = new TrustedMediaCatalogMatcher({
    async listCatalogProducts() {
      return [
        product(),
        product({
          id: "product-shirt-2",
          name: "Classic Shirt 2",
        }),
      ];
    },
  });

  const lowConfidence = await matcher.resolve({
    merchantId: "merchant-a",
    candidates: [
      {
        productId: "product-shirt",
        confidence: 0.5,
      },
    ],
  });

  assert.equal(lowConfidence, null);

  const ambiguous = await matcher.resolve({
    merchantId: "merchant-a",
    candidates: [
      {
        productId: "product-shirt",
        confidence: 0.99,
      },
      {
        productId: "product-shirt-2",
        confidence: 0.98,
      },
    ],
  });

  assert.equal(ambiguous, null);
});

test("trusted media catalog matcher rejects a variant that belongs to another product", async () => {
  const matcher = new TrustedMediaCatalogMatcher({
    async listCatalogProducts() {
      return [
        product(),
        product({
          id: "product-other",
          name: "Other Shirt",
          variants: [
            {
              id: "variant-white",
              name: "White",
              stock_quantity: 3,
              options: { color: "White" },
              image_refs: [],
              created_at: "2026-10-02T00:00:00.000Z",
              updated_at: "2026-10-02T00:00:00.000Z",
            },
          ],
        }),
      ];
    },
  });

  const result = await matcher.resolve({
    merchantId: "merchant-a",
    candidates: [
      {
        productId: "product-shirt",
        variantId: "variant-white",
        confidence: 1,
      },
    ],
  });

  assert.equal(result, null);
});

test("duplicate candidates for the same catalog identity do not create false ambiguity", async () => {
  const matcher = new TrustedMediaCatalogMatcher({
    async listCatalogProducts() {
      return [product()];
    },
  });

  const result = await matcher.resolve({
    merchantId: "merchant-a",
    candidates: [
      {
        productId: "product-shirt",
        confidence: 0.99,
      },
      {
        productId: "product-shirt",
        confidence: 0.98,
      },
    ],
  });

  assert.equal(result?.matchedRecordId, "catalog-product:product-shirt");
  assert.equal(result?.confidence, 0.99);
});
