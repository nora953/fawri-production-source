import {
  listCatalogProducts,
  resolveProductPhysicalMeasurements,
  type CatalogImageReference,
  type CatalogPhysicalMeasurementsResolution,
  type CatalogProduct,
  type CatalogProductStatus,
} from "./catalogInventoryRuntime";

export type BotCatalogAvailability = "available" | "unavailable";

export type BotCatalogVariant = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price_iqd?: number;
  current_price: number;
  is_available: boolean;
  availability: BotCatalogAvailability;
  /**
   * Compatibility flag for the legacy deterministic bot router.
   * This is intentionally 0/1 and MUST NOT contain the merchant's stock count.
   */
  quantity: 0 | 1;
  weight_g?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  physical_measurements: CatalogPhysicalMeasurementsResolution;
  options: Record<string, string>;
  image_refs: CatalogImageReference[];
};

export type BotCatalogProduct = {
  id: string;
  merchant_id: string;
  external_ref?: string;
  code?: string;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  description?: string;
  price_iqd: number;
  compare_at_price_iqd?: number;
  original_price: number;
  current_price: number;
  is_available: boolean;
  availability: BotCatalogAvailability;
  /**
   * Compatibility flag for the legacy deterministic bot router.
   * This is intentionally 0/1 and MUST NOT contain the merchant's stock count.
   */
  quantity: 0 | 1;
  weight_g?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  physical_measurements: CatalogPhysicalMeasurementsResolution;
  status: CatalogProductStatus;
  allow_fawri_reply: true;
  image_refs: CatalogImageReference[];
  variants: BotCatalogVariant[];
  catalog_search_terms: string[];
  version: number;
};

export type CatalogFulfillmentResolution = {
  requested_quantity: number;
  is_available: boolean;
  can_fulfill_full_request: boolean;
  fulfillable_quantity: number;
  inventory_disclosure: "request_scoped";
};

export class BotCatalogAuthorityError extends Error {
  readonly code = "BOT_CATALOG_AUTHORITY_UNAVAILABLE";
  readonly status = 503;
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("server catalog authority is unavailable");
    this.name = "BotCatalogAuthorityError";
    this.cause = cause;
  }
}

function cloneImageReferences(
  references: CatalogImageReference[],
): CatalogImageReference[] {
  return references.map((reference) => ({ ...reference }));
}

function addSearchTerm(terms: Set<string>, value: unknown): void {
  const text = String(value ?? "").trim();
  if (text) terms.add(text);
}

function buildSearchTerms(product: CatalogProduct): string[] {
  const terms = new Set<string>();
  addSearchTerm(terms, product.external_ref);
  addSearchTerm(terms, product.sku);
  addSearchTerm(terms, product.barcode);

  for (const variant of product.variants) {
    addSearchTerm(terms, variant.id);
    addSearchTerm(terms, variant.name);
    addSearchTerm(terms, variant.sku);
    addSearchTerm(terms, variant.barcode);
    for (const [optionName, optionValue] of Object.entries(variant.options)) {
      addSearchTerm(terms, optionName);
      addSearchTerm(terms, optionValue);
      addSearchTerm(terms, `${optionName} ${optionValue}`);
    }
  }

  return [...terms];
}

function availableFlag(quantity: number): 0 | 1 {
  return quantity > 0 ? 1 : 0;
}

function productIsAvailable(product: CatalogProduct): boolean {
  return product.status !== "out_of_stock" && product.stock_quantity > 0;
}

export function isBotVisibleCatalogProduct(product: CatalogProduct): boolean {
  return (
    product.allow_fawri_reply === true &&
    product.status !== "draft" &&
    product.status !== "hidden_from_fawri"
  );
}

/**
 * Resolves only what may be disclosed for a customer's requested quantity.
 * It deliberately never returns the merchant's total stock count.
 *
 * Examples:
 * - stock 11, request 3 => fulfillable_quantity 3
 * - stock 2, request 3 => fulfillable_quantity 2
 */
