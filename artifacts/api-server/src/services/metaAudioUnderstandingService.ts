import type { MetaFetchedAudio } from "./metaAudioFetcher.js";
import type { MetaAudioTranscript } from "./ai/openAiMetaAudioTranscriptionProvider.js";

export type MetaAudioUnderstandingResult = {
  transcript: string;
  audioSha256: string;
  transcriptionProviderId: string;
  transcriptionModel: string;
};

export type MetaAudioUnderstandingDependencies = {
  fetchAudio: (url: string) => Promise<MetaFetchedAudio | null>;
  transcribeAudio: (input: {
    merchantId: string;
    audio: MetaFetchedAudio;
  }) => Promise<MetaAudioTranscript | null>;
};

export class MetaAudioUnderstandingService {
  constructor(private readonly dependencies: MetaAudioUnderstandingDependencies) {}

  async understand(input: {
    merchantId: string;
    audioUrl: string;
  }): Promise<MetaAudioUnderstandingResult | null> {
    const merchantId = String(input?.merchantId ?? "").trim().slice(0, 160);
    const audioUrl = String(input?.audioUrl ?? "").trim().slice(0, 4096);
    if (!merchantId || !audioUrl) return null;
    try {
      const audio = await this.dependencies.fetchAudio(audioUrl);
      if (!audio || !audio.sha256) return null;
      const transcript = await this.dependencies.transcribeAudio({ merchantId, audio });
      if (!transcript) return null;
      const text = String(transcript.text ?? "").trim();
      const providerId = String(transcript.providerId ?? "").trim();
      const model = String(transcript.model ?? "").trim();
      if (!text || !providerId || !model) return null;
      return {
        transcript: text,
        audioSha256: audio.sha256,
        transcriptionProviderId: providerId,
        transcriptionModel: model,
      };
    } catch {
      return null;
    }
  }
}
