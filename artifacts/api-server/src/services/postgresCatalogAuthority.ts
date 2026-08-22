import crypto from "node:crypto";
import {
  adjustCatalogInventory,
  createCatalogProduct,
  deleteCatalogProduct,
  getCatalogProduct,
  importCatalogProducts,
  listCatalogProducts,
  setCatalogInventory,
  updateCatalogProduct,
  CatalogRuntimeError,
  type CatalogCreateResult,
  type CatalogDeleteResult,
  type CatalogImportResult,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogProductStatus,
  type CatalogVariant,
} from "./catalogInventoryRuntime";
import {
  applyCatalogCommerceFields,
  applyCatalogInventoryTrackingState,
  catalogCommerceFieldsOf,
  catalogCommerceFromMetadata,
  catalogCommerceMetadataPatch,
  catalogTracksInventory,
  normalizeCatalogCommerceInput,
  type CatalogCommerceProduct,
} from "./catalogCommerceMetadata";
import {
  MAX_IMPORT_ITEMS,
  MAX_PRODUCTS_PER_MERCHANT,
  assertCatalogProductUniqueness,
  catalogIdempotencyKeyHash,
  catalogIdentifiers,
  catalogRequestHash,
  catalogVariantSignature,
  nonNegativeCatalogInteger,
  normalizeCatalogIdentifier,
  normalizeCatalogMerchantId,
  normalizeCatalogProduct,
  normalizeCatalogProductId,
  normalizeCatalogVariantId,
  optionalCatalogText,
  refreshCatalogProductAfterInventory,
  requireCatalogExpectedVersion,
  signedCatalogInteger,
} from "./catalogProductNormalization";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type ProductRow = {
  id: string;
  merchant_id: string;
  external_ref: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  description: string | null;
  current_price_iqd: number;
  compare_at_price_iqd: number | null;
  quantity: number;
  low_stock_threshold: number;
  weight_g: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  version: number;
  status: string;
  allow_fawri_reply: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type VariantRow = {
  id: string;
  product_id: string;
  merchant_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  price_override_iqd: number | null;
  weight_g: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  created_at: Date;
  updated_at: Date;
};

type OptionRow = {
  variant_id: string;
  option_name: string;
  option_value: string;
  ordinal: number;
};

type ImageRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  url: string | null;
  storage_key: string | null;
  alt_text: string | null;
  ordinal: number;
};

type IdempotencyRow = {
  id: string;
  operation: string;
  key_hash: string;
  request_hash: string;
  result_product_id: string | null;
  result_version: number | null;
  result_code: string;
  created_at: Date;
  expires_at: Date;
};

function toStatus(value: string): CatalogProductStatus {
  if (
    value === "available" ||
    value === "low_stock" ||
    value === "out_of_stock" ||
    value === "draft" ||
    value === "hidden_from_fawri"
  ) {
    return value;
  }
  throw new CatalogRuntimeError(
    "CATALOG_STORE_UNSUPPORTED",
    "catalog product status is invalid",
    503,
  );
}

function hashId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function idempotencyId(
  merchantId: string,
  operation: string,
  keyHash: string,
): string {
  return hashId("catidem", `${merchantId}\0${operation}\0${keyHash}`);
}

function identifierId(
  merchantId: string,
  kind: string,
  normalized: string,
): string {
  return hashId("catident", `${merchantId}\0${kind}\0${normalized}`);
}

function optionId(
  merchantId: string,
  variantId: string,
  normalizedName: string,
): string {
  return hashId("catopt", `${merchantId}\0${variantId}\0${normalizedName}`);
}

function inventoryMutationId(
  merchantId: string,
  idempotencyHash: string,
): string {
  return hashId("invmut", `${merchantId}\0${idempotencyHash}`);
}

function importResultCode(productIds: string[]): string {
  return `import:${Buffer.from(JSON.stringify(productIds), "utf8").toString("base64url")}`;
}

