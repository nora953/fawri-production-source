import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { registerMerchantRuntimeDeletion } from "./merchantRuntime";

export type CatalogProductStatus =
  | "available"
  | "low_stock"
  | "out_of_stock"
  | "draft"
  | "hidden_from_fawri";

export type CatalogImageReference = {
  id: string;
  url?: string;
  storage_key?: string;
  alt?: string;
};

export type CatalogVariant = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price_iqd?: number;
  stock_quantity: number;
  options: Record<string, string>;
  image_refs: CatalogImageReference[];
  created_at: string;
  updated_at: string;
};

export type CatalogProduct = {
  id: string;
  merchant_id: string;
  external_ref?: string;
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  barcode?: string;
  price_iqd: number;
  compare_at_price_iqd?: number;
  stock_quantity: number;
  low_stock_threshold: number;
  status: CatalogProductStatus;
  allow_fawri_reply: boolean;
  image_refs: CatalogImageReference[];
  variants: CatalogVariant[];
  created_at: string;
  updated_at: string;
  version: number;
};

export type CatalogProductInput = Record<string, unknown>;

export type CatalogCreateResult = {
  product: CatalogProduct;
  replayed: boolean;
};

export type CatalogImportResult = {
  products: CatalogProduct[];
  created_count: number;
  replayed: boolean;
};

export type CatalogDeleteResult = {
  deleted_product_id: string;
  deleted_version: number;
};

export type CatalogDeletionSummary = {
  catalogProducts: number;
  catalogVariants: number;
  catalogImages: number;
  catalogIdempotencyKeys: number;
};

type IdempotencyRecord = {
  request_hash: string;
  operation: string;
  response: unknown;
  product_ids: string[];
  created_at: string;
};

type MerchantCatalog = {
  products: Record<string, CatalogProduct>;
  idempotency: Record<string, IdempotencyRecord>;
};

type CatalogDatabase = {
  version: 1;
  merchants: Record<string, MerchantCatalog>;
};

type ProductNormalizationContext = {
  merchantId: string;
  existing?: CatalogProduct;
  now: string;
  forceCreate?: boolean;
};

type InventoryMutationInput = {
  merchantId: string;
  productId: string;
  variantId?: string;
  expectedVersion: unknown;
};

export class CatalogRuntimeError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CatalogRuntimeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const STORE_VERSION = 1 as const;
const MAX_PRODUCTS_PER_MERCHANT = 5_000;
const MAX_VARIANTS_PER_PRODUCT = 100;
const MAX_IMAGES_PER_PRODUCT = 20;
const MAX_IMAGES_PER_VARIANT = 5;
const MAX_IMPORT_ITEMS = 1_000;
const MAX_IDEMPOTENCY_RECORDS_PER_MERCHANT = 2_000;
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const LOCK_STALE_MS = 30_000;
const MAX_PRICE_IQD = 1_000_000_000_000;
const PRODUCT_STATUSES = new Set<CatalogProductStatus>([
  "available",
  "low_stock",
  "out_of_stock",
  "draft",
  "hidden_from_fawri",
]);

function storePath(): string {
  return getFawriDataFilePath("catalog-inventory.json");
}

