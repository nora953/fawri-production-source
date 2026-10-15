import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { OpenAiMediaVisionProvider } from "../src/services/ai/openAiMediaVisionProvider.js";

test("vision provider sends verified image bytes and returns only bounded observations", async () => {
  let requestBody: Record<string, any> | null = null;

  const provider = new OpenAiMediaVisionProvider({
    apiKey: "test-key",
    model: "vision-test-model",
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body || "{}"));

      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    description: "Black short-sleeve shirt with a small white chest logo",
                    visible_text: ["FAWRI"],
                    product_type: "shirt",
                    colors: ["black", "white"],
                    attributes: ["short sleeve"],
                    confidence: 0.96,
                  }),
                },
              ],
            },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 30,
            total_tokens: 130,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch,
  });

  const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  const result = await provider.analyze({
    merchantId: "merchant-a",
    image: {
      buffer: imageBuffer,
      mimeType: "image/jpeg",
      sizeBytes: imageBuffer.length,
      sha256: crypto.createHash("sha256").update(imageBuffer).digest("hex"),
    },
  });

  assert.ok(requestBody);
  assert.equal(requestBody!.model, "vision-test-model");
  assert.equal(requestBody!.store, false);

  const serialized = JSON.stringify(requestBody);
  assert.match(serialized, /data:image\/jpeg;base64,/);
  assert.doesNotMatch(serialized, /https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)/i);

  assert.deepEqual(result, {
    description: "Black short-sleeve shirt with a small white chest logo",
    visibleText: ["FAWRI"],
    productType: "shirt",
    colors: ["black", "white"],
    attributes: ["short sleeve"],
    confidence: 0.96,
    providerId: "openai_responses_media_vision_v1",
    model: "vision-test-model",
  });
});

function verifiedJpeg() {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  return {
    buffer,
    mimeType: "image/jpeg" as const,
    sizeBytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

test("vision provider fails closed before transport for invalid image integrity", async () => {
  let calls = 0;
  const provider = new OpenAiMediaVisionProvider({
    apiKey: "test-key",
    model: "vision-test-model",
    fetchImpl: (async () => {
      calls += 1;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  const image = verifiedJpeg();
  const result = await provider.analyze({
    merchantId: "merchant-a",
    image: { ...image, sha256: "wrong-sha" },
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("vision provider rejects unsupported MIME before transport", async () => {
  let calls = 0;
  const provider = new OpenAiMediaVisionProvider({
    apiKey: "test-key",
    model: "vision-test-model",
    fetchImpl: (async () => {
      calls += 1;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  const image = verifiedJpeg();
  const result = await provider.analyze({
    merchantId: "merchant-a",
    image: {
      ...image,
      mimeType: "image/gif" as any,
    },
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("vision provider fails closed when credentials are missing", async () => {
  let calls = 0;
  const provider = new OpenAiMediaVisionProvider({
    apiKey: "",
    model: "vision-test-model",
    fetchImpl: (async () => {
      calls += 1;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  const result = await provider.analyze({
    merchantId: "merchant-a",
    image: verifiedJpeg(),
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("vision provider fails closed on malformed provider JSON", async () => {
  const provider = new OpenAiMediaVisionProvider({
    apiKey: "test-key",
    model: "vision-test-model",
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: "{not-json",
                },
              ],
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch,
  });

  const result = await provider.analyze({
    merchantId: "merchant-a",
    image: verifiedJpeg(),
  });

  assert.equal(result, null);
});

test("vision provider clamps invalid confidence to fail-safe zero", async () => {
  const provider = new OpenAiMediaVisionProvider({
    apiKey: "test-key",
    model: "vision-test-model",
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    description: "Visible shirt",
                    visible_text: [],
                    product_type: "shirt",
                    colors: ["black"],
                    attributes: [],
                    confidence: 99,
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch,
  });

  const result = await provider.analyze({
    merchantId: "merchant-a",
    image: verifiedJpeg(),
  });

  assert.ok(result);
  assert.equal(result.confidence, 0);
});

test("vision provider fails closed when transport aborts or times out", async () => {
  const provider = new OpenAiMediaVisionProvider({
    apiKey: "test-key",
    model: "vision-test-model",
    timeoutMs: 10,
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
      throw new Error("unreachable");
    }) as typeof fetch,
  });

  const result = await provider.analyze({
    merchantId: "merchant-a",
    image: verifiedJpeg(),
  });

  assert.equal(result, null);
});