function parseImportResultCode(value: string): string[] {
  if (!value.startsWith("import:")) return [];
  try {
    const parsed = JSON.parse(
      Buffer.from(value.slice("import:".length), "base64url").toString("utf8"),
    );
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function translateDatabaseError(error: unknown): never {
  const code = String((error as { code?: unknown })?.code || "");
  const constraint = String(
    (error as { constraint?: unknown })?.constraint || "",
  );
  if (code === "23505") {
    if (constraint.includes("external_ref")) {
      throw new CatalogRuntimeError(
        "CATALOG_EXTERNAL_REF_DUPLICATE",
        "external_ref must be unique within the merchant",
        409,
      );
    }
    if (constraint.includes("identifier")) {
      throw new CatalogRuntimeError(
        "CATALOG_IDENTIFIER_DUPLICATE",
        "SKU or barcode must be unique within the merchant",
        409,
      );
    }
    if (constraint.includes("idempotency")) {
      throw new CatalogRuntimeError(
        "CATALOG_IDEMPOTENCY_CONFLICT",
        "Idempotency-Key is already in use",
        409,
      );
    }
  }
  throw error;
}

function commerceInputRequiresPostgres(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, "item_type") ||
    Object.prototype.hasOwnProperty.call(record, "track_inventory") ||
    Object.prototype.hasOwnProperty.call(record, "service_details") ||
    Object.prototype.hasOwnProperty.call(record, "duration_minutes") ||
    Object.prototype.hasOwnProperty.call(record, "buffer_minutes") ||
    Object.prototype.hasOwnProperty.call(record, "booking_required") ||
    Object.prototype.hasOwnProperty.call(record, "price_type") ||
    Object.prototype.hasOwnProperty.call(record, "location_mode")
  );
}

function assertFallbackCommerceCompatibility(input: unknown): void {
  if (commerceInputRequiresPostgres(input)) {
    throw new CatalogRuntimeError(
      "CATALOG_COMMERCE_POSTGRES_REQUIRED",
      "product/service commerce fields require PostgreSQL catalog authority",
      503,
    );
  }
}

async function loadProducts(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<CatalogCommerceProduct[]> {
  const products = await operationalQueryRows<ProductRow>(
    target,
    `SELECT id, merchant_id, external_ref, name, sku, barcode, category,
            description, current_price_iqd, compare_at_price_iqd, quantity,
            low_stock_threshold, weight_g, length_mm, width_mm, height_mm,
            version, status, allow_fawri_reply, metadata, created_at, updated_at
       FROM products
      WHERE merchant_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC, id ASC${lock ? " FOR UPDATE" : ""}`,
    [merchantId],
  );
  if (products.length === 0) return [];
  const variants = await operationalQueryRows<VariantRow>(
    target,
    `SELECT id, product_id, merchant_id, name, sku, barcode, quantity,
            price_override_iqd, weight_g, length_mm, width_mm, height_mm,
            created_at, updated_at
       FROM product_variants
      WHERE merchant_id = $1
      ORDER BY product_id ASC, created_at ASC, id ASC`,
    [merchantId],
  );
  const options = await operationalQueryRows<OptionRow>(
    target,
    `SELECT variant_id, option_name, option_value, ordinal
       FROM catalog_variant_options
      WHERE merchant_id = $1
      ORDER BY variant_id ASC, ordinal ASC, id ASC`,
    [merchantId],
  );
  const images = await operationalQueryRows<ImageRow>(
    target,
    `SELECT id, product_id, variant_id, url, storage_key, alt_text, ordinal
       FROM catalog_image_references
      WHERE merchant_id = $1
      ORDER BY product_id ASC, variant_id NULLS FIRST, ordinal ASC, id ASC`,
    [merchantId],
  );

  const optionsByVariant = new Map<string, Record<string, string>>();
  for (const option of options) {
    const record = optionsByVariant.get(option.variant_id) || {};
    record[option.option_name] = option.option_value;
    optionsByVariant.set(option.variant_id, record);
  }
  const imagesByOwner = new Map<string, CatalogProduct["image_refs"]>();
  for (const image of images) {
    const key = image.variant_id
      ? `${image.product_id}:${image.variant_id}`
      : image.product_id;
    const list = imagesByOwner.get(key) || [];
    list.push({
      id: image.id,
      ...(image.url ? { url: image.url } : {}),
      ...(image.storage_key ? { storage_key: image.storage_key } : {}),
      ...(image.alt_text ? { alt: image.alt_text } : {}),
    });
    imagesByOwner.set(key, list);
  }
  const variantsByProduct = new Map<string, CatalogVariant[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) || [];
    list.push({
      id: variant.id,
      name: variant.name,
      ...(variant.sku ? { sku: variant.sku } : {}),
      ...(variant.barcode ? { barcode: variant.barcode } : {}),
      ...(variant.price_override_iqd !== null
        ? { price_iqd: Number(variant.price_override_iqd) }
        : {}),
      stock_quantity: Number(variant.quantity),
      ...(variant.weight_g !== null ? { weight_g: Number(variant.weight_g) } : {}),
      ...(variant.length_mm !== null ? { length_mm: Number(variant.length_mm) } : {}),
      ...(variant.width_mm !== null ? { width_mm: Number(variant.width_mm) } : {}),
      ...(variant.height_mm !== null ? { height_mm: Number(variant.height_mm) } : {}),
      options: optionsByVariant.get(variant.id) || {},
      image_refs: imagesByOwner.get(`${variant.product_id}:${variant.id}`) || [],
      created_at: variant.created_at.toISOString(),
      updated_at: variant.updated_at.toISOString(),
    });
    variantsByProduct.set(variant.product_id, list);
  }

  return products.map((product) => {
    const baseProduct: CatalogProduct = {
      id: product.id,
      merchant_id: product.merchant_id,
      ...(product.external_ref ? { external_ref: product.external_ref } : {}),
      name: product.name,
      ...(product.description ? { description: product.description } : {}),
      ...(product.category ? { category: product.category } : {}),
      ...(product.sku ? { sku: product.sku } : {}),
      ...(product.barcode ? { barcode: product.barcode } : {}),
      price_iqd: Number(product.current_price_iqd),
      ...(product.compare_at_price_iqd !== null
        ? { compare_at_price_iqd: Number(product.compare_at_price_iqd) }
        : {}),
      stock_quantity: Number(product.quantity),
      low_stock_threshold: Number(product.low_stock_threshold),
      ...(product.weight_g !== null ? { weight_g: Number(product.weight_g) } : {}),
      ...(product.length_mm !== null ? { length_mm: Number(product.length_mm) } : {}),
      ...(product.width_mm !== null ? { width_mm: Number(product.width_mm) } : {}),
      ...(product.height_mm !== null ? { height_mm: Number(product.height_mm) } : {}),
      status: toStatus(product.status),
      allow_fawri_reply: product.allow_fawri_reply,
      image_refs: imagesByOwner.get(product.id) || [],
      variants: variantsByProduct.get(product.id) || [],
      created_at: product.created_at.toISOString(),
      updated_at: product.updated_at.toISOString(),
      version: Number(product.version),
    };
    return applyCatalogCommerceFields(
      baseProduct,
      catalogCommerceFromMetadata(product.metadata),
    );
  });
}

