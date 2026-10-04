import {
  MetaImageUnderstandingService,
  type MetaImageUnderstandingDependencies,
  type MetaImageUnderstandingResult,
} from "./metaImageUnderstandingService.js";
import {
  OpenAiMediaVisionProvider,
} from "./ai/openAiMediaVisionProvider.js";
import {
  OpenAiMediaCatalogRanker,
} from "./ai/openAiMediaCatalogRanker.js";
import {
  MediaCatalogCandidateResolver,
} from "./mediaCatalogCandidateResolver.js";
import {
  TrustedMediaCatalogMatcher,
} from "./mediaCatalogMatcher.js";
import {
  SecureMetaMediaFetcher,
} from "./metaMediaFetcher.js";

export interface MetaImageUnderstandingRuntimeService {
  understand(input: {
    merchantId: string;
    imageUrl: string;
  }): Promise<MetaImageUnderstandingResult | null>;
}

let configuredService: MetaImageUnderstandingRuntimeService | null = null;

export function createMetaImageUnderstandingService(
  dependencies: MetaImageUnderstandingDependencies,
): MetaImageUnderstandingRuntimeService {
  return new MetaImageUnderstandingService(dependencies);
}

export type OpenAiMetaImageUnderstandingOptions = {
  apiKey?: string;
  model?: string;
};

export function createOpenAiMetaImageUnderstandingService(
  options: OpenAiMetaImageUnderstandingOptions = {},
): MetaImageUnderstandingRuntimeService {
  const apiKey = String(options.apiKey ?? "").trim();
  const model = String(options.model ?? "").trim();

  if (!apiKey || !model) {
    throw Object.assign(
      new Error("Meta image provider configuration is invalid"),
      { code: "META_IMAGE_PROVIDER_CONFIG_INVALID" },
    );
  }

  const fetcher = new SecureMetaMediaFetcher();

  const vision = new OpenAiMediaVisionProvider({
    apiKey,
    model,
  });

  const ranker = new OpenAiMediaCatalogRanker({
    apiKey,
    model,
  });

  const resolver = new MediaCatalogCandidateResolver({
    rankCandidates: (input) => ranker.rank(input),
  });

  const matcher = new TrustedMediaCatalogMatcher();

  return createMetaImageUnderstandingService({
    fetchImage: (url) => fetcher.fetchImage({ url }),
    analyzeImage: (input) => vision.analyze(input),
    resolveCandidates: (input) => resolver.resolve(input),
    matchCatalog: (input) => matcher.resolve(input),
  });
}


export function configureMetaImageUnderstandingService(
  service: MetaImageUnderstandingRuntimeService,
): void {
  if (!service || typeof service.understand !== "function") {
    throw new Error("Meta image understanding service is invalid");
  }

  if (configuredService) {
    throw new Error("Meta image understanding service is already configured");
  }

  configuredService = service;
}

export function getMetaImageUnderstandingService():
  MetaImageUnderstandingRuntimeService | null {
  return configuredService;
}

export function releaseMetaImageUnderstandingService(
  service: MetaImageUnderstandingRuntimeService,
): boolean {
  if (configuredService !== service) {
    return false;
  }

  configuredService = null;
  return true;
}

export function resetMetaImageUnderstandingServiceForTests(): void {
  configuredService = null;
}