function lockPath(): string {
  return `${storePath()}.lock`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const result = normalizedText(value);
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

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  const result = normalizedText(value);
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

function merchantId(value: unknown): string {
  return requiredText(value, "merchant_id", 128);
}

function productId(value: unknown): string {
  return requiredText(value, "product_id", 160);
}

function variantId(value: unknown): string | undefined {
  return optionalText(value, "variant_id", 160);
}

function normalizeIdentifier(value: unknown): string {
  return normalizedText(value).toLocaleLowerCase("en-US");
}

function nonNegativeInteger(
  value: unknown,
  field: string,
  fallback?: number,
): number {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) {
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

function signedInteger(value: unknown, field: string): number {
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
  if ((value === undefined || value === null || value === "") && fallback !== undefined) {
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

function imageReferenceId(url: string | undefined, storageKey: string | undefined): string {
  const source = `${url || ""}\n${storageKey || ""}`;
  return `img_${crypto.createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
}

function rejectEmbeddedImageData(record: Record<string, unknown>): void {
  for (const forbiddenField of ["data", "base64", "content", "bytes", "blob"]) {
    if (hasOwn(record, forbiddenField)) {
      throw new CatalogRuntimeError(
        "CATALOG_IMAGE_BINARY_FORBIDDEN",
        "image binary data must not be stored in the catalog runtime",
        400,
        { field: forbiddenField },
      );
    }
  }
}

function normalizeImageReference(value: unknown): CatalogImageReference {
  const record = typeof value === "string" ? { url: value } : objectRecord(value);
  rejectEmbeddedImageData(record);

  const url = optionalText(record.url, "image.url", 2_048);
  const storageKey = optionalText(record.storage_key, "image.storage_key", 512);
  const alt = optionalText(record.alt, "image.alt", 300);

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
    optionalText(record.id, "image.id", 160) || imageReferenceId(url, storageKey);
  return {
    id,
    ...(url ? { url } : {}),
    ...(storageKey ? { storage_key: storageKey } : {}),
    ...(alt ? { alt } : {}),
  };
}

function normalizeImageReferences(value: unknown, maximum: number): CatalogImageReference[] {
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
    const identity = `${normalizeIdentifier(reference.url)}|${normalizeIdentifier(reference.storage_key)}`;
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
  const record = objectRecord(value);
  const entries = Object.entries(record);
  if (entries.length > 10) {
    throw new CatalogRuntimeError(
      "CATALOG_VARIANT_OPTIONS_LIMIT_EXCEEDED",
      "variant has too many options",
      400,
      { max: 10 },
    );
  }

  const normalized: Record<string, string> = {};
  const normalizedKeys = new Set<string>();
  for (const [rawName, rawValue] of entries) {
    const name = requiredText(rawName, "variant.option.name", 80);
    const optionValue = requiredText(rawValue, "variant.option.value", 120);
    const key = normalizeIdentifier(name);
    if (normalizedKeys.has(key)) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_OPTION_DUPLICATE",
        "variant option names must be unique",
        400,
        { option: name },
      );
    }
    normalizedKeys.add(key);
    normalized[name] = optionValue;
  }

  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) =>
      normalizeIdentifier(left).localeCompare(normalizeIdentifier(right)),
    ),
  );
}

function variantSignature(variant: Pick<CatalogVariant, "name" | "options">): string {
  const optionEntries = Object.entries(variant.options)
    .map(([name, value]) => `${normalizeIdentifier(name)}=${normalizeIdentifier(value)}`)
    .sort();
  if (optionEntries.length > 0) return optionEntries.join("|");
  return `name=${normalizeIdentifier(variant.name)}`;
}

function normalizeVariant(
  value: unknown,
  now: string,
  existingVariants: CatalogVariant[],
): CatalogVariant {
  const record = objectRecord(value);
  const options = normalizeOptions(record.options);
  const name = optionalText(record.name, "variant.name", 200) ||
    Object.values(options).join(" / ");
  if (!name && Object.keys(options).length === 0) {
    throw new CatalogRuntimeError(
      "CATALOG_VARIANT_IDENTITY_REQUIRED",
      "variant requires a name or at least one option",
      400,
    );
  }

  const requestedId = optionalText(record.id, "variant.id", 160);
  const provisional = { name: name || "Variant", options };
  const existing = requestedId
    ? existingVariants.find((item) => item.id === requestedId)
    : existingVariants.find(
        (item) => variantSignature(item) === variantSignature(provisional),
      );
  const id = requestedId || existing?.id || safeId("var");

  return {
    id,
    name: name || "Variant",
    ...(optionalText(record.sku, "variant.sku", 128) ? {
      sku: optionalText(record.sku, "variant.sku", 128),
    } : {}),
    ...(optionalText(record.barcode, "variant.barcode", 128) ? {
      barcode: optionalText(record.barcode, "variant.barcode", 128),
    } : {}),
    ...(record.price_iqd === undefined || record.price_iqd === null || record.price_iqd === ""
      ? {}
      : { price_iqd: priceIqd(record.price_iqd, "variant.price_iqd") }),
    stock_quantity: nonNegativeInteger(
      record.stock_quantity ?? record.quantity,
      "variant.stock_quantity",
      existing?.stock_quantity || 0,
    ),
    options,
    image_refs: hasOwn(record, "image_refs")
      ? normalizeImageReferences(record.image_refs, MAX_IMAGES_PER_VARIANT)
      : clone(existing?.image_refs || []),
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

  const variants = value.map((item) => normalizeVariant(item, now, existingVariants));
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

    const signature = variantSignature(variant);
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

function normalizeStatus(
  requested: unknown,
  stockQuantity: number,
  lowStockThreshold: number,
  fallback: CatalogProductStatus,
): CatalogProductStatus {
  const candidate = normalizedText(requested || fallback) as CatalogProductStatus;
  if (!PRODUCT_STATUSES.has(candidate)) {
    throw new CatalogRuntimeError(
      "CATALOG_STATUS_INVALID",
      "product status is invalid",
      400,
      { status: candidate },
    );
  }
  if (candidate === "draft" || candidate === "hidden_from_fawri") return candidate;
  if (stockQuantity === 0) return "out_of_stock";
  if (stockQuantity <= lowStockThreshold) return "low_stock";
  return "available";
}

function normalizeProduct(
  rawValue: unknown,
  context: ProductNormalizationContext,
): CatalogProduct {
  const input = objectRecord(rawValue);
  const existing = context.existing;
  const create = context.forceCreate || !existing;

  const name = hasOwn(input, "name") || create
    ? requiredText(input.name, "name", 200)
    : existing.name;
  const description = hasOwn(input, "description")
    ? optionalText(input.description, "description", 5_000)
    : existing?.description;
  const category = hasOwn(input, "category")
    ? optionalText(input.category, "category", 200)
    : existing?.category;
  const externalRef = hasOwn(input, "external_ref")
    ? optionalText(input.external_ref, "external_ref", 200)
    : existing?.external_ref;
  const sku = hasOwn(input, "sku")
    ? optionalText(input.sku, "sku", 128)
    : existing?.sku;
  const barcode = hasOwn(input, "barcode")
    ? optionalText(input.barcode, "barcode", 128)
    : existing?.barcode;

  const basePrice = priceIqd(
    hasOwn(input, "price_iqd") ? input.price_iqd : input.current_price,
    "price_iqd",
    existing?.price_iqd ?? 0,
  );
  const comparePriceInput = hasOwn(input, "compare_at_price_iqd")
    ? input.compare_at_price_iqd
    : hasOwn(input, "original_price")
      ? input.original_price
      : existing?.compare_at_price_iqd;
  const compareAtPrice =
    comparePriceInput === undefined ||
    comparePriceInput === null ||
    comparePriceInput === ""
      ? undefined
      : priceIqd(comparePriceInput, "compare_at_price_iqd");
  if (compareAtPrice !== undefined && compareAtPrice < basePrice) {
    throw new CatalogRuntimeError(
      "CATALOG_COMPARE_PRICE_INVALID",
      "compare_at_price_iqd cannot be lower than price_iqd",
      400,
    );
  }

  const lowStockThreshold = nonNegativeInteger(
    input.low_stock_threshold,
    "low_stock_threshold",
    existing?.low_stock_threshold ?? 5,
  );
  const variants = hasOwn(input, "variants")
    ? normalizeVariants(input.variants, context.now, existing?.variants || [])
    : clone(existing?.variants || []);

  let stockQuantity: number;
  if (variants.length > 0) {
    const variantStock = variants.reduce(
      (total, variant) => total + variant.stock_quantity,
      0,
    );
    const suppliedStock = hasOwn(input, "stock_quantity")
      ? input.stock_quantity
      : hasOwn(input, "quantity")
        ? input.quantity
        : undefined;
    if (suppliedStock !== undefined) {
      const parsed = nonNegativeInteger(suppliedStock, "stock_quantity");
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
    stockQuantity = nonNegativeInteger(
      hasOwn(input, "stock_quantity") ? input.stock_quantity : input.quantity,
      "stock_quantity",
      existing?.stock_quantity ?? 0,
    );
  }

  const requestedStatus = hasOwn(input, "status") ? input.status : existing?.status;
  const status = normalizeStatus(
    requestedStatus,
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
      : clone(existing?.image_refs || []);

  const createdAt = existing?.created_at || timestamp(input.created_at, context.now);
  return {
    id: existing?.id || optionalText(input.id, "id", 160) || safeId("prd"),
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

function requestHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function idempotencyIdentity(operation: string, key: string): string {
  return `${operation}:${crypto.createHash("sha256").update(key).digest("hex")}`;
}

function requireIdempotencyKey(value: unknown): string {
  const key = normalizedText(value);
  if (key.length < 8 || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new CatalogRuntimeError(
      "CATALOG_IDEMPOTENCY_KEY_REQUIRED",
      "a valid Idempotency-Key is required",
      400,
    );
  }
  return key;
}

function emptyDatabase(): CatalogDatabase {
  return { version: STORE_VERSION, merchants: {} };
}

function normalizeStoredProduct(rawValue: unknown, merchant: string): CatalogProduct {
  const input = objectRecord(rawValue);
  const now = timestamp(input.updated_at, new Date().toISOString());
  const normalized = normalizeProduct(input, {
    merchantId: merchant,
    now,
    forceCreate: true,
  });
  normalized.id = requiredText(input.id, "id", 160);
  normalized.created_at = timestamp(input.created_at, now);
  normalized.updated_at = now;
  normalized.version = Math.max(1, nonNegativeInteger(input.version, "version", 1));
  return normalized;
}

function readDatabase(): CatalogDatabase {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8")) as Partial<CatalogDatabase>;
    if (
      parsed.version !== STORE_VERSION ||
      !parsed.merchants ||
      typeof parsed.merchants !== "object" ||
      Array.isArray(parsed.merchants)
    ) {
      throw new CatalogRuntimeError(
        "CATALOG_STORE_UNSUPPORTED",
        "catalog store has an unsupported shape",
        503,
      );
    }

    const database: CatalogDatabase = emptyDatabase();
    for (const [merchantKey, rawCatalog] of Object.entries(parsed.merchants)) {
      const normalizedMerchantId = merchantId(merchantKey);
      const catalogRecord = objectRecord(rawCatalog);
      const rawProducts = objectRecord(catalogRecord.products);
      const products: Record<string, CatalogProduct> = {};
      for (const [id, rawProduct] of Object.entries(rawProducts)) {
        const product = normalizeStoredProduct(rawProduct, normalizedMerchantId);
        if (product.id !== id) {
          throw new CatalogRuntimeError(
            "CATALOG_STORE_PRODUCT_KEY_MISMATCH",
            "catalog product key does not match product ID",
            503,
            { merchant_id: normalizedMerchantId, product_id: id },
          );
        }
        products[id] = product;
      }

      const idempotency: Record<string, IdempotencyRecord> = {};
      for (const [identity, rawRecord] of Object.entries(
        objectRecord(catalogRecord.idempotency),
      )) {
        const record = objectRecord(rawRecord);
        const hash = requiredText(record.request_hash, "request_hash", 128);
        const operation = requiredText(record.operation, "operation", 160);
        const productIds = Array.isArray(record.product_ids)
          ? record.product_ids.map((item) => productId(item))
          : [];
        idempotency[identity] = {
          request_hash: hash,
          operation,
          response: clone(record.response),
          product_ids: productIds,
          created_at: timestamp(record.created_at, new Date(0).toISOString()),
        };
      }
      database.merchants[normalizedMerchantId] = { products, idempotency };
    }
    return database;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDatabase();
    throw error;
  }
}

function writeDatabase(database: CatalogDatabase): void {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  const temporaryPath = `${storePath()}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, storePath());
}

function acquireLock(): number {
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath(), "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
      );
      return descriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const stats = fs.statSync(lockPath());
        if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath());
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw new CatalogRuntimeError(
        "CATALOG_OPERATIONS_BUSY",
        "catalog operations are busy",
        503,
      );
    }
  }
  throw new CatalogRuntimeError(
    "CATALOG_OPERATIONS_BUSY",
    "catalog operations are busy",
    503,
  );
}

