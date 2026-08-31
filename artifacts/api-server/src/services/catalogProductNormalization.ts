import crypto from "node:crypto";
import {
  CatalogRuntimeError,
  MAX_CATALOG_DIMENSION_MM,
  MAX_CATALOG_WEIGHT_G,
  type CatalogImageReference,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogProductStatus,
  type CatalogVariant,
} from "./catalogInventoryRuntime";

export const MAX_PRODUCTS_PER_MERCHANT = 5_000;
export const MAX_IMPORT_ITEMS = 1_000;
const MAX_VARIANTS_PER_PRODUCT = 100;
const MAX_IMAGES_PER_PRODUCT = 20;
const MAX_IMAGES_PER_VARIANT = 5;
const MAX_PRICE_IQD = 1_000_000_000_000;
const PRODUCT_STATUSES = new Set<CatalogProductStatus>([
  "available",
  "low_stock",
  "out_of_stock",
  "draft",
  "hidden_from_fawri",
]);

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function normalizedCatalogText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const result = normalizedCatalogText(value);
  if (!result) {
    throw new CatalogRuntimeError(
      "CATALOG_FIELD_REQUIRED",
      `${field} is required`,
      400,
      { field },
    );
  }
  if (result.length > maxLength) {
    throw new CatalogRuntimeError(
      "CATALOG_FIELD_TOO_LONG",
      `${field} is too long`,
      400,
      { field, max_length: maxLength },
    );
  }
  return result;
}

export function optionalCatalogText(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  const result = normalizedCatalogText(value);
  if (!result) return undefined;
  if (result.length > maxLength) {
    throw new CatalogRuntimeError(
      "CATALOG_FIELD_TOO_LONG",
      `${field} is too long`,
      400,
      { field, max_length: maxLength },
    );
  }
  return result;
}

export function normalizeCatalogMerchantId(value: unknown): string {
  return requiredText(value, "merchant_id", 128);
}

export function normalizeCatalogProductId(value: unknown): string {
  return requiredText(value, "product_id", 160);
}

export function normalizeCatalogVariantId(value: unknown): string | undefined {
  return optionalCatalogText(value, "variant_id", 160);
}

export function normalizeCatalogIdentifier(value: unknown): string {
  return normalizedCatalogText(value).toLocaleLowerCase("en-US");
}

export function nonNegativeCatalogInteger(
  value: unknown,
  field: string,
  fallback?: number,
): number {
  if (
    (value === undefined || value === null || value === "") &&
    fallback !== undefined
  ) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CatalogRuntimeError(
      "CATALOG_INTEGER_INVALID",
      `${field} must be a non-negative integer`,
      400,
      { field },
    );
  }
  return parsed;
}

export function signedCatalogInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed === 0) {
    throw new CatalogRuntimeError(
      "CATALOG_DELTA_INVALID",
      `${field} must be a non-zero integer`,
      400,
      { field },
    );
  }
  return parsed;
}

function priceIqd(
  value: unknown,
  field: string,
  fallback?: number,
): number {
  if (
    (value === undefined || value === null || value === "") &&
    fallback !== undefined
  ) {
    return fallback;
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRICE_IQD
  ) {
    throw new CatalogRuntimeError(
      "CATALOG_PRICE_INVALID",
      `${field} must be a valid non-negative IQD amount`,
      400,
      { field, max: MAX_PRICE_IQD },
    );
  }
  return parsed;
}

function physicalMeasurementInteger(
  value: unknown,
  field: string,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new CatalogRuntimeError(
      "CATALOG_MEASUREMENT_INVALID",
      `${field} must be a positive bounded integer in canonical units`,
      400,
      { field, max },
    );
  }
  return parsed;
}

