import assert from "node:assert/strict";
import test from "node:test";
import {
  META_AUDIO_MAX_BYTES,
  SecureMetaAudioFetcher,
} from "../src/services/metaAudioFetcher.js";

const PUBLIC_TEST_DNS = async () => [
  { address: "93.184.216.34", family: 4 },
];

function stream(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test("secure audio fetcher accepts bounded HTTPS audio and hashes exact bytes", async () => {
  const bytes = new TextEncoder().encode("ID3-audio-test");
  const fetcher = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    fetchImpl: async (_url, init) => {
      assert.equal(init?.redirect, "manual");
      return new Response(stream(bytes), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(bytes.byteLength),
        },
      });
    },
  });

  const result = await fetcher.fetchAudio({
    url: "https://cdn.example.test/private-question.mp3",
  });

  assert.equal(result.mimeType, "audio/mpeg");
  assert.equal(result.sizeBytes, bytes.byteLength);
  assert.deepEqual(result.buffer, Buffer.from(bytes));
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test("secure audio fetcher rejects non-HTTPS before network access", async () => {
  let calls = 0;
  const fetcher = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    fetcher.fetchAudio({ url: "http://127.0.0.1/private.mp3" }),
    (error: unknown) => (error as { code?: string } | null)?.code === "META_AUDIO_URL_INVALID",
  );
  assert.equal(calls, 0);
});

test("secure audio fetcher rejects redirects and private DNS destinations", async () => {
  const redirectFetcher = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example.test/audio.mp3" },
      }),
  });

  await assert.rejects(
    redirectFetcher.fetchAudio({ url: "https://cdn.example.test/audio.mp3" }),
    (error: unknown) => (error as { code?: string } | null)?.code === "META_AUDIO_REDIRECT_REJECTED",
  );

  let calls = 0;
  const privateFetcher = new SecureMetaAudioFetcher({
    resolveHost: async () => [{ address: "127.0.0.1", family: 4 }],
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    privateFetcher.fetchAudio({ url: "https://cdn.example.test/audio.mp3" }),
    (error: unknown) => (error as { code?: string } | null)?.code === "META_AUDIO_DESTINATION_FORBIDDEN",
  );
  assert.equal(calls, 0);
});

test("secure audio fetcher rejects unsupported MIME and oversized declarations", async () => {
  const unsupported = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    fetchImpl: async () =>
      new Response(stream(new Uint8Array([1, 2, 3])), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  });

  await assert.rejects(
    unsupported.fetchAudio({ url: "https://cdn.example.test/audio.mp3" }),
    (error: unknown) => (error as { code?: string } | null)?.code === "META_AUDIO_MIME_INVALID",
  );

  const oversized = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    fetchImpl: async () =>
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(META_AUDIO_MAX_BYTES + 1),
        },
      }),
  });

  await assert.rejects(
    oversized.fetchAudio({ url: "https://cdn.example.test/audio.mp3" }),
    (error: unknown) => (error as { code?: string } | null)?.code === "META_AUDIO_TOO_LARGE",
  );
});

test("secure audio fetcher errors never expose private media URL tokens", async () => {
  const privateUrl =
    "https://cdn.example.test/private.mp3?token=super-secret-value";
  const fetcher = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    fetchImpl: async () => {
      throw new Error("network failure");
    },
  });

  await assert.rejects(fetcher.fetchAudio({ url: privateUrl }), (error: unknown) => {
    assert.equal((error as { code?: string } | null)?.code, "META_AUDIO_FETCH_FAILED");
    assert.doesNotMatch(String((error as { message?: string } | null)?.message), /super-secret-value|private\.mp3/);
    return true;
  });
});

test("secure audio fetcher pins transport to the address that passed DNS validation", async () => {
  const bytes = new TextEncoder().encode("ID3-audio-test");
  let seen: { hostname: string; address: string; family: number } | undefined;
  const fetcher = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    transportImpl: async (request) => {
      seen = request;
      return new Response(stream(bytes), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(bytes.byteLength),
        },
      });
    },
  });

  await fetcher.fetchAudio({ url: "https://cdn.example.test/private.mp3" });
  assert.ok(seen);
  assert.equal(seen.hostname, "cdn.example.test");
  assert.equal(seen.address, "93.184.216.34");
  assert.equal(seen.family, 4);
});

test("secure audio fetcher rejects non-audio bytes mislabeled as audio", async () => {
  const bytes = new TextEncoder().encode("<html>not audio</html>");
  const fetcher = new SecureMetaAudioFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    fetchImpl: async () =>
      new Response(stream(bytes), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(bytes.byteLength),
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchAudio({ url: "https://cdn.example.test/fake.mp3" }),
    (error: unknown) =>
      (error as { code?: string } | null)?.code ===
      "META_AUDIO_CONTENT_INVALID",
  );
});


test("secure audio fetcher bounds stalled DNS resolution and never reaches transport", async () => {
  let transportCalls = 0;
  const fetcher = new SecureMetaAudioFetcher({
    timeoutMs: 20,
    resolveHost: async () => new Promise(() => {}),
    transportImpl: async () => {
      transportCalls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    fetcher.fetchAudio({ url: "https://cdn.example.test/stalled.mp3" }),
    (error: unknown) => (error as { code?: string } | null)?.code === "META_AUDIO_TIMEOUT",
  );
  assert.equal(transportCalls, 0);
});


test("secure audio fetcher bounds a stalled response body stream", async () => {
  const fetcher = new SecureMetaAudioFetcher({
    timeoutMs: 20,
    resolveHost: PUBLIC_TEST_DNS,
    transportImpl: async (request) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("ID3"));
          request.signal.addEventListener("abort", () => {
            controller.error(Object.assign(new Error("aborted"), { name: "AbortError" }));
          }, { once: true });
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    },
  });

  await assert.rejects(
    fetcher.fetchAudio({ url: "https://cdn.example.test/stalled-body.mp3" }),
    (error: unknown) => {
      const candidate = error as { code?: string; name?: string } | null;
      return candidate?.code === "META_AUDIO_TIMEOUT" || candidate?.name === "AbortError";
    },
  );
});
