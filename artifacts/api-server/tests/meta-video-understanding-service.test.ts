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