function normalizePhysicalMeasurements(
  record: Record<string, unknown>,
  prefix: "product" | "variant",
  existing?: {
    weight_g?: number;
    length_mm?: number;
    width_mm?: number;
    height_mm?: number;
  },
) {
  const weight = hasOwn(record, "weight_g")
    ? record.weight_g === null || record.weight_g === ""
      ? undefined
      : physicalMeasurementInteger(
          record.weight_g,
          `${prefix}.weight_g`,
          MAX_CATALOG_WEIGHT_G,
        )
    : existing?.weight_g;
  const keys = ["length_mm", "width_mm", "height_mm"] as const;
  const touched = keys.filter((key) => hasOwn(record, key));
  let dimensions = {
    length_mm: existing?.length_mm,
    width_mm: existing?.width_mm,
    height_mm: existing?.height_mm,
  };
  if (touched.length > 0) {
    if (touched.length !== keys.length) {
      throw new CatalogRuntimeError(
        "CATALOG_DIMENSIONS_PARTIAL",
        `${prefix} dimensions must provide length_mm, width_mm and height_mm together`,
        400,
        { fields: keys },
      );
    }
    const empty = keys.filter(
      (key) =>
        record[key] === undefined ||
        record[key] === null ||
        record[key] === "",
    );
    if (empty.length === keys.length) {
      dimensions = {
        length_mm: undefined,
        width_mm: undefined,
        height_mm: undefined,
      };
    } else if (empty.length > 0) {
      throw new CatalogRuntimeError(
        "CATALOG_DIMENSIONS_PARTIAL",
        `${prefix} dimensions must be fully specified or fully cleared`,
        400,
        { fields: keys },
      );
    } else {
      dimensions = {
        length_mm: physicalMeasurementInteger(
          record.length_mm,
          `${prefix}.length_mm`,
          MAX_CATALOG_DIMENSION_MM,
        ),
        width_mm: physicalMeasurementInteger(
          record.width_mm,
          `${prefix}.width_mm`,
          MAX_CATALOG_DIMENSION_MM,
        ),
        height_mm: physicalMeasurementInteger(
          record.height_mm,
          `${prefix}.height_mm`,
          MAX_CATALOG_DIMENSION_MM,
        ),
      };
    }
  }
  return {
    ...(weight !== undefined ? { weight_g: weight } : {}),
    ...(dimensions.length_mm !== undefined &&
    dimensions.width_mm !== undefined &&
    dimensions.height_mm !== undefined
      ? dimensions
      : {}),
  };
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  throw new CatalogRuntimeError(
    "CATALOG_BOOLEAN_INVALID",
    "boolean value is invalid",
    400,
  );
}

