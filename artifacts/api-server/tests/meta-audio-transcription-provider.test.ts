import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  OpenAiMetaAudioTranscriptionProvider,
} from "../src/services/ai/openAiMetaAudioTranscriptionProvider.js";

function audio() {
  const buffer = Buffer.from("ID3-audio-test");
  return {
    buffer,
    mimeType: "audio/mpeg",
    sizeBytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

test("transcription provider returns bounded transcript without storing audio", async () => {
  let request: RequestInit | undefined;
  const provider = new OpenAiMetaAudioTranscriptionProvider({
    apiKey: "test-key",
    model: "test-transcribe",
    fetchImpl: async (_url, init) => {
      request = init;
      return new Response(JSON.stringify({ text: "هل هذا المنتج متوفر؟" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await provider.transcribe({
    merchantId: "merchant-a",
    audio: audio(),
  });

  assert.equal(result?.text, "هل هذا المنتج متوفر؟");
  assert.equal(result?.providerId, "openai_audio_transcription_v1");
  assert.equal(result?.model, "test-transcribe");
  assert.equal(request?.method, "POST");
  assert.ok(request?.body instanceof FormData);
  const form = request?.body as FormData;
  assert.equal(form.get("model"), "test-transcribe");
  assert.equal(form.get("response_format"), "json");
  const file = form.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.name, "customer-audio.mp3");
  assert.equal(file.type, "audio/mpeg");
});

test("transcription provider fails closed for tampered audio bytes", async () => {
  let calls = 0;
  const provider = new OpenAiMetaAudioTranscriptionProvider({
    apiKey: "test-key",
    model: "test-transcribe",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not execute");
    },
  });
  const input = audio();
  input.sha256 = "0".repeat(64);

  assert.equal(
    await provider.transcribe({ merchantId: "merchant-a", audio: input }),
    null,
  );
  assert.equal(calls, 0);
});

test("transcription provider fails closed on empty or oversized transcript", async () => {
  for (const text of ["   ", "x".repeat(4001)]) {
    const provider = new OpenAiMetaAudioTranscriptionProvider({
      apiKey: "test-key",
      model: "test-transcribe",
      fetchImpl: async () =>
        new Response(JSON.stringify({ text }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    assert.equal(
      await provider.transcribe({ merchantId: "merchant-a", audio: audio() }),
      null,
    );
  }
});
