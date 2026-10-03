import type { CatalogProduct } from "./catalogInventoryRuntime.js";
import { listCatalogProductsAuthoritative } from "./postgresCatalogAuthorityCore.js";

export type MediaCatalogCandidate = {
  productId: string;
  variantId?: string;
  confidence: number;
};

export type TrustedMediaCatalogMatch = {
  matchedRecordId: string;
  productId: string;
  variantId?: string;
  confidence: number;
};

type MediaCatalogMatcherDependencies = {
  listCatalogProducts?: (merchantId: string) => Promise<CatalogProduct[]>;
};

const MIN_CONFIDENCE = 0.9;
const MIN_AMBIGUITY_GAP = 0.05;

function text(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function confidence(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function eligibleProduct(
  product: CatalogProduct,
  merchantId: string,
): boolean {
  return (
    text(product.merchant_id) === merchantId &&
    product.allow_fawri_reply === true &&
    ["available", "low_stock", "out_of_stock"].includes(
      text(product.status, 40),
    ) &&
    Number.isInteger(Number(product.version)) &&
    Number(product.version) > 0
  );
}

export class TrustedMediaCatalogMatcher {
  private readonly listCatalogProducts: (
    merchantId: string,
  ) => Promise<CatalogProduct[]>;

  constructor(dependencies: MediaCatalogMatcherDependencies = {}) {
    this.listCatalogProducts =
      dependencies.listCatalogProducts || listCatalogProductsAuthoritative;
  }

  async resolve(input: {
    merchantId: string;
    candidates: MediaCatalogCandidate[];
  }): Promise<TrustedMediaCatalogMatch | null> {
    const merchantId = text(input.merchantId);
    if (!merchantId || !Array.isArray(input.candidates)) return null;

    const products = await this.listCatalogProducts(merchantId);
    const eligibleProducts = products.filter((product) =>
      eligibleProduct(product, merchantId),
    );

    const validated = input.candidates
      .map((candidate) => {
        const productId = text(candidate?.productId);
        const variantId = text(candidate?.variantId);
        const score = confidence(candidate?.confidence);

        if (
          !productId ||
          score < MIN_CONFIDENCE ||
          score > 1
        ) {
          return null;
        }

        const product = eligibleProducts.find(
          (item) => text(item.id) === productId,
        );
        if (!product) return null;

        if (variantId) {
          const variant = product.variants.find(
            (item) => text(item.id) === variantId,
          );
          if (!variant) return null;

          return {
            matchedRecordId:
              `catalog-variant:${productId}:${variantId}`,
            productId,
            variantId,
            confidence: score,
          };
        }

        return {
          matchedRecordId: `catalog-product:${productId}`,
          productId,
          confidence: score,
        };
      })
      .filter(
        (value): value is TrustedMediaCatalogMatch => value !== null,
      )
      .sort((a, b) => b.confidence - a.confidence);

    if (validated.length === 0) return null;

    const best = validated[0];
    const second = validated[1];

    if (
      second &&
      best.matchedRecordId !== second.matchedRecordId &&
      best.confidence - second.confidence < MIN_AMBIGUITY_GAP
    ) {
      return null;
    }

    return best;
  }
}
