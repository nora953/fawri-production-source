import type { MetaFetchedImage } from "./metaMediaFetcher.js";
import type {
  MediaVisionObservation,
} from "./ai/openAiMediaVisionProvider.js";
import type {
  MediaCatalogCandidate,
  TrustedMediaCatalogAlternative,
  TrustedMediaCatalogMatch,
} from "./mediaCatalogMatcher.js";

export type MetaImageUnderstandingResult = {
  matchedRecordId: string;
  productId: string;
  variantId?: string;
  confidence: number;
  imageSha256: string;
  visionProviderId: string;
  visionModel: string;
};

export type MetaImageUnderstandingWithAlternativesResult = {
  exactMatch: MetaImageUnderstandingResult | null;
  alternatives: TrustedMediaCatalogAlternative[];
  imageSha256: string;
  visionProviderId: string;
  visionModel: string;
};

export type MetaImageUnderstandingDependencies = {
  fetchImage: (url: string) => Promise<MetaFetchedImage | null>;

  analyzeImage: (input: {
    merchantId: string;
    image: MetaFetchedImage;
  }) => Promise<MediaVisionObservation | null>;

  resolveCandidates: (input: {
    merchantId: string;
    observation: MediaVisionObservation;
  }) => Promise<MediaCatalogCandidate[]>;

  matchCatalog: (input: {
    merchantId: string;
    candidates: MediaCatalogCandidate[];
  }) => Promise<TrustedMediaCatalogMatch | null>;

  resolveAlternatives?: (input: {
    merchantId: string;
    candidates: MediaCatalogCandidate[];
  }) => Promise<TrustedMediaCatalogAlternative[]>;
};

function safeText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

function validConfidence(value: unknown): number | null {
  const number = Number(value);

  return Number.isFinite(number) &&
    number >= 0 &&
    number <= 1
    ? number
    : null;
}

export class MetaImageUnderstandingService {
  private readonly dependencies: MetaImageUnderstandingDependencies;

  constructor(dependencies: MetaImageUnderstandingDependencies) {
    this.dependencies = dependencies;
  }

  async understandWithAlternatives(input: {
    merchantId: string;
    imageUrl: string;
  }): Promise<MetaImageUnderstandingWithAlternativesResult | null> {
    const merchantId = safeText(input?.merchantId, 160);
    const imageUrl = safeText(input?.imageUrl, 4096);

    if (!merchantId || !imageUrl) return null;

    try {
      const image = await this.dependencies.fetchImage(imageUrl);
      if (!image) return null;

      const imageSha256 = safeText(image.sha256, 128);
      if (!imageSha256) return null;

      const observation = await this.dependencies.analyzeImage({
        merchantId,
        image,
      });
      if (!observation) return null;

      const visionProviderId = safeText(observation.providerId, 160);
      const visionModel = safeText(observation.model, 160);
      if (!visionProviderId || !visionModel) return null;

      const candidates = await this.dependencies.resolveCandidates({
        merchantId,
        observation,
      });

      if (!Array.isArray(candidates) || candidates.length === 0) {
        return {
          exactMatch: null,
          alternatives: [],
          imageSha256,
          visionProviderId,
          visionModel,
        };
      }

      const match = await this.dependencies.matchCatalog({
        merchantId,
        candidates,
      });

      if (match) {
        const matchedRecordId = safeText(match.matchedRecordId, 500);
        const productId = safeText(match.productId, 160);
        const variantId = safeText(match.variantId, 160);
        const confidence = validConfidence(match.confidence);

        if (
          !matchedRecordId ||
          !productId ||
          confidence === null
        ) {
          return null;
        }

        return {
          exactMatch: {
            matchedRecordId,
            productId,
            ...(variantId ? { variantId } : {}),
            confidence,
            imageSha256,
            visionProviderId,
            visionModel,
          },
          alternatives: [],
          imageSha256,
          visionProviderId,
          visionModel,
        };
      }

      const alternatives = this.dependencies.resolveAlternatives
        ? await this.dependencies.resolveAlternatives({
            merchantId,
            candidates,
          })
        : [];

      const trustedAlternatives = [];

      if (Array.isArray(alternatives)) {
        let alternativesValid = true;

        for (const alternative of alternatives) {
          if (
            !alternative ||
            typeof alternative !== "object" ||
            Array.isArray(alternative)
          ) {
            alternativesValid = false;
            break;
          }

          const productId = safeText(alternative.productId, 160);
          const variantId = safeText(alternative.variantId, 160);
          const confidence = validConfidence(alternative.confidence);

          if (!productId || confidence === null) {
            alternativesValid = false;
            break;
          }

          trustedAlternatives.push({
            productId,
            ...(variantId ? { variantId } : {}),
            confidence,
          });
        }

        if (!alternativesValid) {
          trustedAlternatives.length = 0;
        }
      }

      return {
        exactMatch: null,
        alternatives: trustedAlternatives,
        imageSha256,
        visionProviderId,
        visionModel,
      };
    } catch {
      return null;
    }
  }

  async understand(input: {
    merchantId: string;
    imageUrl: string;
  }): Promise<MetaImageUnderstandingResult | null> {
    const merchantId = safeText(input?.merchantId, 160);
    const imageUrl = safeText(input?.imageUrl, 4096);

    if (!merchantId || !imageUrl) return null;

    try {
      const image =
        await this.dependencies.fetchImage(imageUrl);

      if (!image) return null;

      const imageSha256 = safeText(image.sha256, 128);
      if (!imageSha256) return null;

      const observation =
        await this.dependencies.analyzeImage({
          merchantId,
          image,
        });

      if (!observation) return null;

      const candidates =
        await this.dependencies.resolveCandidates({
          merchantId,
          observation,
        });

      if (
        !Array.isArray(candidates) ||
        candidates.length === 0
      ) {
        return null;
      }

      const match =
        await this.dependencies.matchCatalog({
          merchantId,
          candidates,
        });

      if (!match) return null;

      const matchedRecordId =
        safeText(match.matchedRecordId, 500);
      const productId = safeText(match.productId, 160);
      const variantId = safeText(match.variantId, 160);
      const confidence = validConfidence(match.confidence);

      const visionProviderId =
        safeText(observation.providerId, 160);
      const visionModel =
        safeText(observation.model, 160);

      if (
        !matchedRecordId ||
        !productId ||
        confidence === null ||
        !visionProviderId ||
        !visionModel
      ) {
        return null;
      }

      return {
        matchedRecordId,
        productId,
        ...(variantId ? { variantId } : {}),
        confidence,
        imageSha256,
        visionProviderId,
        visionModel,
      };
    } catch {
      return null;
    }
  }
}
