import assert from "node:assert/strict";
import test from "node:test";

import { scopeCatalogImageAttachmentIds } from "../src/services/postgresCatalogAuthority";

const SHARED_IMAGE = {
  id: "img_shared_media",
  storage_key: "catalog/merchant/shared/blender-red.webp",
  url: "/api/catalog/media/catalog%2Fmerchant%2Fshared%2Fblender-red.webp",
};

test("shared media receives a distinct attachment ID for product and each variant", () => {
  const scoped = scopeCatalogImageAttachmentIds(
    {
      name: "Shared image product",
      image_refs: [SHARED_IMAGE],
      variants: [
        {
          id: "variant-red-1l",
          options: { Color: "Red", Capacity: "1L" },
          image_refs: [SHARED_IMAGE],
        },
        {
          id: "variant-red-2l",
          options: { Color: "Red", Capacity: "2L" },
          image_refs: [SHARED_IMAGE],
        },
      ],
    },
    "merchant-1\0product-1",
  );

  const productImage = (scoped.image_refs as Array<Record<string, unknown>>)[0];
  const variants = scoped.variants as Array<Record<string, unknown>>;
  const firstVariantImage = (
    variants[0].image_refs as Array<Record<string, unknown>>
  )[0];
  const secondVariantImage = (
    variants[1].image_refs as Array<Record<string, unknown>>
  )[0];

  assert.equal(productImage.storage_key, SHARED_IMAGE.storage_key);
  assert.equal(firstVariantImage.storage_key, SHARED_IMAGE.storage_key);
  assert.equal(secondVariantImage.storage_key, SHARED_IMAGE.storage_key);

  const ids = new Set([
    productImage.id,
    firstVariantImage.id,
    secondVariantImage.id,
  ]);
  assert.equal(ids.size, 3);
});

test("attachment IDs remain stable for the same graph and owner", () => {
  const input = {
    variants: [
      {
        id: "variant-red",
        image_refs: [SHARED_IMAGE],
      },
    ],
  };

  const first = scopeCatalogImageAttachmentIds(input, "merchant-1\0product-1");
  const second = scopeCatalogImageAttachmentIds(input, "merchant-1\0product-1");

  const firstId = (
    (first.variants as Array<Record<string, unknown>>)[0]
      .image_refs as Array<Record<string, unknown>>
  )[0].id;
  const secondId = (
    (second.variants as Array<Record<string, unknown>>)[0]
      .image_refs as Array<Record<string, unknown>>
  )[0].id;

  assert.equal(firstId, secondId);
});
