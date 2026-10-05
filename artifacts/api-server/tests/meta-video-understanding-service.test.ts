import assert from "node:assert/strict";
import test from "node:test";
import { MetaVideoUnderstandingService } from "../src/services/metaVideoUnderstandingService.js";

test("video understanding analyzes only bounded extracted frames and preserves provenance", async () => {
  let analyzed = 0;
  const service = new MetaVideoUnderstandingService({
    fetchVideo: async () => ({
      buffer: Buffer.from("video"),
      mimeType: "video/mp4",
      sizeBytes: 5,
      sha256: "a".repeat(64),
    }),
    extractFrames: async () => [
      { buffer: Buffer.from("frame-1"), mimeType: "image/jpeg", sizeBytes: 7, sha256: "b".repeat(64) },
      { buffer: Buffer.from("frame-2"), mimeType: "image/jpeg", sizeBytes: 7, sha256: "c".repeat(64) },
    ],
    analyzeFrame: async ({ image }) => {
      analyzed += 1;
      return {
        description: image.sha256 === "b".repeat(64) ? "black shoe" : "same black shoe",
        visibleText: [],
        productType: "shoe",
        colors: ["black"],
        attributes: ["low top"],
        confidence: 0.92,
        providerId: "test-video-vision",
        model: "test-model",
      };
    },
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    videoUrl: "https://cdn.example.test/product.mp4",
  });

  assert.equal(analyzed, 2);
  assert.equal(result?.videoSha256, "a".repeat(64));
  assert.equal(result?.observation.productType, "shoe");
  assert.deepEqual(result?.observation.colors, ["black"]);
  assert.equal(result?.frameCount, 2);
  assert.equal(result?.exactMatch, null);
  assert.deepEqual(result?.alternatives, []);
});

test("video understanding fails closed if frames disagree on product type", async () => {
  const service = new MetaVideoUnderstandingService({
    fetchVideo: async () => ({
      buffer: Buffer.from("video"),
      mimeType: "video/mp4",
      sizeBytes: 5,
      sha256: "a".repeat(64),
    }),
    extractFrames: async () => [
      { buffer: Buffer.from("1"), mimeType: "image/jpeg", sizeBytes: 1, sha256: "b".repeat(64) },
      { buffer: Buffer.from("2"), mimeType: "image/jpeg", sizeBytes: 1, sha256: "c".repeat(64) },
    ],
    analyzeFrame: async ({ image }) => ({
      description: "visible object",
      visibleText: [],
      productType: image.sha256.startsWith("b") ? "shoe" : "watch",
      colors: [],
      attributes: [],
      confidence: 0.9,
      providerId: "test-video-vision",
      model: "test-model",
    }),
  });
  assert.equal(
    await service.understand({ merchantId: "m", videoUrl: "https://x.test/v.mp4" }),
    null,
  );
});


test("video understanding grounds a consistent observation in the current merchant catalog", async () => {
  let resolvedObservation = "";
  const service = new MetaVideoUnderstandingService({
    fetchVideo: async () => ({
      buffer: Buffer.from("video"),
      mimeType: "video/mp4",
      sizeBytes: 5,
      sha256: "d".repeat(64),
    }),
    extractFrames: async () => [
      { buffer: Buffer.from("1"), mimeType: "image/jpeg", sizeBytes: 1, sha256: "e".repeat(64) },
      { buffer: Buffer.from("2"), mimeType: "image/jpeg", sizeBytes: 1, sha256: "f".repeat(64) },
    ],
    analyzeFrame: async () => ({
      description: "black running shoe",
      visibleText: [],
      productType: "shoe",
      colors: ["black"],
      attributes: ["running"],
      confidence: 0.94,
      providerId: "vision",
      model: "model",
    }),
    resolveCandidates: async ({ observation }) => {
      resolvedObservation = observation.description;
      return [{ productId: "product-1", confidence: 0.96 }];
    },
    matchCatalog: async ({ candidates }) => ({
      matchedRecordId: "catalog-product:product-1",
      productId: candidates[0].productId,
      confidence: candidates[0].confidence,
    }),
    resolveAlternatives: async () => {
      throw new Error("alternatives must not run after an exact match");
    },
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    videoUrl: "https://cdn.example.test/product.mp4",
  });

  assert.match(resolvedObservation, /black running shoe/);
  assert.equal(result?.exactMatch?.matchedRecordId, "catalog-product:product-1");
  assert.deepEqual(result?.alternatives, []);
});

test("video understanding keeps ranked catalog alternatives separate from exact matches", async () => {
  const service = new MetaVideoUnderstandingService({
    fetchVideo: async () => ({
      buffer: Buffer.from("video"),
      mimeType: "video/mp4",
      sizeBytes: 5,
      sha256: "1".repeat(64),
    }),
    extractFrames: async () => [
      { buffer: Buffer.from("1"), mimeType: "image/jpeg", sizeBytes: 1, sha256: "2".repeat(64) },
    ],
    analyzeFrame: async () => ({
      description: "dark wrist watch",
      visibleText: [],
      productType: "watch",
      colors: ["black"],
      attributes: [],
      confidence: 0.88,
      providerId: "vision",
      model: "model",
    }),
    resolveCandidates: async () => [
      { productId: "watch-a", confidence: 0.78 },
      { productId: "watch-b", confidence: 0.72 },
    ],
    matchCatalog: async () => null,
    resolveAlternatives: async ({ candidates }) => candidates,
  });

  const result = await service.understand({
    merchantId: "merchant-a",
    videoUrl: "https://cdn.example.test/watch.mp4",
  });

  assert.equal(result?.exactMatch, null);
  assert.deepEqual(result?.alternatives, [
    { productId: "watch-a", confidence: 0.78 },
    { productId: "watch-b", confidence: 0.72 },
  ]);
});
