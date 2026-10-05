import type { MetaFetchedImage } from "./metaMediaFetcher.js";
import type { MediaVisionObservation } from "./ai/openAiMediaVisionProvider.js";
import type {
  MediaCatalogCandidate,
  TrustedMediaCatalogAlternative,
  TrustedMediaCatalogMatch,
} from "./mediaCatalogMatcher.js";

export type MetaFetchedVideo = {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export type MetaVideoUnderstandingResult = {
  observation: MediaVisionObservation;
  videoSha256: string;
  frameCount: number;
  exactMatch: TrustedMediaCatalogMatch | null;
  alternatives: TrustedMediaCatalogAlternative[];
};

type Dependencies = {
  fetchVideo: (url: string) => Promise<MetaFetchedVideo | null>;
  extractFrames: (video: MetaFetchedVideo) => Promise<MetaFetchedImage[]>;
  analyzeFrame: (input: {
    merchantId: string;
    image: MetaFetchedImage;
  }) => Promise<MediaVisionObservation | null>;
  resolveCandidates?: (input: {
    merchantId: string;
    observation: MediaVisionObservation;
  }) => Promise<MediaCatalogCandidate[]>;
  matchCatalog?: (input: {
    merchantId: string;
    candidates: MediaCatalogCandidate[];
  }) => Promise<TrustedMediaCatalogMatch | null>;
  resolveAlternatives?: (input: {
    merchantId: string;
    candidates: MediaCatalogCandidate[];
  }) => Promise<TrustedMediaCatalogAlternative[]>;
};

function unique(values: string[], max: number): string[] {
  return [...new Set(values.map((x) => x.trim()).filter(Boolean))].slice(0, max);
}

function validCandidate(value: MediaCatalogCandidate): boolean {
  return Boolean(
    value &&
    typeof value.productId === "string" &&
    value.productId.trim() &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1,
  );
}

export class MetaVideoUnderstandingService {
  constructor(private readonly dependencies: Dependencies) {}

  async understand(input: {
    merchantId: string;
    videoUrl: string;
  }): Promise<MetaVideoUnderstandingResult | null> {
    const merchantId = String(input?.merchantId || "").trim().slice(0, 160);
    const videoUrl = String(input?.videoUrl || "").trim().slice(0, 4096);
    if (!merchantId || !videoUrl) return null;

    try {
      const video = await this.dependencies.fetchVideo(videoUrl);
      if (!video || !/^[a-f0-9]{64}$/i.test(video.sha256)) return null;
      const frames = await this.dependencies.extractFrames(video);
      if (!Array.isArray(frames) || frames.length < 1 || frames.length > 6) return null;

      const observations: MediaVisionObservation[] = [];
      for (const image of frames) {
        const observation = await this.dependencies.analyzeFrame({ merchantId, image });
        if (!observation || observation.confidence < 0.5) return null;
        observations.push(observation);
      }

      const productTypes = unique(
        observations.map((x) => x.productType || "").filter(Boolean),
        3,
      );
      if (productTypes.length > 1) return null;

      const providerIds = unique(observations.map((x) => x.providerId), 3);
      const models = unique(observations.map((x) => x.model), 3);
      if (providerIds.length !== 1 || models.length !== 1) return null;

      const confidence = Math.min(...observations.map((x) => x.confidence));
      const observation: MediaVisionObservation = {
        description: unique(observations.map((x) => x.description), 6).join("; ").slice(0, 1000),
        visibleText: unique(observations.flatMap((x) => x.visibleText), 20),
        productType: productTypes[0] || null,
        colors: unique(observations.flatMap((x) => x.colors), 12),
        attributes: unique(observations.flatMap((x) => x.attributes), 20),
        confidence,
        providerId: observations[0].providerId,
        model: observations[0].model,
      };

      let exactMatch: TrustedMediaCatalogMatch | null = null;
      let alternatives: TrustedMediaCatalogAlternative[] = [];

      if (this.dependencies.resolveCandidates) {
        const candidates = await this.dependencies.resolveCandidates({
          merchantId,
          observation,
        });
        const safeCandidates = Array.isArray(candidates)
          ? candidates.filter(validCandidate).slice(0, 12)
          : [];

        if (safeCandidates.length > 0 && this.dependencies.matchCatalog) {
          exactMatch = await this.dependencies.matchCatalog({
            merchantId,
            candidates: safeCandidates,
          });
        }

        if (
          !exactMatch &&
          safeCandidates.length > 0 &&
          this.dependencies.resolveAlternatives
        ) {
          const resolved = await this.dependencies.resolveAlternatives({
            merchantId,
            candidates: safeCandidates,
          });
          alternatives = Array.isArray(resolved) ? resolved.slice(0, 3) : [];
        }
      }

      return {
        videoSha256: video.sha256,
        frameCount: frames.length,
        observation,
        exactMatch,
        alternatives,
      };
    } catch {
      return null;
    }
  }
}
