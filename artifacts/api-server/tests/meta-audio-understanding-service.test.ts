import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { MetaAudioUnderstandingService } from "../src/services/metaAudioUnderstandingService.js";

function fetched() {
  const buffer = Buffer.from("ID3-audio");
  return {
    buffer,
    mimeType: "audio/mpeg",
    sizeBytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

test("audio understanding returns transcript provenance and audio hash", async () => {
  const audio = fetched();
  const service = new MetaAudioUnderstandingService({
    fetchAudio: async () => audio,
    transcribeAudio: async () => ({
      text: "أريد ثلاثة من هذا المنتج",
      providerId: "openai_audio_transcription_v1",
      model: "transcribe-model",
    }),
  });

  assert.deepEqual(
    await service.understand({
      merchantId: "merchant-a",
      audioUrl: "https://cdn.example.test/audio.mp3",
    }),
    {
      transcript: "أريد ثلاثة من هذا المنتج",
      audioSha256: audio.sha256,
      transcriptionProviderId: "openai_audio_transcription_v1",
      transcriptionModel: "transcribe-model",
    },
  );
});

test("audio understanding fails closed when fetch or transcription fails", async () => {
  const noFetch = new MetaAudioUnderstandingService({
    fetchAudio: async () => null,
    transcribeAudio: async () => {
      throw new Error("must not execute");
    },
  });
  assert.equal(
    await noFetch.understand({ merchantId: "m", audioUrl: "https://x.test/a" }),
    null,
  );

  const noTranscript = new MetaAudioUnderstandingService({
    fetchAudio: async () => fetched(),
    transcribeAudio: async () => null,
  });
  assert.equal(
    await noTranscript.understand({ merchantId: "m", audioUrl: "https://x.test/a" }),
    null,
  );
});
