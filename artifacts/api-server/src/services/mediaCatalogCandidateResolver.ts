import type {
  CatalogProduct,
  CatalogVariant,
} from "./catalogInventoryRuntime.js";
import type { MediaCatalogCandidate } from "./mediaCatalogMatcher.js";
import type { MediaVisionObservation } from "./ai/openAiMediaVisionProvider.js";
import { listCatalogProductsAuthoritative } from "./postgresCatalogAuthorityCore.js";

type RankCandidatesInput = {
  prompt: string;
};

type RankCandidates = (
  input: RankCandidatesInput,
) => Promise<MediaCatalogCandidate[]>;

type MediaCatalogCandidateResolverDependencies = {
  listCatalogProducts?: (merchantId: string) => Promise<CatalogProduct[]>;
  rankCandidates: RankCandidates;
};

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validConfidence(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1
    ? number
    : null;
}

function eligibleProduct(
  product: CatalogProduct,
  merchantId: string,
): boolean {
  return (
    text(product.merchant_id, 160) === merchantId &&
    product.allow_fawri_reply === true &&
    ["available", "low_stock", "out_of_stock"].includes(
      text(product.status, 40),
    ) &&
    Number.isInteger(Number(product.version)) &&
    Number(product.version) > 0
  );
}

function safeVariant(variant: CatalogVariant) {
  return {
    id: text(variant.id, 160),
    name: text(variant.name, 240),
    options: Object.fromEntries(
      Object.entries(variant.options || {})
        .slice(0, 30)
        .map(([key, value]) => [
          text(key, 120),
          text(value, 160),
        ])
        .filter(([key, value]) => key && value),
    ),
    imageAlt: (variant.image_refs || [])
      .map((image) => text(image.alt, 240))
      .filter(Boolean)
      .slice(0, 5),
  };
}

function safeProduct(product: CatalogProduct) {
  return {
    id: text(product.id, 160),
    name: text(product.name, 240),
    description: text(product.description, 800),
    category: text(product.category, 160),
    imageAlt: (product.image_refs || [])
      .map((image) => text(image.alt, 240))
      .filter(Boolean)
      .slice(0, 20),
    variants: (product.variants || []).slice(0, 100).map(safeVariant),
  };
}

function buildPrompt(
  observation: MediaVisionObservation,
  products: CatalogProduct[],
): string {
  const envelope = {
    visualObservation: {
      description: text(observation.description, 1000),
      visibleText: observation.visibleText
        .map((value) => text(value, 160))
        .filter(Boolean)
        .slice(0, 20),
      productType: text(observation.productType, 160) || null,
      colors: observation.colors
        .map((value) => text(value, 80))
        .filter(Boolean)
        .slice(0, 12),
      attributes: observation.attributes
        .map((value) => text(value, 160))
        .filter(Boolean)
        .slice(0, 20),
      confidence: validConfidence(observation.confidence) ?? 0,
    },
    catalogCandidates: products.map(safeProduct),
  };

  return [
    "Match the visual observation only against the supplied merchant catalog.",
    "Catalog IDs are candidate identifiers, not evidence by themselves.",
    "Do not infer price, stock, SKU, barcode, ownership, or facts not supplied.",
    "If evidence is weak or ambiguous, return no candidate.",
    JSON.stringify(envelope),
  ].join("\n");
}

export class MediaCatalogCandidateResolver {
  private readonly listCatalogProducts: (
    merchantId: string,
  ) => Promise<CatalogProduct[]>;

  private readonly rankCandidates: RankCandidates;

  constructor(dependencies: MediaCatalogCandidateResolverDependencies) {
    this.listCatalogProducts =
      dependencies.listCatalogProducts || listCatalogProductsAuthoritative;
    this.rankCandidates = dependencies.rankCandidates;
  }

  async resolve(input: {
    merchantId: string;
    observation: MediaVisionObservation;
  }): Promise<MediaCatalogCandidate[]> {
    const merchantId = text(input.merchantId, 160);
    if (!merchantId || !input.observation) return [];

    const products = (await this.listCatalogProducts(merchantId)).filter(
      (product) => eligibleProduct(product, merchantId),
    );

    if (products.length === 0) return [];

    const ranked = await this.rankCandidates({
      prompt: buildPrompt(input.observation, products),
    }).catch(() => []);

    if (!Array.isArray(ranked)) return [];

    const productById = new Map(
      products.map((product) => [text(product.id, 160), product]),
    );

    const validated: MediaCatalogCandidate[] = [];

    for (const candidate of ranked.slice(0, 20)) {
      const productId = text(candidate?.productId, 160);
      const variantId = text(candidate?.variantId, 160);
      const confidence = validConfidence(candidate?.confidence);

      if (!productId || confidence === null) continue;

      const product = productById.get(productId);
      if (!product) continue;

      if (variantId) {
        const variantExists = product.variants.some(
          (variant) => text(variant.id, 160) === variantId,
        );
        if (!variantExists) continue;
      }

      validated.push({
        productId,
        ...(variantId ? { variantId } : {}),
        confidence,
      });
    }

    return validated;
  }
}