function withCatalogLock<T>(callback: (database: CatalogDatabase) => T): T {
  const descriptor = acquireLock();
  try {
    const database = readDatabase();
    const result = callback(database);
    writeDatabase(database);
    return result;
  } finally {
    try {
      fs.closeSync(descriptor);
    } finally {
      try {
        fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function merchantCatalog(
  database: CatalogDatabase,
  merchant: string,
  create = false,
): MerchantCatalog {
  const existing = database.merchants[merchant];
  if (existing) return existing;
  if (!create) return { products: {}, idempotency: {} };
  const catalog = { products: {}, idempotency: {} } satisfies MerchantCatalog;
  database.merchants[merchant] = catalog;
  return catalog;
}

function pruneIdempotency(catalog: MerchantCatalog): void {
  const now = Date.now();
  for (const [identity, record] of Object.entries(catalog.idempotency)) {
    const created = new Date(record.created_at).getTime();
    if (!Number.isFinite(created) || now - created > IDEMPOTENCY_RETENTION_MS) {
      delete catalog.idempotency[identity];
    }
  }

  const records = Object.entries(catalog.idempotency).sort(
    ([, left], [, right]) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  for (const [identity] of records.slice(MAX_IDEMPOTENCY_RECORDS_PER_MERCHANT)) {
    delete catalog.idempotency[identity];
  }
}

function readIdempotentResponse<T>(params: {
  catalog: MerchantCatalog;
  operation: string;
  idempotencyKey: string;
  request: unknown;
}): T | undefined {
  const identity = idempotencyIdentity(params.operation, params.idempotencyKey);
  const existing = params.catalog.idempotency[identity];
  if (!existing) return undefined;
  const hash = requestHash(params.request);
  if (existing.request_hash !== hash) {
    throw new CatalogRuntimeError(
      "CATALOG_IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used with a different request",
      409,
      { operation: params.operation },
    );
  }
  return clone(existing.response) as T;
}

function saveIdempotentResponse(params: {
  catalog: MerchantCatalog;
  operation: string;
  idempotencyKey: string;
  request: unknown;
  response: unknown;
  productIds: string[];
  now: string;
}): void {
  const identity = idempotencyIdentity(params.operation, params.idempotencyKey);
  params.catalog.idempotency[identity] = {
    request_hash: requestHash(params.request),
    operation: params.operation,
    response: clone(params.response),
    product_ids: [...params.productIds],
    created_at: params.now,
  };
  pruneIdempotency(params.catalog);
}

function allIdentifiers(product: CatalogProduct): Array<{
  kind: "sku" | "barcode";
  normalized: string;
  display: string;
  owner: string;
}> {
  const identifiers: Array<{
    kind: "sku" | "barcode";
    normalized: string;
    display: string;
    owner: string;
  }> = [];

  if (product.sku) {
    identifiers.push({
      kind: "sku",
      normalized: normalizeIdentifier(product.sku),
      display: product.sku,
      owner: product.id,
    });
  }
  if (product.barcode) {
    identifiers.push({
      kind: "barcode",
      normalized: normalizeIdentifier(product.barcode),
      display: product.barcode,
      owner: product.id,
    });
  }
  for (const variant of product.variants) {
    if (variant.sku) {
      identifiers.push({
        kind: "sku",
        normalized: normalizeIdentifier(variant.sku),
        display: variant.sku,
        owner: `${product.id}:${variant.id}`,
      });
    }
    if (variant.barcode) {
      identifiers.push({
        kind: "barcode",
        normalized: normalizeIdentifier(variant.barcode),
        display: variant.barcode,
        owner: `${product.id}:${variant.id}`,
      });
    }
  }
  return identifiers;
}

function assertProductUniqueness(
  existingProducts: CatalogProduct[],
  candidates: CatalogProduct[],
): void {
  const skuOwners = new Map<string, string>();
  const barcodeOwners = new Map<string, string>();
  const externalRefOwners = new Map<string, string>();

  const inspect = (product: CatalogProduct) => {
    if (product.external_ref) {
      const normalized = normalizeIdentifier(product.external_ref);
      const owner = externalRefOwners.get(normalized);
      if (owner) {
        throw new CatalogRuntimeError(
          "CATALOG_EXTERNAL_REF_DUPLICATE",
          "external_ref must be unique within the merchant",
          409,
          { external_ref: product.external_ref, conflicting_owner: owner },
        );
      }
      externalRefOwners.set(normalized, product.id);
    }

    for (const identifier of allIdentifiers(product)) {
      const map = identifier.kind === "sku" ? skuOwners : barcodeOwners;
      const owner = map.get(identifier.normalized);
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
            owner: identifier.owner,
          },
        );
      }
      map.set(identifier.normalized, identifier.owner);
    }
  };

  for (const product of existingProducts) inspect(product);
  for (const product of candidates) inspect(product);
}

function requireExpectedVersion(value: unknown): number {
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

function requireProduct(
  catalog: MerchantCatalog,
  id: string,
): CatalogProduct {
  const product = catalog.products[id];
  if (!product) {
    throw new CatalogRuntimeError(
      "CATALOG_PRODUCT_NOT_FOUND",
      "product was not found",
      404,
    );
  }
  return product;
}

function assertVersion(product: CatalogProduct, expectedVersion: number): void {
  if (product.version !== expectedVersion) {
    throw new CatalogRuntimeError(
      "CATALOG_VERSION_CONFLICT",
      "product was changed by another request",
      409,
      {
        expected_version: expectedVersion,
        current_version: product.version,
        current_product: clone(product),
      },
    );
  }
}

function normalizeProductStatusAfterInventory(product: CatalogProduct): void {
  product.status = normalizeStatus(
    product.status,
    product.stock_quantity,
    product.low_stock_threshold,
    product.status,
  );
}

function updatedProduct(product: CatalogProduct, now: string): CatalogProduct {
  product.version += 1;
  product.updated_at = now;
  normalizeProductStatusAfterInventory(product);
  return product;
}

export function listCatalogProducts(rawMerchantId: unknown): CatalogProduct[] {
  const merchant = merchantId(rawMerchantId);
  const database = readDatabase();
  const catalog = merchantCatalog(database, merchant);
  return Object.values(catalog.products)
    .sort((left, right) => {
      const updated = right.updated_at.localeCompare(left.updated_at);
      return updated || left.id.localeCompare(right.id);
    })
    .map(clone);
}

export function getCatalogProduct(
  rawMerchantId: unknown,
  rawProductId: unknown,
): CatalogProduct {
  const merchant = merchantId(rawMerchantId);
  const id = productId(rawProductId);
  const database = readDatabase();
  return clone(requireProduct(merchantCatalog(database, merchant), id));
}

export function createCatalogProduct(params: {
  merchantId: unknown;
  idempotencyKey: unknown;
  input: CatalogProductInput;
}): CatalogCreateResult {
  const merchant = merchantId(params.merchantId);
  const key = requireIdempotencyKey(params.idempotencyKey);
  const request = clone(params.input);

  return withCatalogLock((database) => {
    const catalog = merchantCatalog(database, merchant, true);
    const replay = readIdempotentResponse<{ product: CatalogProduct }>({
      catalog,
      operation: "catalog.create",
      idempotencyKey: key,
      request,
    });
    if (replay) return { product: replay.product, replayed: true };

    if (Object.keys(catalog.products).length >= MAX_PRODUCTS_PER_MERCHANT) {
      throw new CatalogRuntimeError(
        "CATALOG_PRODUCT_LIMIT_EXCEEDED",
        "merchant product limit exceeded",
        409,
        { max: MAX_PRODUCTS_PER_MERCHANT },
      );
    }

    const now = new Date().toISOString();
    const product = normalizeProduct(params.input, {
      merchantId: merchant,
      now,
      forceCreate: true,
    });
    if (catalog.products[product.id]) {
      throw new CatalogRuntimeError(
        "CATALOG_PRODUCT_ID_DUPLICATE",
        "product ID already exists",
        409,
      );
    }
    assertProductUniqueness(Object.values(catalog.products), [product]);
    catalog.products[product.id] = product;
    saveIdempotentResponse({
      catalog,
      operation: "catalog.create",
      idempotencyKey: key,
      request,
      response: { product },
      productIds: [product.id],
      now,
    });
    return { product: clone(product), replayed: false };
  });
}

export function importCatalogProducts(params: {
  merchantId: unknown;
  idempotencyKey: unknown;
  items: unknown;
}): CatalogImportResult {
  const merchant = merchantId(params.merchantId);
  const key = requireIdempotencyKey(params.idempotencyKey);
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_EMPTY",
      "import requires at least one product",
      400,
    );
  }
  const items = params.items;
  if (items.length > MAX_IMPORT_ITEMS) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_LIMIT_EXCEEDED",
      "import contains too many products",
      400,
      { max: MAX_IMPORT_ITEMS },
    );
  }
  const request = clone(items);

  return withCatalogLock((database) => {
    const catalog = merchantCatalog(database, merchant, true);
    const replay = readIdempotentResponse<{
      products: CatalogProduct[];
      created_count: number;
    }>({
      catalog,
      operation: "catalog.import",
      idempotencyKey: key,
      request,
    });
    if (replay) return { ...replay, replayed: true };

    if (
      Object.keys(catalog.products).length + items.length >
      MAX_PRODUCTS_PER_MERCHANT
    ) {
      throw new CatalogRuntimeError(
        "CATALOG_PRODUCT_LIMIT_EXCEEDED",
        "merchant product limit exceeded",
        409,
        { max: MAX_PRODUCTS_PER_MERCHANT },
      );
    }

    const now = new Date().toISOString();
    const products = items.map((item: unknown) => {
      const product = normalizeProduct(item, {
        merchantId: merchant,
        now,
        forceCreate: true,
      });
      if (!product.external_ref && !product.sku && !product.barcode) {
        throw new CatalogRuntimeError(
          "CATALOG_IMPORT_IDENTITY_REQUIRED",
          "each imported product requires external_ref, sku, or barcode",
          400,
          { product_name: product.name },
        );
      }
      return product;
    });

    const ids = new Set<string>();
    for (const product of products) {
      if (ids.has(product.id) || catalog.products[product.id]) {
        throw new CatalogRuntimeError(
          "CATALOG_PRODUCT_ID_DUPLICATE",
          "product ID already exists",
          409,
          { product_id: product.id },
        );
      }
      ids.add(product.id);
    }
    assertProductUniqueness(Object.values(catalog.products), products);

    for (const product of products) catalog.products[product.id] = product;
    const response = {
      products: products.map(clone),
      created_count: products.length,
    };
    saveIdempotentResponse({
      catalog,
      operation: "catalog.import",
      idempotencyKey: key,
      request,
      response,
      productIds: products.map((product) => product.id),
      now,
    });
    return { ...response, replayed: false };
  });
}

