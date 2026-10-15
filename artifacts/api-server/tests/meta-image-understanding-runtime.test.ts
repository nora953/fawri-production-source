import assert from "node:assert/strict";
import test from "node:test";

import {
  configureMetaImageUnderstandingService,
  getMetaImageUnderstandingService,
  releaseMetaImageUnderstandingService,
  resetMetaImageUnderstandingServiceForTests,
} from "../src/services/metaImageUnderstandingRuntime";

type FakeService = {
  understand(input: {
    merchantId: string;
    imageUrl: string;
  }): Promise<null>;
};

function fakeService(): FakeService {
  return {
    async understand() {
      return null;
    },
  };
}

test.afterEach(() => {
  resetMetaImageUnderstandingServiceForTests();
});

test("image understanding is disabled until explicitly configured", () => {
  assert.equal(getMetaImageUnderstandingService(), null);
});

test("configured image understanding service is returned unchanged", () => {
  const service = fakeService();

  configureMetaImageUnderstandingService(service);

  assert.equal(getMetaImageUnderstandingService(), service);
});

test("image understanding service cannot be silently replaced", () => {
  configureMetaImageUnderstandingService(fakeService());

  assert.throws(
    () => configureMetaImageUnderstandingService(fakeService()),
    /already configured/i,
  );
});


test("a different service cannot release the configured image service", () => {
  const owner = fakeService();
  const other = fakeService();

  configureMetaImageUnderstandingService(owner);

  assert.equal(
    releaseMetaImageUnderstandingService(other),
    false,
  );
  assert.equal(getMetaImageUnderstandingService(), owner);

  assert.equal(
    releaseMetaImageUnderstandingService(owner),
    true,
  );
  assert.equal(getMetaImageUnderstandingService(), null);
});

test("test reset removes the configured image understanding service", () => {
  configureMetaImageUnderstandingService(fakeService());

  resetMetaImageUnderstandingServiceForTests();

  assert.equal(getMetaImageUnderstandingService(), null);
});

test("runtime factory composes fetch, vision, candidate resolution, and trusted matching", async () => {
  const runtimeModule = await import(
    "../src/services/metaImageUnderstandingRuntime"
  );

  const calls: string[] = [];

  const service = runtimeModule.createMetaImageUnderstandingService({
    fetchImage: async (url: string) => {
      calls.push(`fetch:${url}`);
      return {
        buffer: Buffer.from("verified-image"),
        mimeType: "image/jpeg",
        sizeBytes: 14,
        sha256: "a".repeat(64),
      };
    },
    analyzeImage: async ({ merchantId }: { merchantId: string }) => {
      calls.push(`vision:${merchantId}`);
      return {
        description: "black shirt",
        visibleText: [],
        productType: "shirt",
        colors: ["black"],
        attributes: [],
        confidence: 0.98,
        providerId: "openai_responses_media_vision_v1" as const,
        model: "test-vision-model",
      };
    },
    resolveCandidates: async ({ merchantId }: { merchantId: string }) => {
      calls.push(`resolve:${merchantId}`);
      return [
        {
          productId: "product-1",
          confidence: 0.97,
        },
      ];
    },
    matchCatalog: async ({ merchantId }: { merchantId: string }) => {
      calls.push(`match:${merchantId}`);
      return {
        matchedRecordId: "catalog-product:product-1",
        productId: "product-1",
        confidence: 0.97,
      };
    },
  });

  const result = await service.understand({
    merchantId: "merchant-1",
    imageUrl: "https://example.invalid/product.jpg",
  });

  assert.deepEqual(calls, [
    "fetch:https://example.invalid/product.jpg",
    "vision:merchant-1",
    "resolve:merchant-1",
    "match:merchant-1",
  ]);

  assert.deepEqual(result, {
    matchedRecordId: "catalog-product:product-1",
    productId: "product-1",
    confidence: 0.97,
    imageSha256: "a".repeat(64),
    visionProviderId: "openai_responses_media_vision_v1",
    visionModel: "test-vision-model",
  });
});

test("OpenAI production factory returns a runtime image understanding service", async () => {
  const runtimeModule = await import(
    "../src/services/metaImageUnderstandingRuntime"
  );

  assert.equal(
    typeof runtimeModule.createOpenAiMetaImageUnderstandingService,
    "function",
  );

  const service = runtimeModule.createOpenAiMetaImageUnderstandingService({
    apiKey: "test-openai-key-not-real",
    model: "test-image-model",
  });

  assert.equal(typeof service.understand, "function");
});

test("OpenAI production factory rejects missing API key", async () => {
  const runtimeModule = await import(
    "../src/services/metaImageUnderstandingRuntime"
  );

  assert.throws(
    () =>
      runtimeModule.createOpenAiMetaImageUnderstandingService({
        apiKey: "",
        model: "test-image-model",
      }),
    (error: unknown) => {
      assert.equal(
        (error as { code?: unknown })?.code,
        "META_IMAGE_PROVIDER_CONFIG_INVALID",
      );
      return true;
    },
  );
});

test("OpenAI production factory rejects missing model", async () => {
  const runtimeModule = await import(
    "../src/services/metaImageUnderstandingRuntime"
  );

  assert.throws(
    () =>
      runtimeModule.createOpenAiMetaImageUnderstandingService({
        apiKey: "test-openai-key-not-real",
        model: "",
      }),
    (error: unknown) => {
      assert.equal(
        (error as { code?: unknown })?.code,
        "META_IMAGE_PROVIDER_CONFIG_INVALID",
      );
      return true;
    },
  );
});

test("runtime exposes visual alternatives when no exact catalog match exists", async () => {
  const runtimeModule = await import(
    "../src/services/metaImageUnderstandingRuntime"
  );

  const calls: string[] = [];

  const service = runtimeModule.createMetaImageUnderstandingService({
    fetchImage: async () => ({
      buffer: Buffer.from("verified-image"),
      mimeType: "image/jpeg",
      sizeBytes: 14,
      sha256: "b".repeat(64),
    }),

    analyzeImage: async () => ({
      description: "black athletic shoe with white sole",
      visibleText: [],
      productType: "shoe",
      colors: ["black", "white"],
      attributes: ["athletic", "white sole"],
      confidence: 0.96,
      providerId: "openai_responses_media_vision_v1",
      model: "test-vision-model",
    }),

    resolveCandidates: async () => [
      {
        productId: "similar-shoe",
        confidence: 0.82,
      },
    ],

    matchCatalog: async () => null,

    resolveAlternatives: async ({ merchantId }) => {
      calls.push(`alternatives:${merchantId}`);
      return [
        {
          productId: "similar-shoe",
          confidence: 0.82,
        },
      ];
    },
  });

  assert.equal(
    typeof service.understandWithAlternatives,
    "function",
  );

  const result = await service.understandWithAlternatives({
    merchantId: "merchant-1",
    imageUrl: "https://example.invalid/reference.jpg",
  });

  assert.deepEqual(calls, ["alternatives:merchant-1"]);

  assert.deepEqual(result, {
    exactMatch: null,
    alternatives: [
      {
        productId: "similar-shoe",
        confidence: 0.82,
      },
    ],
    imageSha256: "b".repeat(64),
    visionProviderId: "openai_responses_media_vision_v1",
    visionModel: "test-vision-model",
  });
});
