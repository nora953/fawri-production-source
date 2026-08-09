import {
  listCatalogProducts,
  resolveProductPhysicalMeasurements,
  type CatalogImageReference,
  type CatalogPhysicalMeasurementsResolution,
  type CatalogProduct,
  type CatalogProductStatus,
} from "./catalogInventoryRuntime";

export type BotCatalogVariant = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price_iqd?: number;
  current_price: number;
  stock_quantity: number;
  quantity: number;
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
  stock_quantity: number;
  quantity: number;
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

export function isBotVisibleCatalogProduct(product: CatalogProduct): boolean {
  return (
    product.allow_fawri_reply === true &&
    product.status !== "draft" &&
    product.status !== "hidden_from_fawri"
  );
}

export function adaptCatalogProductForBot(
  product: CatalogProduct,
): BotCatalogProduct {
  const productImages = cloneImageReferences(product.image_refs);
  const variants: BotCatalogVariant[] = product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    ...(variant.sku ? { sku: variant.sku } : {}),
    ...(variant.barcode ? { barcode: variant.barcode } : {}),
    ...(variant.price_iqd !== undefined
      ? { price_iqd: variant.price_iqd }
      : {}),
    current_price: variant.price_iqd ?? product.price_iqd,
    stock_quantity: variant.stock_quantity,
    quantity: variant.stock_quantity,
    ...(variant.weight_g !== undefined ? { weight_g: variant.weight_g } : {}),
    ...(variant.length_mm !== undefined ? { length_mm: variant.length_mm } : {}),
    ...(variant.width_mm !== undefined ? { width_mm: variant.width_mm } : {}),
    ...(variant.height_mm !== undefined ? { height_mm: variant.height_mm } : {}),
    physical_measurements: resolveProductPhysicalMeasurements(product, variant),
    options: { ...variant.options },
    image_refs: cloneImageReferences(variant.image_refs),
  }));

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
    stock_quantity: product.stock_quantity,
    quantity: product.stock_quantity,
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
