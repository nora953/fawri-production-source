import assert from "node:assert/strict";
import test from "node:test";
import { META_VIDEO_MAX_BYTES, SecureMetaVideoFetcher } from "../src/services/metaVideoFetcher.js";

const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 }];
function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
}
function mp4() {
  return new Uint8Array([0,0,0,20,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d,0,0,0,0,0,0,0,0]);
}

test("secure video fetcher accepts bounded verified MP4 and pins validated DNS", async () => {
  const bytes = mp4();
  let seen: { hostname: string; address: string; family: number } | undefined;
  const fetcher = new SecureMetaVideoFetcher({
    resolveHost: PUBLIC,
    transportImpl: async (request) => {
      seen = request;
      return new Response(stream(bytes), { status: 200, headers: {
        "content-type": "video/mp4", "content-length": String(bytes.length),
      }});
    },
  });
  const result = await fetcher.fetchVideo({ url: "https://cdn.example.test/v.mp4" });
  assert.ok(seen);
  assert.equal(seen.address, "93.184.216.34");
  assert.equal(result.mimeType, "video/mp4");
  assert.equal(result.sizeBytes, bytes.length);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test("secure video fetcher rejects HTTP, private DNS, redirects, oversize, and mislabeled bytes", async () => {
  const noNetwork = new SecureMetaVideoFetcher({
    resolveHost: PUBLIC,
    transportImpl: async () => { throw new Error("must not execute"); },
  });
  await assert.rejects(noNetwork.fetchVideo({ url: "http://cdn.example.test/v.mp4" }),
    (e: unknown) => (e as {code?: string})?.code === "META_VIDEO_URL_INVALID");

  const privateDns = new SecureMetaVideoFetcher({
    resolveHost: async () => [{ address: "127.0.0.1", family: 4 }],
    transportImpl: async () => { throw new Error("must not execute"); },
  });
  await assert.rejects(privateDns.fetchVideo({ url: "https://cdn.example.test/v.mp4" }),
    (e: unknown) => (e as {code?: string})?.code === "META_VIDEO_DESTINATION_FORBIDDEN");

  const redirect = new SecureMetaVideoFetcher({
    resolveHost: PUBLIC,
    transportImpl: async () => new Response(null, { status: 302 }),
  });
  await assert.rejects(redirect.fetchVideo({ url: "https://cdn.example.test/v.mp4" }),
    (e: unknown) => (e as {code?: string})?.code === "META_VIDEO_REDIRECT_REJECTED");

  const oversized = new SecureMetaVideoFetcher({
    resolveHost: PUBLIC,
    transportImpl: async () => new Response(null, { status: 200, headers: {
      "content-type": "video/mp4", "content-length": String(META_VIDEO_MAX_BYTES + 1),
    }}),
  });
  await assert.rejects(oversized.fetchVideo({ url: "https://cdn.example.test/v.mp4" }),
    (e: unknown) => (e as {code?: string})?.code === "META_VIDEO_TOO_LARGE");

  const fake = new SecureMetaVideoFetcher({
    resolveHost: PUBLIC,
    transportImpl: async () => new Response(stream(new TextEncoder().encode("<html>")), {
      status: 200, headers: { "content-type": "video/mp4" },
    }),
  });
  await assert.rejects(fake.fetchVideo({ url: "https://cdn.example.test/v.mp4" }),
    (e: unknown) => (e as {code?: string})?.code === "META_VIDEO_CONTENT_INVALID");
});
