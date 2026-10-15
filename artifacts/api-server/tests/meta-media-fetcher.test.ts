// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  SecureMetaMediaFetcher,
  META_MEDIA_MAX_IMAGE_BYTES,
} from "../src/services/metaMediaFetcher.js";

const PUBLIC_TEST_DNS = async () => [
  {
    address: "93.184.216.34",
    family: 4,
  },
];

function createTestFetcher(options = {}) {
  return new SecureMetaMediaFetcher({
    resolveHost: PUBLIC_TEST_DNS,
    ...options,
  });
}

function stream(...chunks: Uint8Array[]) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test("secure Meta media fetcher streams a bounded HTTPS image", async () => {
  const expected = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]);

  const fetcher = createTestFetcher({
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://cdn.example.test/private-image");
      assert.equal(init?.redirect, "manual");

      return new Response(stream(expected), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(expected.byteLength),
        },
      });
    },
  });

  const result = await fetcher.fetchImage({
    url: "https://cdn.example.test/private-image",
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.deepEqual([...result.buffer], [...expected]);
  assert.equal(result.sizeBytes, expected.byteLength);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test("secure Meta media fetcher rejects non-HTTPS URLs before network access", async () => {
  let calls = 0;
  const fetcher = createTestFetcher({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "http://127.0.0.1/private-image",
    }),
    (error) => error?.code === "META_MEDIA_URL_INVALID",
  );

  assert.equal(calls, 0);
});

test("secure Meta media fetcher rejects redirects instead of following them", async () => {
  const fetcher = createTestFetcher({
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: {
          location: "https://other.example.test/image.jpg",
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_REDIRECT_REJECTED",
  );
});

test("secure Meta media fetcher rejects an oversized declared body", async () => {
  const fetcher = createTestFetcher({
    fetchImpl: async () =>
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(META_MEDIA_MAX_IMAGE_BYTES + 1),
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_TOO_LARGE",
  );
});

test("secure Meta media fetcher stops when streamed bytes exceed the limit", async () => {
  const oversized = new Uint8Array(META_MEDIA_MAX_IMAGE_BYTES + 1);

  const fetcher = createTestFetcher({
    fetchImpl: async () =>
      new Response(stream(oversized), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_TOO_LARGE",
  );
});

test("secure Meta media fetcher rejects non-image MIME", async () => {
  const fetcher = createTestFetcher({
    fetchImpl: async () =>
      new Response(stream(new Uint8Array([1, 2, 3])), {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_MIME_INVALID",
  );
});

test("secure Meta media fetcher aborts stalled requests", async () => {
  const fetcher = createTestFetcher({
    timeoutMs: 25,
    fetchImpl: async (_url, init) =>
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_TIMEOUT",
  );
});

test("secure Meta media fetcher errors never expose the private media URL", async () => {
  const privateUrl =
    "https://cdn.example.test/private.jpg?token=super-secret-value";

  const fetcher = createTestFetcher({
    fetchImpl: async () => {
      throw new Error(`network failed for ${privateUrl}`);
    },
  });

  await assert.rejects(fetcher.fetchImage({ url: privateUrl }), (error) => {
    assert.equal(error?.code, "META_MEDIA_FETCH_FAILED");
    assert.doesNotMatch(String(error?.message), /super-secret-value/);
    assert.doesNotMatch(String(error?.message), /private\.jpg/);
    return true;
  });
});

test("secure Meta media fetcher rejects bytes that do not match the declared image MIME", async () => {
  const fakeJpeg = new TextEncoder().encode(
    "<html><body>not an image</body></html>",
  );

  const fetcher = createTestFetcher({
    fetchImpl: async () =>
      new Response(stream(fakeJpeg), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(fakeJpeg.byteLength),
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/fake-image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_CONTENT_INVALID",
  );
});

test("secure Meta media fetcher rejects an empty image body", async () => {
  const fetcher = createTestFetcher({
    fetchImpl: async () =>
      new Response(stream(), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "0",
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/empty.jpg",
    }),
    (error) => error?.code === "META_MEDIA_CONTENT_INVALID",
  );
});

test("secure Meta media fetcher rejects literal private and loopback IP destinations", async () => {
  let calls = 0;
  const fetcher = new SecureMetaMediaFetcher({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  for (const url of [
    "https://127.0.0.1/image.jpg",
    "https://10.0.0.1/image.jpg",
    "https://172.16.0.1/image.jpg",
    "https://192.168.1.1/image.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/image.jpg",
  ]) {
    await assert.rejects(
      fetcher.fetchImage({ url }),
      (error) => error?.code === "META_MEDIA_DESTINATION_FORBIDDEN",
    );
  }

  assert.equal(calls, 0);
});

test("secure Meta media fetcher rejects a hostname resolving to a private address", async () => {
  let calls = 0;

  const fetcher = new SecureMetaMediaFetcher({
    resolveHost: async (hostname) => {
      assert.equal(hostname, "cdn.example.test");
      return [
        {
          address: "10.20.30.40",
          family: 4,
        },
      ];
    },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_DESTINATION_FORBIDDEN",
  );

  assert.equal(calls, 0);
});

test("secure Meta media fetcher rejects mixed public and private DNS answers", async () => {
  let calls = 0;

  const fetcher = new SecureMetaMediaFetcher({
    resolveHost: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_DESTINATION_FORBIDDEN",
  );

  assert.equal(calls, 0);
});

test("secure Meta media fetcher allows a DNS destination only when every resolved address is public", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]);
  let calls = 0;

  const fetcher = new SecureMetaMediaFetcher({
    resolveHost: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ],
    fetchImpl: async () => {
      calls += 1;
      return new Response(stream(jpeg), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(jpeg.byteLength),
        },
      });
    },
  });

  const result = await fetcher.fetchImage({
    url: "https://cdn.example.test/image.jpg",
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(calls, 1);
});

test("secure Meta media fetcher fails closed when DNS resolution is unavailable", async () => {
  let calls = 0;

  const fetcher = new SecureMetaMediaFetcher({
    resolveHost: async () => {
      throw new Error("dns unavailable");
    },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_DESTINATION_UNVERIFIED",
  );

  assert.equal(calls, 0);
});

test("secure Meta media fetcher keeps the timeout active while streaming the response body", async () => {
  const fetcher = createTestFetcher({
    timeoutMs: 25,
    fetchImpl: async (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]));

          init?.signal?.addEventListener(
            "abort",
            () => controller.error(new Error("aborted")),
            { once: true },
          );
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
        },
      });
    },
  });

  await assert.rejects(
    Promise.race([
      fetcher.fetchImage({
        url: "https://cdn.example.test/stalled-body.jpg",
      }),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              Object.assign(
                new Error("body stream escaped the media timeout"),
                { code: "TEST_BODY_TIMEOUT_ESCAPED" },
              ),
            ),
          250,
        ),
      ),
    ]),
    (error) => error?.code === "META_MEDIA_TIMEOUT",
  );
});

test("secure Meta media fetcher clears the request timeout after an early redirect rejection", async () => {
  let capturedSignal: AbortSignal | undefined;

  const fetcher = createTestFetcher({
    timeoutMs: 25,
    fetchImpl: async (_url, init) => {
      capturedSignal = init?.signal || undefined;

      return new Response(null, {
        status: 302,
        headers: {
          location: "https://cdn.example.test/other.jpg",
        },
      });
    },
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/redirect.jpg",
    }),
    (error) => error?.code === "META_MEDIA_REDIRECT_REJECTED",
  );

  assert.ok(capturedSignal);
  assert.equal(capturedSignal.aborted, false);

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(
    capturedSignal.aborted,
    false,
    "request timeout remained armed after the fetcher had already returned",
  );
});

test("secure Meta media fetcher pins transport to the DNS address that passed validation", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]);
  const verifiedAddress = "93.184.216.34";
  let transportCall;

  const fetcher = new SecureMetaMediaFetcher({
    resolveHost: async (hostname) => {
      assert.equal(hostname, "cdn.example.test");
      return [{ address: verifiedAddress, family: 4 }];
    },
    transportImpl: async (request) => {
      transportCall = request;

      return new Response(stream(jpeg), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(jpeg.byteLength),
        },
      });
    },
    fetchImpl: async () => {
      throw Object.assign(
        new Error("hostname-based fetch must not be used after DNS validation"),
        { code: "TEST_UNPINNED_TRANSPORT_USED" },
      );
    },
  });

  const result = await fetcher.fetchImage({
    url: "https://cdn.example.test/private-image",
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(transportCall);
  assert.equal(transportCall.url, "https://cdn.example.test/private-image");
  assert.equal(transportCall.hostname, "cdn.example.test");
  assert.equal(transportCall.address, verifiedAddress);
  assert.equal(transportCall.family, 4);
});