export function updateCatalogProduct(params: {
  merchantId: unknown;
  productId: unknown;
  expectedVersion: unknown;
  input: CatalogProductInput;
}): CatalogProduct {
  const merchant = merchantId(params.merchantId);
  const id = productId(params.productId);
  const expectedVersion = requireExpectedVersion(params.expectedVersion);

  return withCatalogLock((database) => {
    const catalog = merchantCatalog(database, merchant);
    const current = requireProduct(catalog, id);
    assertVersion(current, expectedVersion);

    const candidate = normalizeProduct(params.input, {
      merchantId: merchant,
      existing: current,
      now: new Date().toISOString(),
    });
    assertProductUniqueness(
      Object.values(catalog.products).filter((product) => product.id !== id),
      [candidate],
    );
    catalog.products[id] = candidate;
    return clone(candidate);
  });
}

export function deleteCatalogProduct(params: {
  merchantId: unknown;
  productId: unknown;
  expectedVersion: unknown;
}): CatalogDeleteResult {
  const merchant = merchantId(params.merchantId);
  const id = productId(params.productId);
  const expectedVersion = requireExpectedVersion(params.expectedVersion);

  return withCatalogLock((database) => {
    const catalog = merchantCatalog(database, merchant);
    const current = requireProduct(catalog, id);
    assertVersion(current, expectedVersion);
    delete catalog.products[id];

    for (const [identity, record] of Object.entries(catalog.idempotency)) {
      if (record.product_ids.includes(id)) delete catalog.idempotency[identity];
    }

    return {
      deleted_product_id: id,
      deleted_version: current.version,
    };
  });
}

