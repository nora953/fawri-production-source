import assert from "node:assert/strict";
import test from "node:test";

import {
  MetaImageUnderstandingService,
} from "../src/services/metaImageUnderstandingService.js";

test("image understanding returns only the final trusted catalog match", async () => {
  const calls: string[] = [];

  const service = new MetaImageUnderstandingService({
    fetchImage: async () => {
      calls.push("fetch");
      return {
        buffer: Buffer.from("verified-image"),
        mimeType: "image/jpeg",
        sizeBytes: 14,
        sha256: "verified-sha",
      };
    },

    analyzeImage: async () => {
      calls.push("vision");
      return {
        description: "Black short sleeve shirt",
        visibleText: [],
        productType: "shirt",
        colors: ["black"],
        attributes: ["short sleeve"],
        confidence: 0.97,
        providerId: "openai_responses_media_vision_v1",
        model: "vision-test",
      };
    },

    resolveCandidates: async () => {
      calls.push("resolve");
      return [
        {
          productId: "shirt-black",
          variantId: "shirt-black-large",
          confidence: 0.96,
        },
      ];
    },

    matchCatalog: async () => {
      calls.push("match");
      return {
        matchedRecordId:
          "catalog-variant:shirt-black:shirt-black-large",
        productId: "shirt-black",
        variantId: "shirt-black-large",
        confidence: 0.96,
      };
    },
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    imageUrl: "https://example.test/image.jpg",
  });

  assert.deepEqual(calls, [
    "fetch",
    "vision",
    "resolve",
    "match",
  ]);

  assert.deepEqual(result, {
    matchedRecordId:
      "catalog-variant:shirt-black:shirt-black-large",
    productId: "shirt-black",
    variantId: "shirt-black-large",
    confidence: 0.96,
    imageSha256: "verified-sha",
    visionProviderId: "openai_responses_media_vision_v1",
    visionModel: "vision-test",
  });
});

test("image understanding fails closed when vision cannot analyze image", async () => {
  let resolverCalled = false;
  let matcherCalled = false;

  const service = new MetaImageUnderstandingService({
    fetchImage: async () => ({
      buffer: Buffer.from("verified-image"),
      mimeType: "image/jpeg",
      sizeBytes: 14,
      sha256: "verified-sha",
    }),

    analyzeImage: async () => null,

    resolveCandidates: async () => {
      resolverCalled = true;
      return [];
    },

    matchCatalog: async () => {
      matcherCalled = true;
      return null;
    },
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    imageUrl: "https://example.test/image.jpg",
  });

  assert.equal(result, null);
  assert.equal(resolverCalled, false);
  assert.equal(matcherCalled, false);
});

test("image understanding fails closed when no trusted catalog candidate exists", async () => {
  let matcherCalled = false;

  const service = new MetaImageUnderstandingService({
    fetchImage: async () => ({
      buffer: Buffer.from("verified-image"),
      mimeType: "image/jpeg",
      sizeBytes: 14,
      sha256: "verified-sha",
    }),

    analyzeImage: async () => ({
      description: "Unknown object",
      visibleText: [],
      productType: null,
      colors: [],
      attributes: [],
      confidence: 0.4,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test",
    }),

    resolveCandidates: async () => [],

    matchCatalog: async () => {
      matcherCalled = true;
      return null;
    },
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    imageUrl: "https://example.test/image.jpg",
  });

  assert.equal(result, null);
  assert.equal(matcherCalled, false);
});


test("image understanding fails closed when secure image fetch fails", async () => {
  let visionCalled = false;

  const service = new MetaImageUnderstandingService({
    fetchImage: async () => null,
    analyzeImage: async () => {
      visionCalled = true;
      return null;
    },
    resolveCandidates: async () => [],
    matchCatalog: async () => null,
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    imageUrl: "https://example.test/image.jpg",
  });

  assert.equal(result, null);
  assert.equal(visionCalled, false);
});