test("secure Meta media fetcher passes a normalized literal IPv6 hostname to pinned transport", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]);
  const address = "2606:2800:220:1:248:1893:25c8:1946";
  let transportCall;

  const fetcher = new SecureMetaMediaFetcher({
    transportImpl: async (request) => {
      transportCall = request;

      return new Response(stream(jpeg), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(jpeg.byteLength),
        },
      });
    },
  });

  const result = await fetcher.fetchImage({
    url: `https://[${address}]/image.jpg`,
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(transportCall);
  assert.equal(transportCall.hostname, address);
  assert.equal(transportCall.address, address);
  assert.equal(transportCall.family, 6);
});

test("secure Meta media fetcher rejects non-public IPv6 edge-case destinations", async () => {
  let calls = 0;

  const fetcher = new SecureMetaMediaFetcher({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });

  for (const url of [
    "https://[::ffff:7f00:1]/image.jpg",
    "https://[::ffff:a00:1]/image.jpg",
    "https://[ff02::1]/image.jpg",
    "https://[fec0::1]/image.jpg",
  ]) {
    await assert.rejects(
      fetcher.fetchImage({ url }),
      (error) => error?.code === "META_MEDIA_DESTINATION_FORBIDDEN",
      `expected destination to be rejected: ${url}`,
    );
  }

  assert.equal(calls, 0);
});

