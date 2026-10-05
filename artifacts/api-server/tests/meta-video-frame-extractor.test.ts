import assert from "node:assert/strict";
import test from "node:test";
import { FfmpegMetaVideoFrameExtractor } from "../src/services/metaVideoFrameExtractor.js";

const video = { buffer: Buffer.from("video"), mimeType: "video/mp4", sizeBytes: 5, sha256: "a".repeat(64) };

test("video frame extractor returns bounded verified JPEG frames and cleans temporary files", async () => {
  let cleaned = false;
  const extractor = new FfmpegMetaVideoFrameExtractor({
    runFfmpeg: async ({ outputPattern }) => {
      assert.match(outputPattern, /frame-%02d\.jpg$/);
      return [
        Buffer.from([0xff,0xd8,0xff,0xd9]),
        Buffer.from([0xff,0xd8,0xff,0xd9]),
      ];
    },
    onCleanup: () => { cleaned = true; },
  });
  const frames = await extractor.extract(video);
  assert.equal(frames.length, 2);
  assert.ok(frames.every(x => x.mimeType === "image/jpeg"));
  assert.ok(frames.every(x => /^[a-f0-9]{64}$/.test(x.sha256)));
  assert.equal(cleaned, true);
});

test("video frame extractor fails closed for too many or invalid frames", async () => {
  const tooMany = new FfmpegMetaVideoFrameExtractor({
    runFfmpeg: async () => Array.from({length: 7}, () => Buffer.from([0xff,0xd8,0xff,0xd9])),
  });
  assert.deepEqual(await tooMany.extract(video), []);

  const invalid = new FfmpegMetaVideoFrameExtractor({
    runFfmpeg: async () => [Buffer.from("not-jpeg")],
  });
  assert.deepEqual(await invalid.extract(video), []);
});
