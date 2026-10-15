import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { existsSync } from "node:fs";
import { FfmpegMetaVideoFrameExtractor } from "../src/services/metaVideoFrameExtractor.js";

const video = { buffer: Buffer.from("video"), mimeType: "video/mp4", sizeBytes: 5, sha256: "a".repeat(64) };

test("default decoder kills a stalled child before cleaning its input", { timeout: 2_000 }, async (t) => {
  const originalSpawn = childProcess.spawn;
  let child: ReturnType<typeof childProcess.spawn> | undefined;
  let inputPath = "";
  t.after(() => { child?.kill("SIGKILL"); });
  t.mock.method(childProcess, "spawn", (command: string, args: string[], options: any) => {
    assert.equal(command, "ffmpeg");
    inputPath = args[args.indexOf("-i") + 1];
    // A local idle Node child models a stuck decoder; no media or network required.
    child = originalSpawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], options);
    return child;
  });
  syncBuiltinESMExports();
  try {
    const extractor = new FfmpegMetaVideoFrameExtractor({ timeoutMs: 50 });
    assert.deepEqual(await extractor.extract(video), []);
    assert.ok(child);
    assert.equal(child.signalCode, "SIGKILL");
    assert.equal(existsSync(inputPath), false);
  } finally {
    child?.kill("SIGKILL");
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("video frame extractor aborts a stalled decoder and cleans temporary files", async () => {
  let aborted = false;
  let cleaned = false;
  const extractor = new FfmpegMetaVideoFrameExtractor({
    timeoutMs: 20,
    runFfmpeg: async ({ signal }) => new Promise(resolve => {
      const fallback = setTimeout(() => resolve([]), 150);
      signal?.addEventListener("abort", () => {
        aborted = true;
        clearTimeout(fallback);
        resolve([]);
      }, { once: true });
    }),
    onCleanup: () => { cleaned = true; },
  });
  assert.deepEqual(await extractor.extract(video), []);
  assert.equal(aborted, true, "decoder work must receive cancellation");
  assert.equal(cleaned, true);
});

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