test("image understanding fails closed when any pipeline dependency throws", async () => {
  const stages = ["fetch", "vision", "resolve", "match"] as const;

  for (const failingStage of stages) {
    const service = new MetaImageUnderstandingService({
      fetchImage: async () => {
        if (failingStage === "fetch") throw new Error("fetch failed");
        return {
          buffer: Buffer.from("verified-image"),
          mimeType: "image/jpeg",
          sizeBytes: 14,
          sha256: "verified-sha",
        };
      },

      analyzeImage: async () => {
        if (failingStage === "vision") throw new Error("vision failed");
        return {
          description: "Black shirt",
          visibleText: [],
          productType: "shirt",
          colors: ["black"],
          attributes: [],
          confidence: 0.97,
          providerId: "openai_responses_media_vision_v1",
          model: "vision-test",
        };
      },

      resolveCandidates: async () => {
        if (failingStage === "resolve") throw new Error("resolver failed");
        return [
          {
            productId: "shirt-black",
            confidence: 0.96,
          },
        ];
      },

      matchCatalog: async () => {
        if (failingStage === "match") throw new Error("matcher failed");
        return {
          matchedRecordId: "catalog-product:shirt-black",
          productId: "shirt-black",
          confidence: 0.96,
        };
      },
    });

    assert.equal(
      await service.understand({
        merchantId: "merchant-a",
        imageUrl: "https://example.test/image.jpg",
      }),
      null,
      `expected ${failingStage} failure to fail closed`,
    );
  }
});

test("image understanding rejects malformed trusted match result", async () => {
  const invalidMatches = [
    {
      matchedRecordId: "",
      productId: "shirt-black",
      confidence: 0.96,
    },
    {
      matchedRecordId: "catalog-product:shirt-black",
      productId: "",
      confidence: 0.96,
    },
    {
      matchedRecordId: "catalog-product:shirt-black",
      productId: "shirt-black",
      confidence: Number.NaN,
    },
    {
      matchedRecordId: "catalog-product:shirt-black",
      productId: "shirt-black",
      confidence: 1.5,
    },
  ];

  for (const invalidMatch of invalidMatches) {
    const service = new MetaImageUnderstandingService({
      fetchImage: async () => ({
        buffer: Buffer.from("verified-image"),
        mimeType: "image/jpeg",
        sizeBytes: 14,
        sha256: "verified-sha",
      }),

      analyzeImage: async () => ({
        description: "Black shirt",
        visibleText: [],
        productType: "shirt",
        colors: ["black"],
        attributes: [],
        confidence: 0.97,
        providerId: "openai_responses_media_vision_v1",
        model: "vision-test",
      }),

      resolveCandidates: async () => [
        {
          productId: "shirt-black",
          confidence: 0.96,
        },
      ],

      matchCatalog: async () => invalidMatch as any,
    });

    assert.equal(
      await service.understand({
        merchantId: "merchant-a",
        imageUrl: "https://example.test/image.jpg",
      }),
      null,
    );
  }
});

test("image understanding does not expose the raw image URL in its result", async () => {
  const rawUrl =
    "https://example.test/private-image.jpg?secret=do-not-persist";

  const service = new MetaImageUnderstandingService({
    fetchImage: async () => ({
      buffer: Buffer.from("verified-image"),
      mimeType: "image/jpeg",
      sizeBytes: 14,
      sha256: "verified-sha",
    }),

    analyzeImage: async () => ({
      description: "Black shirt",
      visibleText: [],
      productType: "shirt",
      colors: ["black"],
      attributes: [],
      confidence: 0.97,
      providerId: "openai_responses_media_vision_v1",
      model: "vision-test",
    }),

    resolveCandidates: async () => [
      {
        productId: "shirt-black",
        confidence: 0.96,
      },
    ],

    matchCatalog: async () => ({
      matchedRecordId: "catalog-product:shirt-black",
      productId: "shirt-black",
      confidence: 0.96,
    }),
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    imageUrl: rawUrl,
  });

  assert.ok(result);
  assert.doesNotMatch(JSON.stringify(result), /private-image|do-not-persist/);
});