function timestamp(value: unknown, fallback: string): string {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function safeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function imageReferenceId(
  url: string | undefined,
  storageKey: string | undefined,
): string {
  return `img_${crypto
    .createHash("sha256")
    .update(`${url || ""}\n${storageKey || ""}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function normalizeImageReference(value: unknown): CatalogImageReference {
  const record =
    typeof value === "string" ? { url: value } : objectRecord(value);
  for (const forbidden of ["data", "base64", "content", "bytes", "blob"]) {
    if (hasOwn(record, forbidden)) {
      throw new CatalogRuntimeError(
        "CATALOG_IMAGE_BINARY_FORBIDDEN",
        "image binary data must not be stored in the catalog runtime",
        400,
        { field: forbidden },
      );
    }
  }
  const url = optionalCatalogText(record.url, "image.url", 2_048);
  const storageKey = optionalCatalogText(
    record.storage_key,
    "image.storage_key",
    512,
  );
  const alt = optionalCatalogText(record.alt, "image.alt", 300);
  if (!url && !storageKey) {
    throw new CatalogRuntimeError(
      "CATALOG_IMAGE_REFERENCE_REQUIRED",
      "image reference requires a URL or storage key",
      400,
    );
  }
  if (url) {
    const lower = url.toLocaleLowerCase("en-US");
    if (
      lower.startsWith("data:") ||
      lower.startsWith("blob:") ||
      /;base64[,;]/i.test(url)
    ) {
      throw new CatalogRuntimeError(
        "CATALOG_IMAGE_BINARY_FORBIDDEN",
        "embedded or browser-local image data is forbidden",
        400,
      );
    }
    if (
      !url.startsWith("https://") &&
      !url.startsWith("http://") &&
      !url.startsWith("/") &&
      !url.startsWith("asset://")
    ) {
      throw new CatalogRuntimeError(
        "CATALOG_IMAGE_URL_INVALID",
        "image URL must be an http(s), relative, or asset reference",
        400,
      );
    }
  }
  if (storageKey && (storageKey.includes("..") || storageKey.startsWith("/"))) {
    throw new CatalogRuntimeError(
      "CATALOG_IMAGE_STORAGE_KEY_INVALID",
      "image storage key is invalid",
      400,
    );
  }
  const id =
    optionalCatalogText(record.id, "image.id", 160) ||
    imageReferenceId(url, storageKey);
  return {
    id,
    ...(url ? { url } : {}),
    ...(storageKey ? { storage_key: storageKey } : {}),
    ...(alt ? { alt } : {}),
  };
}

function normalizeImageReferences(
  value: unknown,
  maximum: number,
): CatalogImageReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new CatalogRuntimeError(
      "CATALOG_IMAGES_INVALID",
      "image_refs must be an array of references",
      400,
    );
  }
  if (value.length > maximum) {
    throw new CatalogRuntimeError(
      "CATALOG_IMAGES_LIMIT_EXCEEDED",
      "too many image references",
      400,
      { max: maximum },
    );
  }
  const references = value.map(normalizeImageReference);
  const seen = new Set<string>();
  for (const reference of references) {
    const identity = `${normalizeCatalogIdentifier(reference.url)}|${normalizeCatalogIdentifier(reference.storage_key)}`;
    if (seen.has(identity)) {
      throw new CatalogRuntimeError(
        "CATALOG_IMAGE_DUPLICATE",
        "duplicate image reference",
        400,
      );
    }
    seen.add(identity);
  }
  return references;
}

function normalizeOptions(value: unknown): Record<string, string> {
  const entries = Object.entries(objectRecord(value));
  if (entries.length > 10) {
    throw new CatalogRuntimeError(
      "CATALOG_VARIANT_OPTIONS_LIMIT_EXCEEDED",
      "variant has too many options",
      400,
      { max: 10 },
    );
  }
  const normalized: Record<string, string> = {};
  const keys = new Set<string>();
  for (const [rawName, rawValue] of entries) {
    const name = requiredText(rawName, "variant.option.name", 80);
    const optionValue = requiredText(rawValue, "variant.option.value", 120);
    const key = normalizeCatalogIdentifier(name);
    if (keys.has(key)) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_OPTION_DUPLICATE",
        "variant option names must be unique",
        400,
        { option: name },
      );
    }
    keys.add(key);
    normalized[name] = optionValue;
  }
  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) =>
      normalizeCatalogIdentifier(left).localeCompare(
        normalizeCatalogIdentifier(right),
      ),
    ),
  );
}