async function persistProductGraph(
  target: OperationalQueryTarget,
  product: CatalogProduct,
  create: boolean,
  expectedVersion?: number,
): Promise<void> {
  const commerce = catalogCommerceFieldsOf(product);
  const metadataPatch = JSON.stringify(catalogCommerceMetadataPatch(commerce));
  const values = [
    product.id,
    product.merchant_id,
    product.external_ref || null,
    product.external_ref
      ? normalizeCatalogIdentifier(product.external_ref)
      : null,
    product.name,
    product.sku || null,
    product.barcode || null,
    product.category || null,
    product.description || null,
    product.compare_at_price_iqd ?? product.price_iqd,
    product.price_iqd,
    product.compare_at_price_iqd ?? null,
    commerce.track_inventory ? product.stock_quantity : 0,
    product.low_stock_threshold,
    product.weight_g ?? null,
    product.length_mm ?? null,
    product.width_mm ?? null,
    product.height_mm ?? null,
    commerce.track_inventory && product.variants.length > 0,
    product.version,
    product.status,
    product.allow_fawri_reply,
    new Date(product.created_at),
    new Date(product.updated_at),
    metadataPatch,
  ];
  if (create) {
    await target.query(
      `INSERT INTO products (
         id, merchant_id, external_ref, normalized_external_ref, name,
         sku, barcode, category, description, original_price_iqd,
         current_price_iqd, compare_at_price_iqd, quantity, low_stock_threshold,
         weight_g, length_mm, width_mm, height_mm, variant_stock_mode, version,
         status, allow_fawri_reply, created_at, updated_at, metadata
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24,$25::jsonb
       )`,
      values,
    );
  } else {
    const result = await operationalQueryRows<{ id: string }>(
      target,
      `UPDATE products
          SET external_ref = $3,
              normalized_external_ref = $4,
              name = $5,
              sku = $6,
              barcode = $7,
              category = $8,
              description = $9,
              original_price_iqd = $10,
              current_price_iqd = $11,
              compare_at_price_iqd = $12,
              quantity = $13,
              low_stock_threshold = $14,
              weight_g = $15,
              length_mm = $16,
              width_mm = $17,
              height_mm = $18,
              variant_stock_mode = $19,
              version = $20,
              status = $21,
              allow_fawri_reply = $22,
              updated_at = $24,
              metadata = COALESCE(metadata, '{}'::jsonb) || $25::jsonb
        WHERE id = $1 AND merchant_id = $2 AND version = $26 AND deleted_at IS NULL
        RETURNING id`,
      [...values, expectedVersion],
    );
    if (result.length !== 1) {
      throw new CatalogRuntimeError(
        "CATALOG_VERSION_CONFLICT",
        "product was changed by another request",
        409,
        { expected_version: expectedVersion },
      );
    }
  }

  await target.query(
    "DELETE FROM catalog_identifiers WHERE merchant_id = $1 AND product_id = $2",
    [product.merchant_id, product.id],
  );
  await target.query(
    "DELETE FROM catalog_image_references WHERE merchant_id = $1 AND product_id = $2",
    [product.merchant_id, product.id],
  );
  await target.query(
    "DELETE FROM catalog_variant_options WHERE merchant_id = $1 AND product_id = $2",
    [product.merchant_id, product.id],
  );
  await target.query(
    "DELETE FROM product_variants WHERE merchant_id = $1 AND product_id = $2",
    [product.merchant_id, product.id],
  );

  for (const variant of product.variants) {
    await target.query(
      `INSERT INTO product_variants (
         id, product_id, merchant_id, name, sku, barcode, quantity,
         price_adjustment_iqd, price_override_iqd, weight_g, length_mm,
         width_mm, height_mm, option_signature, version, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,1,$14,$15
       )`,
      [
        variant.id,
        product.id,
        product.merchant_id,
        variant.name,
        variant.sku || null,
        variant.barcode || null,
        commerce.track_inventory ? variant.stock_quantity : 0,
        variant.price_iqd ?? null,
        variant.weight_g ?? null,
        variant.length_mm ?? null,
        variant.width_mm ?? null,
        variant.height_mm ?? null,
        catalogVariantSignature(variant),
        new Date(variant.created_at),
        new Date(variant.updated_at),
      ],
    );
    let ordinal = 0;
    for (const [name, value] of Object.entries(variant.options)) {
      const normalizedName = normalizeCatalogIdentifier(name);
      await target.query(
        `INSERT INTO catalog_variant_options (
           id, merchant_id, product_id, variant_id, option_name,
           normalized_option_name, option_value, normalized_option_value, ordinal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          optionId(product.merchant_id, variant.id, normalizedName),
          product.merchant_id,
          product.id,
          variant.id,
          name,
          normalizedName,
          value,
          normalizeCatalogIdentifier(value),
          ordinal++,
        ],
      );
    }
  }

  const persistImages = async (
    images: CatalogProduct["image_refs"],
    variantId?: string,
  ) => {
    for (let ordinal = 0; ordinal < images.length; ordinal += 1) {
      const image = images[ordinal];
      await target.query(
        `INSERT INTO catalog_image_references (
           id, merchant_id, product_id, variant_id, url, storage_key, alt_text, ordinal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          image.id,
          product.merchant_id,
          product.id,
          variantId || null,
          image.url || null,
          image.storage_key || null,
          image.alt || null,
          ordinal,
        ],
      );
    }
  };
  await persistImages(product.image_refs);
  for (const variant of product.variants) {
    await persistImages(variant.image_refs, variant.id);
  }

  for (const identifier of catalogIdentifiers(product)) {
    await target.query(
      `INSERT INTO catalog_identifiers (
         id, merchant_id, kind, normalized_value, display_value,
         owner_type, product_id, variant_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        identifierId(
          product.merchant_id,
          identifier.kind,
          identifier.normalized,
        ),
        product.merchant_id,
        identifier.kind,
        identifier.normalized,
        identifier.display,
        identifier.ownerType,
        product.id,
        identifier.variantId || null,
      ],
    );
  }
}

async function readIdempotency(
  target: OperationalQueryTarget,
  merchantId: string,
  operation: string,
  keyHash: string,
): Promise<IdempotencyRow | null> {
  const rows = await operationalQueryRows<IdempotencyRow>(
    target,
    `SELECT id, operation, key_hash, request_hash, result_product_id,
            result_version, result_code, created_at, expires_at
       FROM catalog_idempotency_keys
      WHERE merchant_id = $1 AND operation = $2 AND key_hash = $3
        AND expires_at > now()
      LIMIT 1`,
    [merchantId, operation, keyHash],
  );
  return rows[0] || null;
}

async function saveIdempotency(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    operation: string;
    keyHash: string;
    requestHash: string;
    resultProductId?: string;
    resultVersion?: number;
    resultCode: string;
  },
): Promise<void> {
  await target.query(
    `INSERT INTO catalog_idempotency_keys (
       id, merchant_id, operation, key_hash, request_hash,
       result_product_id, result_version, result_code, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '30 days')`,
    [
      idempotencyId(input.merchantId, input.operation, input.keyHash),
      input.merchantId,
      input.operation,
      input.keyHash,
      input.requestHash,
      input.resultProductId || null,
      input.resultVersion || null,
      input.resultCode,
    ],
  );
}

function assertIdempotencyRequest(
  row: IdempotencyRow,
  requestHash: string,
): void {
  if (row.request_hash !== requestHash) {
    throw new CatalogRuntimeError(
      "CATALOG_IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used with a different request",
      409,
      { operation: row.operation },
    );
  }
}

function requireProductFromList(
  products: CatalogCommerceProduct[],
  id: string,
): CatalogCommerceProduct {
  const product = products.find((item) => item.id === id);
  if (!product) {
    throw new CatalogRuntimeError(
      "CATALOG_PRODUCT_NOT_FOUND",
      "product was not found",
      404,
    );
  }
  return product;
}

export async function listCatalogProductsAuthoritative(
  merchantIdValue: unknown,
): Promise<CatalogProduct[]> {
  const merchantId = normalizeCatalogMerchantId(merchantIdValue);
  if (!operationalPostgresAuthorityRequired()) {
    return listCatalogProducts(merchantId);
  }
  return withMerchantOperationalTransaction(merchantId, (client) =>
    loadProducts(client, merchantId),
  );
}

export async function getCatalogProductAuthoritative(
  merchantIdValue: unknown,
  productIdValue: unknown,
): Promise<CatalogProduct> {
  const merchantId = normalizeCatalogMerchantId(merchantIdValue);
  const productId = normalizeCatalogProductId(productIdValue);
  if (!operationalPostgresAuthorityRequired()) {
    return getCatalogProduct(merchantId, productId);
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    return requireProductFromList(await loadProducts(client, merchantId), productId);
  });
}

export async function createCatalogProductAuthoritative(params: {
  merchantId: unknown;
  idempotencyKey: unknown;
  input: CatalogProductInput;
}): Promise<CatalogCreateResult> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  if (!operationalPostgresAuthorityRequired()) {
    assertFallbackCommerceCompatibility(params.input);
    return createCatalogProduct({ ...params, merchantId });
  }
  const keyHash = catalogIdempotencyKeyHash(params.idempotencyKey);
  const requestHash = catalogRequestHash(params.input);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const replay = await readIdempotency(
      client,
      merchantId,
      "catalog.create",
      keyHash,
    );
    if (replay) {
      assertIdempotencyRequest(replay, requestHash);
      const products = await loadProducts(client, merchantId);
      if (!replay.result_product_id) {
        throw new CatalogRuntimeError(
          "CATALOG_IDEMPOTENCY_STATE_INVALID",
          "catalog idempotency state is invalid",
          503,
        );
      }
      return {
        product: requireProductFromList(products, replay.result_product_id),
        replayed: true,
      };
    }
    const products = await loadProducts(client, merchantId, true);
    if (products.length >= MAX_PRODUCTS_PER_MERCHANT) {
      throw new CatalogRuntimeError(
        "CATALOG_PRODUCT_LIMIT_EXCEEDED",
        "merchant product limit exceeded",
        409,
        { max: MAX_PRODUCTS_PER_MERCHANT },
      );
    }
    const baseProduct = normalizeCatalogProduct(params.input, {
      merchantId,
      now: new Date().toISOString(),
      forceCreate: true,
    });
    const product = applyCatalogInventoryTrackingState({
      product: applyCatalogCommerceFields(
        baseProduct,
        normalizeCatalogCommerceInput(params.input),
      ),
      input: params.input,
    });
    if (products.some((item) => item.id === product.id)) {
      throw new CatalogRuntimeError(
        "CATALOG_PRODUCT_ID_DUPLICATE",
        "product ID already exists",
        409,
      );
    }
    assertCatalogProductUniqueness(products, [product]);
    try {
      await persistProductGraph(client, product, true);
      await saveIdempotency(client, {
        merchantId,
        operation: "catalog.create",
        keyHash,
        requestHash,
        resultProductId: product.id,
        resultVersion: product.version,
        resultCode: "created",
      });
    } catch (error) {
      translateDatabaseError(error);
    }
    return { product, replayed: false };
  });
}

export async function importCatalogProductsAuthoritative(params: {
  merchantId: unknown;
  idempotencyKey: unknown;
  items: unknown;
}): Promise<CatalogImportResult> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  if (!operationalPostgresAuthorityRequired()) {
    if (Array.isArray(params.items)) {
      for (const item of params.items) assertFallbackCommerceCompatibility(item);
    }
    return importCatalogProducts({ ...params, merchantId });
  }
  const itemsValue = params.items;
  if (!Array.isArray(itemsValue) || itemsValue.length === 0) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_EMPTY",
      "import requires at least one product",
      400,
    );
  }
  const items: unknown[] = itemsValue;
  if (items.length > MAX_IMPORT_ITEMS) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_LIMIT_EXCEEDED",
      "import contains too many products",
      400,
      { max: MAX_IMPORT_ITEMS },
    );
  }
  const keyHash = catalogIdempotencyKeyHash(params.idempotencyKey);
  const requestHash = catalogRequestHash(items);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const replay = await readIdempotency(
      client,
      merchantId,
      "catalog.import",
      keyHash,
    );
    if (replay) {
      assertIdempotencyRequest(replay, requestHash);
      const ids = parseImportResultCode(replay.result_code);
      const current = await loadProducts(client, merchantId);
      const products = ids.map((id) => requireProductFromList(current, id));
      return { products, created_count: products.length, replayed: true };
    }
    const existing = await loadProducts(client, merchantId, true);
    if (existing.length + items.length > MAX_PRODUCTS_PER_MERCHANT) {
      throw new CatalogRuntimeError(
        "CATALOG_PRODUCT_LIMIT_EXCEEDED",
        "merchant product limit exceeded",
        409,
        { max: MAX_PRODUCTS_PER_MERCHANT },
      );
    }
    const now = new Date().toISOString();
    const products = items.map((item) => {
      const baseProduct = normalizeCatalogProduct(item, {
        merchantId,
        now,
        forceCreate: true,
      });
      const product = applyCatalogInventoryTrackingState({
        product: applyCatalogCommerceFields(
          baseProduct,
          normalizeCatalogCommerceInput(item),
        ),
        input: item,
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
      if (ids.has(product.id) || existing.some((item) => item.id === product.id)) {
        throw new CatalogRuntimeError(
          "CATALOG_PRODUCT_ID_DUPLICATE",
          "product ID already exists",
          409,
          { product_id: product.id },
        );
      }
      ids.add(product.id);
    }
    assertCatalogProductUniqueness(existing, products);
    try {
      for (const product of products) {
        await persistProductGraph(client, product, true);
      }
      await saveIdempotency(client, {
        merchantId,
        operation: "catalog.import",
        keyHash,
        requestHash,
        resultCode: importResultCode(products.map((item) => item.id)),
      });
    } catch (error) {
      translateDatabaseError(error);
    }
    return { products, created_count: products.length, replayed: false };
  });
}

export async function updateCatalogProductAuthoritative(params: {
  merchantId: unknown;
  productId: unknown;
  expectedVersion: unknown;
  input: CatalogProductInput;
}): Promise<CatalogProduct> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const expectedVersion = requireCatalogExpectedVersion(params.expectedVersion);
  if (!operationalPostgresAuthorityRequired()) {
    assertFallbackCommerceCompatibility(params.input);
    return updateCatalogProduct({ ...params, merchantId, productId });
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const products = await loadProducts(client, merchantId, true);
    const current = requireProductFromList(products, productId);
    if (current.version !== expectedVersion) {
      throw new CatalogRuntimeError(
        "CATALOG_VERSION_CONFLICT",
        "product was changed by another request",
        409,
        {
          expected_version: expectedVersion,
          current_version: current.version,
          current_product: current,
        },
      );
    }
    const baseProduct = normalizeCatalogProduct(params.input, {
      merchantId,
      existing: current,
      now: new Date().toISOString(),
    });
    const product = applyCatalogInventoryTrackingState({
      product: applyCatalogCommerceFields(
        baseProduct,
        normalizeCatalogCommerceInput(params.input, catalogCommerceFieldsOf(current)),
      ),
      input: params.input,
      previous: current,
    });
    assertCatalogProductUniqueness(
      products.filter((item) => item.id !== productId),
      [product],
    );
    try {
      await persistProductGraph(
        client,
        product,
        false,
        expectedVersion,
      );
    } catch (error) {
      translateDatabaseError(error);
    }
    return product;
  });
}

export async function deleteCatalogProductAuthoritative(params: {
  merchantId: unknown;
  productId: unknown;
  expectedVersion: unknown;
}): Promise<CatalogDeleteResult> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const expectedVersion = requireCatalogExpectedVersion(params.expectedVersion);
  if (!operationalPostgresAuthorityRequired()) {
    return deleteCatalogProduct({ ...params, merchantId, productId });
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const products = await loadProducts(client, merchantId, true);
    const current = requireProductFromList(products, productId);
    if (current.version !== expectedVersion) {
      throw new CatalogRuntimeError(
        "CATALOG_VERSION_CONFLICT",
        "product was changed by another request",
        409,
        {
          expected_version: expectedVersion,
          current_version: current.version,
          current_product: current,
        },
      );
    }
    await client.query(
      "DELETE FROM catalog_identifiers WHERE merchant_id = $1 AND product_id = $2",
      [merchantId, productId],
    );
    await client.query(
      "DELETE FROM catalog_idempotency_keys WHERE merchant_id = $1 AND result_product_id = $2",
      [merchantId, productId],
    );
    await client.query(
      `UPDATE product_variants
          SET external_ref = NULL,
              normalized_external_ref = NULL,
              sku = NULL,
              barcode = NULL,
              updated_at = now()
        WHERE merchant_id = $1 AND product_id = $2`,
      [merchantId, productId],
    );
    const result = await operationalQueryRows<{ id: string }>(
      client,
      `UPDATE products
          SET external_ref = NULL,
              normalized_external_ref = NULL,
              code = NULL,
              sku = NULL,
              barcode = NULL,
              deleted_at = now(),
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2 AND version = $3 AND deleted_at IS NULL
        RETURNING id`,
      [merchantId, productId, expectedVersion],
    );
    if (result.length !== 1) {
      throw new CatalogRuntimeError(
        "CATALOG_VERSION_CONFLICT",
        "product was changed by another request",
        409,
      );
    }
    return { deleted_product_id: productId, deleted_version: current.version };
  });
}

async function mutateInventoryAuthoritative(input: {
  merchantId: string;
  productId: string;
  variantId?: string;
  expectedVersion: number;
  quantity?: number;
  delta?: number;
  idempotencyKeyHash: string;
  requestHash: string;
  mutationType: "set" | "adjust";
  reasonCode: string;
}): Promise<CatalogProduct> {
  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const products = await loadProducts(client, input.merchantId, true);
    const product = requireProductFromList(products, input.productId);
    if (product.version !== input.expectedVersion) {
      throw new CatalogRuntimeError(
        "CATALOG_VERSION_CONFLICT",
        "product was changed by another request",
        409,
        {
          expected_version: input.expectedVersion,
          current_version: product.version,
          current_product: product,
        },
      );
    }
    if (!catalogTracksInventory(product)) {
      throw new CatalogRuntimeError(
        "CATALOG_INVENTORY_NOT_TRACKED",
        "inventory mutations are disabled for this catalog item",
        409,
      );
    }
    let variant: CatalogVariant | undefined;
    if (input.variantId) {
      variant = product.variants.find((item) => item.id === input.variantId);
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
    const before = variant?.stock_quantity ?? product.stock_quantity;
    const after =
      input.mutationType === "set"
        ? Number(input.quantity)
        : before + Number(input.delta);
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new CatalogRuntimeError(
        "CATALOG_NEGATIVE_STOCK",
        "inventory adjustment would make stock negative",
        409,
        { current_quantity: before, delta: input.delta },
      );
    }
    const now = new Date().toISOString();
    if (variant) {
      variant.stock_quantity = after;
      variant.updated_at = now;
      product.stock_quantity = product.variants.reduce(
        (total, item) => total + item.stock_quantity,
        0,
      );
    } else {
      product.stock_quantity = after;
    }
    refreshCatalogProductAfterInventory(product, now);
    await persistProductGraph(
      client,
      product,
      false,
      input.expectedVersion,
    );
    await client.query(
      `INSERT INTO inventory_mutations (
         id, merchant_id, product_id, variant_id, mutation_type,
         before_quantity, after_quantity, expected_version, resulting_version,
         actor_type, actor_account_id, reason_code, idempotency_key_hash,
         request_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'merchant',$2,$10,$11,$12)`,
      [
        inventoryMutationId(input.merchantId, input.idempotencyKeyHash),
        input.merchantId,
        input.productId,
        input.variantId || null,
        input.mutationType,
        before,
        after,
        input.expectedVersion,
        product.version,
        input.reasonCode,
        input.idempotencyKeyHash,
        input.requestHash,
      ],
    );
    return product;
  });
}

export async function setCatalogInventoryAuthoritative(params: {
  merchantId: unknown;
  productId: unknown;
  variantId?: unknown;
  expectedVersion: unknown;
  quantity: unknown;
}): Promise<CatalogProduct> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const variantId = normalizeCatalogVariantId(params.variantId);
  const expectedVersion = requireCatalogExpectedVersion(params.expectedVersion);
  const quantity = nonNegativeCatalogInteger(params.quantity, "quantity");
  if (!operationalPostgresAuthorityRequired()) {
    return setCatalogInventory({
      ...params,
      merchantId,
      productId,
      variantId,
      expectedVersion,
      quantity,
    });
  }
  const request = { productId, variantId, expectedVersion, quantity };
  const requestHash = catalogRequestHash(request);
  const keyHash = crypto
    .createHash("sha256")
    .update(`set:${merchantId}:${requestHash}`)
    .digest("hex");
  return mutateInventoryAuthoritative({
    merchantId,
    productId,
    variantId,
    expectedVersion,
    quantity,
    idempotencyKeyHash: keyHash,
    requestHash,
    mutationType: "set",
    reasonCode: "merchant_inventory_set",
  });
}

export async function adjustCatalogInventoryAuthoritative(params: {
  merchantId: unknown;
  productId: unknown;
  variantId?: unknown;
  expectedVersion: unknown;
  delta: unknown;
  idempotencyKey: unknown;
  reason?: unknown;
}): Promise<CatalogCreateResult> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const variantId = normalizeCatalogVariantId(params.variantId);
  const expectedVersion = requireCatalogExpectedVersion(params.expectedVersion);
  const delta = signedCatalogInteger(params.delta, "delta");
  const reason = optionalCatalogText(params.reason, "reason", 500);
  if (!operationalPostgresAuthorityRequired()) {
    return adjustCatalogInventory({
      ...params,
      merchantId,
      productId,
      variantId,
      expectedVersion,
      delta,
      reason,
    });
  }
  const operation = `inventory.adjust:${productId}`;
  const keyHash = catalogIdempotencyKeyHash(params.idempotencyKey);
  const request = {
    product_id: productId,
    variant_id: variantId,
    expected_version: expectedVersion,
    delta,
    reason,
  };
  const requestHash = catalogRequestHash(request);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const replay = await readIdempotency(client, merchantId, operation, keyHash);
    if (replay) {
      assertIdempotencyRequest(replay, requestHash);
      if (!replay.result_product_id) {
        throw new CatalogRuntimeError(
          "CATALOG_IDEMPOTENCY_STATE_INVALID",
          "catalog idempotency state is invalid",
          503,
        );
      }
      const product = requireProductFromList(
        await loadProducts(client, merchantId),
        replay.result_product_id,
      );
      return { product, replayed: true };
    }

    const products = await loadProducts(client, merchantId, true);
    const product = requireProductFromList(products, productId);
    if (product.version !== expectedVersion) {
      throw new CatalogRuntimeError(
        "CATALOG_VERSION_CONFLICT",
        "product was changed by another request",
        409,
        {
          expected_version: expectedVersion,
          current_version: product.version,
          current_product: product,
        },
      );
    }
    if (!catalogTracksInventory(product)) {
      throw new CatalogRuntimeError(
        "CATALOG_INVENTORY_NOT_TRACKED",
        "inventory mutations are disabled for this catalog item",
        409,
      );
    }
    let variant: CatalogVariant | undefined;
    if (variantId) {
      variant = product.variants.find((item) => item.id === variantId);
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
    const before = variant?.stock_quantity ?? product.stock_quantity;
    const after = before + delta;
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new CatalogRuntimeError(
        "CATALOG_NEGATIVE_STOCK",
        "inventory adjustment would make stock negative",
        409,
        { current_quantity: before, delta },
      );
    }
    const now = new Date().toISOString();
    if (variant) {
      variant.stock_quantity = after;
      variant.updated_at = now;
      product.stock_quantity = product.variants.reduce(
        (total, item) => total + item.stock_quantity,
        0,
      );
    } else {
      product.stock_quantity = after;
    }
    refreshCatalogProductAfterInventory(product, now);
    await persistProductGraph(client, product, false, expectedVersion);
    await client.query(
      `INSERT INTO inventory_mutations (
         id, merchant_id, product_id, variant_id, mutation_type,
         before_quantity, after_quantity, expected_version, resulting_version,
         actor_type, actor_account_id, reason_code, idempotency_key_hash,
         request_hash
       ) VALUES ($1,$2,$3,$4,'adjust',$5,$6,$7,$8,'merchant',$2,$9,$10,$11)`,
      [
        inventoryMutationId(merchantId, keyHash),
        merchantId,
        productId,
        variantId || null,
        before,
        after,
        expectedVersion,
        product.version,
        reason || "merchant_inventory_adjust",
        keyHash,
        requestHash,
      ],
    );
    await saveIdempotency(client, {
      merchantId,
      operation,
      keyHash,
      requestHash,
      resultProductId: product.id,
      resultVersion: product.version,
      resultCode: "adjusted",
    });
    return { product, replayed: false };
  });
}