function mutateInventory(
  params: InventoryMutationInput,
  callback: (product: CatalogProduct, variant: CatalogVariant | undefined) => void,
): CatalogProduct {
  const merchant = merchantId(params.merchantId);
  const id = productId(params.productId);
  const requestedVariantId = variantId(params.variantId);
  const expectedVersion = requireExpectedVersion(params.expectedVersion);

  return withCatalogLock((database) => {
    const catalog = merchantCatalog(database, merchant);
    const product = requireProduct(catalog, id);
    assertVersion(product, expectedVersion);

    let variant: CatalogVariant | undefined;
    if (requestedVariantId) {
      variant = product.variants.find((item) => item.id === requestedVariantId);
      if (!variant) {
        throw new CatalogRuntimeError(
          "CATALOG_VARIANT_NOT_FOUND",
          "variant was not found",
          404,
        );
      }
    } else if (product.variants.length > 0) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_REQUIRED",
        "variant_id is required for a product with variants",
        400,
      );
    }

    callback(product, variant);
    if (variant) {
      variant.updated_at = new Date().toISOString();
      product.stock_quantity = product.variants.reduce(
        (total, item) => total + item.stock_quantity,
        0,
      );
    }
    return clone(updatedProduct(product, new Date().toISOString()));
  });
}