test("secure Meta media fetcher rejects DNS answers containing non-public IPv6 edge cases", async () => {
  const forbiddenAddresses = [
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "ff02::1",
    "fec0::1",
  ];

  for (const address of forbiddenAddresses) {
    let calls = 0;

    const fetcher = new SecureMetaMediaFetcher({
      resolveHost: async () => [
        { address: "93.184.216.34", family: 4 },
        { address, family: 6 },
      ],
      fetchImpl: async () => {
        calls += 1;
        throw new Error("must not execute");
      },
    });

    await assert.rejects(
      fetcher.fetchImage({
        url: "https://cdn.example.test/image.jpg",
      }),
      (error) => error?.code === "META_MEDIA_DESTINATION_FORBIDDEN",
      `expected DNS answer to be rejected: ${address}`,
    );

    assert.equal(calls, 0);
  }
});

test("secure Meta media fetcher cancels the response body when MIME validation rejects it", async () => {
  let cancelled = false;

  const body = new ReadableStream({
    pull() {
      // Keep the body open so cleanup is observable.
    },
    cancel() {
      cancelled = true;
    },
  });

  const fetcher = new SecureMetaMediaFetcher({
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async () =>
      new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/plain",
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_MIME_INVALID",
  );

  assert.equal(
    cancelled,
    true,
    "response body must be cancelled after MIME rejection",
  );
});

test("secure Meta media fetcher rejects DNS answers whose family does not match the address", async () => {
  let calls = 0;

  for (const resolved of [
    { address: "93.184.216.34", family: 6 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 4 },
    { address: "93.184.216.34", family: 0 },
  ]) {
    const fetcher = new SecureMetaMediaFetcher({
      resolveHost: async () => [resolved],
      transportImpl: async () => {
        calls += 1;
        throw new Error("must not execute");
      },
    });

    await assert.rejects(
      fetcher.fetchImage({
        url: "https://cdn.example.test/image.jpg",
      }),
      (error) => error?.code === "META_MEDIA_DESTINATION_UNVERIFIED",
      `expected mismatched DNS family to be rejected: ${JSON.stringify(resolved)}`,
    );
  }

  assert.equal(calls, 0);
});

test("secure Meta media fetcher timeout also covers DNS resolution", async () => {
  let transportCalls = 0;

  const fetcher = new SecureMetaMediaFetcher({
    timeoutMs: 20,
    resolveHost: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return [{ address: "93.184.216.34", family: 4 }];
    },
    transportImpl: async () => {
      transportCalls += 1;
      throw new Error("must not execute");
    },
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_TIMEOUT",
  );

  assert.equal(transportCalls, 0);
});

test("secure Meta media fetcher cancels the response body when Content-Length validation rejects it", async () => {
  let cancelled = false;

  const body = new ReadableStream({
    start() {},
    cancel() {
      cancelled = true;
    },
  });

  const fetcher = createTestFetcher({
    transportImpl: async () =>
      new Response(body, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "not-a-number",
        },
      }),
  });

  await assert.rejects(
    fetcher.fetchImage({
      url: "https://cdn.example.test/image.jpg",
    }),
    (error) => error?.code === "META_MEDIA_FETCH_FAILED",
  );

  assert.equal(cancelled, true);
});

test("secure Meta media fetcher rejects expanded IPv4-mapped private IPv6 DNS answers", async () => {
  let calls = 0;

  for (const address of [
    "0:0:0:0:0:ffff:7f00:1",
    "0000:0000:0000:0000:0000:ffff:7f00:0001",
    "0:0:0:0:0:ffff:a00:1",
    "0:0:0:0:0:ffff:c0a8:101",
  ]) {
    const fetcher = new SecureMetaMediaFetcher({
      resolveHost: async () => [{ address, family: 6 }],
      transportImpl: async () => {
        calls += 1;
        throw new Error("must not execute");
      },
    });

    await assert.rejects(
      fetcher.fetchImage({
        url: "https://cdn.example.test/image.jpg",
      }),
      (error) => error?.code === "META_MEDIA_DESTINATION_FORBIDDEN",
      `expected expanded IPv4-mapped private address to be rejected: ${address}`,
    );
  }

  assert.equal(calls, 0);
});