export function catalogVariantSignature(
  variant: Pick<CatalogVariant, "name" | "options">,
): string {
  const entries = Object.entries(variant.options)
    .map(
      ([name, value]) =>
        `${normalizeCatalogIdentifier(name)}=${normalizeCatalogIdentifier(value)}`,
    )
    .sort();
  const canonical =
    entries.length > 0
      ? entries.join("|")
      : `name=${normalizeCatalogIdentifier(variant.name)}`;
  if (canonical.length >= 16 && canonical.length <= 256) {
    return canonical;
  }
  return `sig_${crypto.createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function normalizeVariant(
  value: unknown,
  now: string,
  existingVariants: CatalogVariant[],
): CatalogVariant {
  const record = objectRecord(value);
  const options = normalizeOptions(record.options);
  const name =
    optionalCatalogText(record.name, "variant.name", 200) ||
    Object.values(options).join(" / ");
  if (!name && Object.keys(options).length === 0) {
    throw new CatalogRuntimeError(
      "CATALOG_VARIANT_IDENTITY_REQUIRED",
      "variant requires a name or at least one option",
      400,
    );
  }
  const requestedId = optionalCatalogText(record.id, "variant.id", 160);
  const provisional = { name: name || "Variant", options };
  const existing = requestedId
    ? existingVariants.find((item) => item.id === requestedId)
    : existingVariants.find(
        (item) =>
          catalogVariantSignature(item) === catalogVariantSignature(provisional),
      );
  const id = requestedId || existing?.id || safeId("var");
  const measurements = normalizePhysicalMeasurements(record, "variant", existing);
  const sku = optionalCatalogText(record.sku, "variant.sku", 128);
  const barcode = optionalCatalogText(record.barcode, "variant.barcode", 128);
  return {
    id,
    name: name || "Variant",
    ...(sku ? { sku } : {}),
    ...(barcode ? { barcode } : {}),
    ...(record.price_iqd === undefined ||
    record.price_iqd === null ||
    record.price_iqd === ""
      ? {}
      : { price_iqd: priceIqd(record.price_iqd, "variant.price_iqd") }),
    stock_quantity: nonNegativeCatalogInteger(
      record.stock_quantity ?? record.quantity,
      "variant.stock_quantity",
      existing?.stock_quantity || 0,
    ),
    ...measurements,
    options,
    image_refs: hasOwn(record, "image_refs")
      ? normalizeImageReferences(record.image_refs, MAX_IMAGES_PER_VARIANT)
      : structuredClone(existing?.image_refs || []),
    created_at: existing?.created_at || timestamp(record.created_at, now),
    updated_at: now,
  };
}

function normalizeVariants(
  value: unknown,
  now: string,
  existingVariants: CatalogVariant[],
): CatalogVariant[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new CatalogRuntimeError(
      "CATALOG_VARIANTS_INVALID",
      "variants must be an array",
      400,
    );
  }
  if (value.length > MAX_VARIANTS_PER_PRODUCT) {
    throw new CatalogRuntimeError(
      "CATALOG_VARIANTS_LIMIT_EXCEEDED",
      "too many variants",
      400,
      { max: MAX_VARIANTS_PER_PRODUCT },
    );
  }
  const variants = value.map((item) =>
    normalizeVariant(item, now, existingVariants),
  );
  const ids = new Set<string>();
  const signatures = new Set<string>();
  for (const variant of variants) {
    if (ids.has(variant.id)) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_ID_DUPLICATE",
        "variant IDs must be unique within a product",
        400,
        { variant_id: variant.id },
      );
    }
    ids.add(variant.id);
    const signature = catalogVariantSignature(variant);
    if (signatures.has(signature)) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_DUPLICATE",
        "duplicate variant options are not allowed",
        400,
        { signature },
      );
    }
    signatures.add(signature);
  }
  return variants;
}

export function normalizeCatalogStatus(
  requested: unknown,
  stockQuantity: number,
  lowStockThreshold: number,
  fallback: CatalogProductStatus,
): CatalogProductStatus {
  const candidate = normalizedCatalogText(
    requested || fallback,
  ) as CatalogProductStatus;
  if (!PRODUCT_STATUSES.has(candidate)) {
    throw new CatalogRuntimeError(
      "CATALOG_STATUS_INVALID",
      "product status is invalid",
      400,
      { status: candidate },
    );
  }
  if (candidate === "draft" || candidate === "hidden_from_fawri") {
    return candidate;
  }
  if (stockQuantity === 0) return "out_of_stock";
  if (stockQuantity <= lowStockThreshold) return "low_stock";
  return "available";
}

export function normalizeCatalogProduct(
  rawValue: unknown,
  context: {
    merchantId: string;
    existing?: CatalogProduct;
    now: string;
    forceCreate?: boolean;
  },
): CatalogProduct {
  const input = objectRecord(rawValue);
  const existing = context.existing;
  const create = context.forceCreate || !existing;
  const name =
    hasOwn(input, "name") || create
      ? requiredText(input.name, "name", 200)
      : existing!.name;
  const description = hasOwn(input, "description")
    ? optionalCatalogText(input.description, "description", 5_000)
    : existing?.description;
  const category = hasOwn(input, "category")
    ? optionalCatalogText(input.category, "category", 200)
    : existing?.category;
  const externalRef = hasOwn(input, "external_ref")
    ? optionalCatalogText(input.external_ref, "external_ref", 200)
    : existing?.external_ref;
  const sku = hasOwn(input, "sku")
    ? optionalCatalogText(input.sku, "sku", 128)
    : existing?.sku;
  const barcode = hasOwn(input, "barcode")
    ? optionalCatalogText(input.barcode, "barcode", 128)
    : existing?.barcode;
  const measurements = normalizePhysicalMeasurements(input, "product", existing);
  const basePrice = priceIqd(
    hasOwn(input, "price_iqd") ? input.price_iqd : input.current_price,
    "price_iqd",
    existing?.price_iqd ?? 0,
  );
  const compareInput = hasOwn(input, "compare_at_price_iqd")
    ? input.compare_at_price_iqd
    : hasOwn(input, "original_price")
      ? input.original_price
      : existing?.compare_at_price_iqd;
  const compareAtPrice =
    compareInput === undefined || compareInput === null || compareInput === ""
      ? undefined
      : priceIqd(compareInput, "compare_at_price_iqd");
  if (compareAtPrice !== undefined && compareAtPrice < basePrice) {
    throw new CatalogRuntimeError(
      "CATALOG_COMPARE_PRICE_INVALID",
      "compare_at_price_iqd cannot be lower than price_iqd",
      400,
    );
  }
  const lowStockThreshold = nonNegativeCatalogInteger(
    input.low_stock_threshold,
    "low_stock_threshold",
    existing?.low_stock_threshold ?? 5,
  );
  const variants = hasOwn(input, "variants")
    ? normalizeVariants(input.variants, context.now, existing?.variants || [])
    : structuredClone(existing?.variants || []);
  let stockQuantity: number;
  if (variants.length > 0) {
    const variantStock = variants.reduce(
      (total, variant) => total + variant.stock_quantity,
      0,
    );
    const supplied = hasOwn(input, "stock_quantity")
      ? input.stock_quantity
      : hasOwn(input, "quantity")
        ? input.quantity
        : undefined;
    if (supplied !== undefined) {
      const parsed = nonNegativeCatalogInteger(supplied, "stock_quantity");
      if (parsed !== variantStock) {
        throw new CatalogRuntimeError(
          "CATALOG_STOCK_MISMATCH",
          "product stock must equal the sum of variant stock",
          400,
          { supplied_stock: parsed, variant_stock: variantStock },
        );
      }
    }
    stockQuantity = variantStock;
  } else {
    stockQuantity = nonNegativeCatalogInteger(
      hasOwn(input, "stock_quantity") ? input.stock_quantity : input.quantity,
      "stock_quantity",
      existing?.stock_quantity ?? 0,
    );
  }
  const status = normalizeCatalogStatus(
    hasOwn(input, "status") ? input.status : existing?.status,
    stockQuantity,
    lowStockThreshold,
    existing?.status || "available",
  );
  const allowFawriReply = booleanValue(
    hasOwn(input, "allow_fawri_reply") ? input.allow_fawri_reply : undefined,
    existing?.allow_fawri_reply ?? true,
  );
  const imageRefs = hasOwn(input, "image_refs")
    ? normalizeImageReferences(input.image_refs, MAX_IMAGES_PER_PRODUCT)
    : hasOwn(input, "images")
      ? normalizeImageReferences(input.images, MAX_IMAGES_PER_PRODUCT)
      : structuredClone(existing?.image_refs || []);
  const createdAt =
    existing?.created_at || timestamp(input.created_at, context.now);
  return {
    id:
      existing?.id ||
      optionalCatalogText(input.id, "id", 160) ||
      safeId("prd"),
    merchant_id: context.merchantId,
    ...(externalRef ? { external_ref: externalRef } : {}),
    name,
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
    ...(sku ? { sku } : {}),
    ...(barcode ? { barcode } : {}),
    price_iqd: basePrice,
    ...(compareAtPrice !== undefined
      ? { compare_at_price_iqd: compareAtPrice }
      : {}),
    stock_quantity: stockQuantity,
    low_stock_threshold: lowStockThreshold,
    ...measurements,
    status,
    allow_fawri_reply: allowFawriReply,
    image_refs: imageRefs,
    variants,
    created_at: createdAt,
    updated_at: context.now,
    version: existing ? existing.version + 1 : 1,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

export function catalogRequestHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function catalogIdempotencyKeyHash(value: unknown): string {
  const key = normalizedCatalogText(value);
  if (key.length < 8 || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new CatalogRuntimeError(
      "CATALOG_IDEMPOTENCY_KEY_REQUIRED",
      "a valid Idempotency-Key is required",
      400,
    );
  }
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function requireCatalogExpectedVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CatalogRuntimeError(
      "CATALOG_VERSION_REQUIRED",
      "a positive expected_version is required",
      400,
    );
  }
  return parsed;
}

export function catalogIdentifiers(product: CatalogProduct): Array<{
  kind: "sku" | "barcode";
  normalized: string;
  display: string;
  ownerType: "product" | "variant";
  productId: string;
  variantId?: string;
}> {
  const result: Array<{
    kind: "sku" | "barcode";
    normalized: string;
    display: string;
    ownerType: "product" | "variant";
    productId: string;
    variantId?: string;
  }> = [];
  const push = (
    kind: "sku" | "barcode",
    display: string | undefined,
    ownerType: "product" | "variant",
    variantId?: string,
  ) => {
    if (!display) return;
    result.push({
      kind,
      normalized: normalizeCatalogIdentifier(display),
      display,
      ownerType,
      productId: product.id,
      ...(variantId ? { variantId } : {}),
    });
  };
  push("sku", product.sku, "product");
  push("barcode", product.barcode, "product");
  for (const variant of product.variants) {
    push("sku", variant.sku, "variant", variant.id);
    push("barcode", variant.barcode, "variant", variant.id);
  }
  return result;
}

export function assertCatalogProductUniqueness(
  existingProducts: CatalogProduct[],
  candidates: CatalogProduct[],
): void {
  const skuOwners = new Map<string, string>();
  const barcodeOwners = new Map<string, string>();
  const externalOwners = new Map<string, string>();
  const inspect = (product: CatalogProduct) => {
    if (product.external_ref) {
      const normalized = normalizeCatalogIdentifier(product.external_ref);
      const owner = externalOwners.get(normalized);
      if (owner) {
        throw new CatalogRuntimeError(
          "CATALOG_EXTERNAL_REF_DUPLICATE",
          "external_ref must be unique within the merchant",
          409,
          { external_ref: product.external_ref, conflicting_owner: owner },
        );
      }
      externalOwners.set(normalized, product.id);
    }
    for (const identifier of catalogIdentifiers(product)) {
      const map = identifier.kind === "sku" ? skuOwners : barcodeOwners;
      const owner = map.get(identifier.normalized);
      const identity = identifier.variantId
        ? `${product.id}:${identifier.variantId}`
        : product.id;
      if (owner) {
        throw new CatalogRuntimeError(
          identifier.kind === "sku"
            ? "CATALOG_SKU_DUPLICATE"
            : "CATALOG_BARCODE_DUPLICATE",
          `${identifier.kind} must be unique within the merchant`,
          409,
          {
            [identifier.kind]: identifier.display,
            conflicting_owner: owner,
            owner: identity,
          },
        );
      }
      map.set(identifier.normalized, identity);
    }
  };
  for (const product of existingProducts) inspect(product);
  for (const product of candidates) inspect(product);
}

export function refreshCatalogProductAfterInventory(
  product: CatalogProduct,
  now: string,
): CatalogProduct {
  product.version += 1;
  product.updated_at = now;
  product.status = normalizeCatalogStatus(
    product.status,
    product.stock_quantity,
    product.low_stock_threshold,
    product.status,
  );
  return product;
}

export type { CatalogProductInput };
