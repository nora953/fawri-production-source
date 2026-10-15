import assert from "node:assert/strict";
import test from "node:test";

import {
  MediaCatalogCandidateResolver,
} from "../src/services/mediaCatalogCandidateResolver.js";
import type { CatalogProduct } from "../src/services/catalogInventoryRuntime.js";

function product(
  overrides: Partial<CatalogProduct> & Pick<CatalogProduct, "id" | "name">,
): CatalogProduct {
  return {
    id: overrides.id,
    merchant_id: overrides.merchant_id || "merchant-a",
    name: overrides.name,
    price_iqd: 10_000,
    stock_quantity: 5,
    low_stock_threshold: 1,
    status: "available",
    allow_fawri_reply: true,
    image_refs: [],
    variants: [],
    created_at: "2026-10-03T00:00:00.000Z",
    updated_at: "2026-10-03T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("resolver derives catalog candidates from visual observations without exposing commerce facts", async () => {
  let capturedPrompt = "";

  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "shirt-black",
        name: "Classic Black T-Shirt",
        category: "T-Shirts",
        description: "Short sleeve cotton shirt with small white chest logo",
        image_refs: [
          {
            id: "img-1",
            alt: "black short sleeve shirt white chest logo",
          },
        ],
        variants: [
          {
            id: "shirt-black-large",
            name: "Large / Black",
            sku: "SECRET-SKU-001",
            price_iqd: 15_000,
            stock_quantity: 3,
            options: {
              Size: "Large",
              Color: "Black",
            },
            image_refs: [],
            created_at: "2026-10-03T00:00:00.000Z",
            updated_at: "2026-10-03T00:00:00.000Z",
          },
        ],
      }),
      product({
        id: "shoe-white",
        name: "White Running Shoe",
        category: "Shoes",
        description: "Lightweight white running footwear",
      }),
    ],
    rankCandidates: async ({ prompt }) => {
      capturedPrompt = prompt;
      return [
        {
          productId: "shirt-black",
          variantId: "shirt-black-large",
          confidence: 0.97,
        },
      ];
    },
  });

  const candidates = await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "Black short-sleeve shirt with a small white chest logo",
      visibleText: [],
      productType: "shirt",
      colors: ["black", "white"],
      attributes: ["short sleeve"],
      confidence: 0.96,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.deepEqual(candidates, [
    {
      productId: "shirt-black",
      variantId: "shirt-black-large",
      confidence: 0.97,
    },
  ]);

  assert.match(capturedPrompt, /Classic Black T-Shirt/);
  assert.match(capturedPrompt, /Large \/ Black/);
  assert.match(capturedPrompt, /Color/);
  assert.match(capturedPrompt, /Black/);

  assert.doesNotMatch(capturedPrompt, /10000|10,000|15000|15,000/);
  assert.doesNotMatch(capturedPrompt, /SECRET-SKU-001/);
  assert.doesNotMatch(capturedPrompt, /stock_quantity|low_stock_threshold/i);
});

test("resolver rejects candidate ids not present in the same merchant catalog", async () => {
  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "shirt-black",
        name: "Classic Black T-Shirt",
      }),
    ],
    rankCandidates: async () => [
      {
        productId: "foreign-product",
        confidence: 0.99,
      },
    ],
  });

  const candidates = await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "Black shirt",
      visibleText: [],
      productType: "shirt",
      colors: ["black"],
      attributes: [],
      confidence: 0.95,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.deepEqual(candidates, []);
});

test("resolver excludes products that Fawri is not allowed to use", async () => {
  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "hidden-product",
        name: "Hidden Black Shirt",
        status: "hidden_from_fawri",
        allow_fawri_reply: false,
      }),
    ],
    rankCandidates: async () => [
      {
        productId: "hidden-product",
        confidence: 0.99,
      },
    ],
  });

  const candidates = await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "Black shirt",
      visibleText: [],
      productType: "shirt",
      colors: ["black"],
      attributes: [],
      confidence: 0.95,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.deepEqual(candidates, []);
});

