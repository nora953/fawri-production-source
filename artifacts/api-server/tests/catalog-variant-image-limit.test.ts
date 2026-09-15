import assert from "node:assert/strict";
import test from "node:test";

import { CatalogRuntimeError } from "../src/services/catalogInventoryRuntime";
import { normalizeCatalogProduct } from "../src/services/catalogProductNormalization";

const NOW = "2026-09-01T00:00:00.000Z";

function variantImages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    url: `https://cdn.example.test/variant-${index + 1}.jpg`,
    alt: `Variant image ${index + 1}`,
  }));
}

function normalizeWithVariantImageCount(count: number) {
  return normalizeCatalogProduct(
    {
      name: "Variant image limit product",
      price_iqd: 10_000,
      variants: [
        {
          name: "Red",
          stock_quantity: 0,
          options: { Color: "Red" },
          image_refs: variantImages(count),
        },
      ],
    },
    {
      merchantId: "merchant-variant-image-limit",
      now: NOW,
      forceCreate: true,
    },
  );
}

test("variant catalog accepts up to ten image references", () => {
  const product = normalizeWithVariantImageCount(10);
  assert.equal(product.variants.length, 1);
  assert.equal(product.variants[0].image_refs.length, 10);
});

test("variant catalog rejects an eleventh image reference", () => {
  assert.throws(
    () => normalizeWithVariantImageCount(11),
    (error: unknown) => {
      assert.ok(error instanceof CatalogRuntimeError);
      assert.equal(error.code, "CATALOG_IMAGES_LIMIT_EXCEEDED");
      assert.equal(error.details?.max, 10);
      return true;
    },
  );
});