export function resolveCatalogFulfillment(
  product: CatalogProduct,
  requestedQuantityValue: unknown,
  variantIdValue?: unknown,
): CatalogFulfillmentResolution {
  const requestedQuantity = Number(requestedQuantityValue);
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new TypeError("requested quantity must be a positive integer");
  }

  const variantId = String(variantIdValue ?? "").trim();
  const variant = variantId
    ? product.variants.find((item) => item.id === variantId)
    : undefined;
  if (variantId && !variant) {
    throw new RangeError("catalog variant was not found");
  }

  const authoritativeQuantity = variant
    ? variant.stock_quantity
    : product.stock_quantity;
  const effectiveQuantity = productIsAvailable(product)
    ? authoritativeQuantity
    : 0;
  const fulfillableQuantity = Math.min(requestedQuantity, effectiveQuantity);

  return {
    requested_quantity: requestedQuantity,
    is_available: effectiveQuantity > 0,
    can_fulfill_full_request: fulfillableQuantity === requestedQuantity,
    fulfillable_quantity: fulfillableQuantity,
    inventory_disclosure: "request_scoped",
  };
}

export function adaptCatalogProductForBot(
  product: CatalogProduct,
): BotCatalogProduct {
  const productImages = cloneImageReferences(product.image_refs);
  const isAvailable = productIsAvailable(product);
  const variants: BotCatalogVariant[] = product.variants.map((variant) => {
    const variantAvailable = isAvailable && variant.stock_quantity > 0;
    return {
      id: variant.id,
      name: variant.name,
      ...(variant.sku ? { sku: variant.sku } : {}),
      ...(variant.barcode ? { barcode: variant.barcode } : {}),
      ...(variant.price_iqd !== undefined
        ? { price_iqd: variant.price_iqd }
        : {}),
      current_price: variant.price_iqd ?? product.price_iqd,
      is_available: variantAvailable,
      availability: variantAvailable ? "available" : "unavailable",
      quantity: availableFlag(variantAvailable ? 1 : 0),
      ...(variant.weight_g !== undefined ? { weight_g: variant.weight_g } : {}),
      ...(variant.length_mm !== undefined ? { length_mm: variant.length_mm } : {}),
      ...(variant.width_mm !== undefined ? { width_mm: variant.width_mm } : {}),
      ...(variant.height_mm !== undefined ? { height_mm: variant.height_mm } : {}),
      physical_measurements: resolveProductPhysicalMeasurements(product, variant),
      options: { ...variant.options },
      image_refs: cloneImageReferences(variant.image_refs),
    };
  });

  return {
    id: product.id,
    merchant_id: product.merchant_id,
    ...(product.external_ref
      ? { external_ref: product.external_ref, code: product.external_ref }
      : {}),
    name: product.name,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.barcode ? { barcode: product.barcode } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.description ? { description: product.description } : {}),
    price_iqd: product.price_iqd,
    ...(product.compare_at_price_iqd !== undefined
      ? { compare_at_price_iqd: product.compare_at_price_iqd }
      : {}),
    original_price: product.compare_at_price_iqd ?? product.price_iqd,
    current_price: product.price_iqd,
    is_available: isAvailable,
    availability: isAvailable ? "available" : "unavailable",
    quantity: availableFlag(isAvailable ? 1 : 0),
    ...(product.weight_g !== undefined ? { weight_g: product.weight_g } : {}),
    ...(product.length_mm !== undefined ? { length_mm: product.length_mm } : {}),
    ...(product.width_mm !== undefined ? { width_mm: product.width_mm } : {}),
    ...(product.height_mm !== undefined ? { height_mm: product.height_mm } : {}),
    physical_measurements: resolveProductPhysicalMeasurements(product),
    status: product.status,
    allow_fawri_reply: true,
    image_refs: productImages,
    variants,
    catalog_search_terms: buildSearchTerms(product),
    version: product.version,
  };
}

export function readBotCatalogProducts(
  merchantId: unknown,
): BotCatalogProduct[] {
  try {
    return listCatalogProducts(merchantId)
      .filter(isBotVisibleCatalogProduct)
      .map(adaptCatalogProductForBot);
  } catch (cause) {
    throw new BotCatalogAuthorityError(cause);
  }
}
