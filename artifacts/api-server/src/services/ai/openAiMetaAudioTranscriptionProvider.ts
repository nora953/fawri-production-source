import { createHash } from "node:crypto";
import type { MetaFetchedAudio } from "../metaAudioFetcher.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TRANSCRIPT_CHARS = 4_000;

export type MetaAudioTranscript = {
  text: string;
  providerId: "openai_audio_transcription_v1";
  model: string;
};

type Options = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function validAudio(audio: MetaFetchedAudio): boolean {
  if (!Buffer.isBuffer(audio.buffer) || audio.buffer.length === 0) return false;
  if (!Number.isSafeInteger(audio.sizeBytes) || audio.sizeBytes !== audio.buffer.length) return false;
  return createHash("sha256").update(audio.buffer).digest("hex") === audio.sha256;
}

export class OpenAiMetaAudioTranscriptionProvider {
  readonly providerId = "openai_audio_transcription_v1" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: Options = {}) {
    this.apiKey = String(options.apiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
    this.model = String(
      options.model ?? process.env.FAWRI_OPENAI_AUDIO_MODEL ?? "",
    ).trim();
    this.endpoint = options.endpoint || "https://api.openai.com/v1/audio/transcriptions";
    this.timeoutMs = Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
      ? Math.min(Number(options.timeoutMs), 60_000) : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async transcribe(input: {
    merchantId: string;
    audio: MetaFetchedAudio;
  }): Promise<MetaAudioTranscript | null> {
    const merchantId = String(input?.merchantId ?? "").trim().slice(0, 160);
    if (!merchantId || !this.apiKey || !this.model || this.model.length > 160 || !validAudio(input.audio)) {
      return null;
    }

    const form = new FormData();
    form.set("model", this.model);
    form.set("response_format", "json");
    form.set(
      "file",
      new Blob([new Uint8Array(input.audio.buffer)], { type: input.audio.mimeType }),
      "customer-audio",
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
      const raw = (payload as Record<string, unknown>).text;
      if (typeof raw !== "string") return null;
      const text = raw.trim();
      if (!text || text.length > MAX_TRANSCRIPT_CHARS) return null;
      return { text, providerId: this.providerId, model: this.model };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