export function setCatalogInventory(params: InventoryMutationInput & {
  quantity: unknown;
}): CatalogProduct {
  const quantity = nonNegativeInteger(params.quantity, "quantity");
  return mutateInventory(params, (product, variant) => {
    if (variant) variant.stock_quantity = quantity;
    else product.stock_quantity = quantity;
  });
}

export function adjustCatalogInventory(params: InventoryMutationInput & {
  delta: unknown;
  idempotencyKey: unknown;
  reason?: unknown;
}): CatalogCreateResult {
  const merchant = merchantId(params.merchantId);
  const id = productId(params.productId);
  const requestedVariantId = variantId(params.variantId);
  const expectedVersion = requireExpectedVersion(params.expectedVersion);
  const delta = signedInteger(params.delta, "delta");
  const key = requireIdempotencyKey(params.idempotencyKey);
  const reason = optionalText(params.reason, "reason", 500);
  const request = {
    product_id: id,
    variant_id: requestedVariantId,
    expected_version: expectedVersion,
    delta,
    reason,
  };

  return withCatalogLock((database) => {
    const catalog = merchantCatalog(database, merchant);
    const replay = readIdempotentResponse<{ product: CatalogProduct }>({
      catalog,
      operation: `inventory.adjust:${id}`,
      idempotencyKey: key,
      request,
    });
    if (replay) return { product: replay.product, replayed: true };

    const product = requireProduct(catalog, id);
    assertVersion(product, expectedVersion);
    let variant: CatalogVariant | undefined;
    if (requestedVariantId) {
      variant = product.variants.find((item) => item.id === requestedVariantId);
      if (!variant) {
        throw new CatalogRuntimeError(
          "CATALOG_VARIANT_NOT_FOUND",
          "variant was not found",
          404,
        );
      }
    } else if (product.variants.length > 0) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_REQUIRED",
        "variant_id is required for a product with variants",
        400,
      );
    }

    const currentQuantity = variant?.stock_quantity ?? product.stock_quantity;
    const nextQuantity = currentQuantity + delta;
    if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0) {
      throw new CatalogRuntimeError(
        "CATALOG_NEGATIVE_STOCK",
        "inventory adjustment would make stock negative",
        409,
        { current_quantity: currentQuantity, delta },
      );
    }

    const now = new Date().toISOString();
    if (variant) {
      variant.stock_quantity = nextQuantity;
      variant.updated_at = now;
      product.stock_quantity = product.variants.reduce(
        (total, item) => total + item.stock_quantity,
        0,
      );
    } else {
      product.stock_quantity = nextQuantity;
    }
    updatedProduct(product, now);
    const response = { product: clone(product) };
    saveIdempotentResponse({
      catalog,
      operation: `inventory.adjust:${id}`,
      idempotencyKey: key,
      request,
      response,
      productIds: [id],
      now,
    });
    return { product: response.product, replayed: false };
  });
}

export function deleteMerchantCatalogData(
  rawMerchantId: unknown,
): CatalogDeletionSummary {
  const merchant = merchantId(rawMerchantId);
  return withCatalogLock((database) => {
    const catalog = database.merchants[merchant];
    if (!catalog) {
      return {
        catalogProducts: 0,
        catalogVariants: 0,
        catalogImages: 0,
        catalogIdempotencyKeys: 0,
      };
    }

    const products = Object.values(catalog.products);
    const summary: CatalogDeletionSummary = {
      catalogProducts: products.length,
      catalogVariants: products.reduce(
        (total, product) => total + product.variants.length,
        0,
      ),
      catalogImages: products.reduce(
        (total, product) =>
          total +
          product.image_refs.length +
          product.variants.reduce(
            (variantTotal, variant) => variantTotal + variant.image_refs.length,
            0,
          ),
        0,
      ),
      catalogIdempotencyKeys: Object.keys(catalog.idempotency).length,
    };
    delete database.merchants[merchant];
    return summary;
  });
}

export function getCatalogRuntimeFilePath(): string {
  return storePath();
}

registerMerchantRuntimeDeletion((deletedMerchantId) =>
  deleteMerchantCatalogData(deletedMerchantId),
);
