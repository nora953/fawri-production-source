import {
  MetaAudioUnderstandingService,
  type MetaAudioUnderstandingDependencies,
  type MetaAudioUnderstandingResult,
} from "./metaAudioUnderstandingService.js";
import { SecureMetaAudioFetcher } from "./metaAudioFetcher.js";
import { OpenAiMetaAudioTranscriptionProvider } from "./ai/openAiMetaAudioTranscriptionProvider.js";

export interface MetaAudioUnderstandingRuntimeService {
  understand(input: {
    merchantId: string;
    audioUrl: string;
  }): Promise<MetaAudioUnderstandingResult | null>;
}

let configuredService: MetaAudioUnderstandingRuntimeService | null = null;

export function createMetaAudioUnderstandingService(
  dependencies: MetaAudioUnderstandingDependencies,
): MetaAudioUnderstandingRuntimeService {
  return new MetaAudioUnderstandingService(dependencies);
}

export function createOpenAiMetaAudioUnderstandingService(options: {
  apiKey?: string;
  model?: string;
} = {}): MetaAudioUnderstandingRuntimeService {
  const apiKey = String(options.apiKey ?? "").trim();
  const model = String(options.model ?? "").trim();
  if (!apiKey || !model) {
    throw Object.assign(new Error("Meta audio provider configuration is invalid"), {
      code: "META_AUDIO_PROVIDER_CONFIG_INVALID",
    });
  }
  const fetcher = new SecureMetaAudioFetcher();
  const provider = new OpenAiMetaAudioTranscriptionProvider({ apiKey, model });
  return createMetaAudioUnderstandingService({
    fetchAudio: (url) => fetcher.fetchAudio({ url }),
    transcribeAudio: (input) => provider.transcribe(input),
  });
}

export function configureMetaAudioUnderstandingService(
  service: MetaAudioUnderstandingRuntimeService,
): void {
  if (!service || typeof service.understand !== "function") {
    throw new Error("Meta audio understanding service is invalid");
  }
  if (configuredService) throw new Error("Meta audio understanding service is already configured");
  configuredService = service;
}

export function getMetaAudioUnderstandingService(): MetaAudioUnderstandingRuntimeService | null {
  return configuredService;
}

export function releaseMetaAudioUnderstandingService(
  service: MetaAudioUnderstandingRuntimeService,
): boolean {
  if (configuredService !== service) return false;
  configuredService = null;
  return true;
}

export function resetMetaAudioUnderstandingServiceForTests(): void {
  configuredService = null;
}