test("resolver rejects a variant that belongs to a different product", async () => {
  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "shirt-a",
        name: "Black Shirt",
        variants: [
          {
            id: "variant-a",
            name: "Black",
            stock_quantity: 1,
            options: { Color: "Black" },
            image_refs: [],
            created_at: "2026-10-03T00:00:00.000Z",
            updated_at: "2026-10-03T00:00:00.000Z",
          },
        ],
      }),
      product({
        id: "shirt-b",
        name: "White Shirt",
        variants: [
          {
            id: "variant-b",
            name: "White",
            stock_quantity: 1,
            options: { Color: "White" },
            image_refs: [],
            created_at: "2026-10-03T00:00:00.000Z",
            updated_at: "2026-10-03T00:00:00.000Z",
          },
        ],
      }),
    ],
    rankCandidates: async () => [
      {
        productId: "shirt-a",
        variantId: "variant-b",
        confidence: 0.99,
      },
    ],
  });

  const candidates = await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "Black shirt",
      visibleText: [],
      productType: "shirt",
      colors: ["black"],
      attributes: [],
      confidence: 0.95,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.deepEqual(candidates, []);
});

test("resolver excludes products belonging to another merchant before ranking", async () => {
  let capturedPrompt = "";

  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "merchant-a-shirt",
        merchant_id: "merchant-a",
        name: "Merchant A Shirt",
      }),
      product({
        id: "merchant-b-shirt",
        merchant_id: "merchant-b",
        name: "Merchant B Secret Shirt",
      }),
    ],
    rankCandidates: async ({ prompt }) => {
      capturedPrompt = prompt;
      return [];
    },
  });

  await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "shirt",
      visibleText: [],
      productType: "shirt",
      colors: [],
      attributes: [],
      confidence: 0.9,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.match(capturedPrompt, /Merchant A Shirt/);
  assert.doesNotMatch(capturedPrompt, /Merchant B Secret Shirt/);
  assert.doesNotMatch(capturedPrompt, /merchant-b-shirt/);
});

test("resolver rejects non-finite and out-of-range candidate confidence", async () => {
  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "shirt",
        name: "Black Shirt",
      }),
    ],
    rankCandidates: async () => [
      { productId: "shirt", confidence: Number.NaN },
      { productId: "shirt", confidence: Number.POSITIVE_INFINITY },
      { productId: "shirt", confidence: -0.1 },
      { productId: "shirt", confidence: 1.01 },
    ],
  });

  const candidates = await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "Black shirt",
      visibleText: [],
      productType: "shirt",
      colors: ["black"],
      attributes: [],
      confidence: 0.95,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.deepEqual(candidates, []);
});

test("resolver fails closed when candidate ranker throws", async () => {
  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "shirt",
        name: "Black Shirt",
      }),
    ],
    rankCandidates: async () => {
      throw new Error("provider unavailable");
    },
  });

  const candidates = await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "Black shirt",
      visibleText: [],
      productType: "shirt",
      colors: ["black"],
      attributes: [],
      confidence: 0.95,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.deepEqual(candidates, []);
});

test("resolver does not call ranker when no eligible catalog products exist", async () => {
  let calls = 0;

  const resolver = new MediaCatalogCandidateResolver({
    listCatalogProducts: async () => [
      product({
        id: "draft-shirt",
        name: "Draft Shirt",
        status: "draft",
      }),
    ],
    rankCandidates: async () => {
      calls += 1;
      return [];
    },
  });

  const candidates = await resolver.resolve({
    merchantId: "merchant-a",
    observation: {
      description: "shirt",
      visibleText: [],
      productType: "shirt",
      colors: [],
      attributes: [],
      confidence: 0.95,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test-model",
    },
  });

  assert.deepEqual(candidates, []);
  assert.equal(calls, 0);
});
