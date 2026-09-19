import crypto from "node:crypto";
import { catalogCommerceFromMetadata } from "./catalogCommerceMetadata";
import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type LocationInventoryLevel = {
  id: string;
  merchant_id: string;
  location_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  low_stock_threshold: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type LocationInventoryMutationResult = {
  level: LocationInventoryLevel;
  replayed: boolean;
};

export class LocationInventoryAuthorityError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LocationInventoryAuthorityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type LevelRow = {
  id: string;
  merchant_id: string;
  location_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  low_stock_threshold: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProductScopeRow = {
  id: string;
  low_stock_threshold: number;
  metadata: Record<string, unknown> | null;
};

type ReplayRow = {
  location_id: string | null;
  product_id: string;
  variant_id: string | null;
  request_hash: string;
  after_quantity: number;
  resulting_version: number;
  created_at: Date | string;
};

function text(value: unknown, field: string, maximum = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_IDENTIFIER_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maximum = 200,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, maximum);
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_INTEGER_INVALID",
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
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_DELTA_INVALID",
      `${field} must be a non-zero integer`,
      400,
      { field },
    );
  }
  return parsed;
}

function positiveVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_VERSION_REQUIRED",
      "a positive expected_version is required",
      400,
    );
  }
  return parsed;
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

function idempotencyHash(value: unknown): string {
  const key = text(value, "idempotency_key", 200);
  if (key.length < 8) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_IDEMPOTENCY_KEY_REQUIRED",
      "a valid idempotency key is required",
      400,
    );
  }
  return crypto.createHash("sha256").update(key).digest("hex");
}

function stableLevelId(
  merchantId: string,
  locationId: string,
  productId: string,
  variantId?: string,
): string {
  return `location_inventory_${crypto
    .createHash("sha256")
    .update(`${merchantId}\0${locationId}\0${productId}\0${variantId || ""}`)
    .digest("hex")
    .slice(0, 40)}`;
}

function mutationId(merchantId: string, keyHash: string): string {
  return `location_inventory_mutation_${crypto
    .createHash("sha256")
    .update(`${merchantId}\0${keyHash}`)
    .digest("hex")
    .slice(0, 40)}`;
}

function toLevel(row: LevelRow): LocationInventoryLevel {
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    location_id: row.location_id,
    product_id: row.product_id,
    ...(row.variant_id ? { variant_id: row.variant_id } : {}),
    quantity: Number(row.quantity),
    low_stock_threshold: Number(row.low_stock_threshold),
    version: Number(row.version),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

async function requireLocation(
  target: OperationalQueryTarget,
  merchantId: string,
  locationId: string,
): Promise<void> {
  const rows = await operationalQueryRows<{ id: string }>(
    target,
    `SELECT id
       FROM merchant_locations
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1
      FOR KEY SHARE`,
    [merchantId, locationId],
  );
  if (!rows[0]) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_LOCATION_NOT_FOUND",
      "merchant location was not found",
      404,
      { location_id: locationId },
    );
  }
}

async function requireInventoryScope(
  target: OperationalQueryTarget,
  merchantId: string,
  productId: string,
  variantId?: string,
): Promise<ProductScopeRow> {
  const products = await operationalQueryRows<ProductScopeRow>(
    target,
    `SELECT id, low_stock_threshold, metadata
       FROM products
      WHERE merchant_id = $1 AND id = $2 AND deleted_at IS NULL
      LIMIT 1
      FOR KEY SHARE`,
    [merchantId, productId],
  );
  const product = products[0];
  if (!product) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_PRODUCT_NOT_FOUND",
      "catalog product was not found",
      404,
      { product_id: productId },
    );
  }
  const commerce = catalogCommerceFromMetadata(product.metadata);
  if (commerce.item_type === "service" || !commerce.track_inventory) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_NOT_TRACKED",
      "catalog item does not use inventory tracking",
      409,
      { product_id: productId },
    );
  }

  const variants = await operationalQueryRows<{ id: string }>(
    target,
    `SELECT id
       FROM product_variants
      WHERE merchant_id = $1 AND product_id = $2
      ORDER BY id
      FOR KEY SHARE`,
    [merchantId, productId],
  );
  if (variantId) {
    if (!variants.some((row) => row.id === variantId)) {
      throw new LocationInventoryAuthorityError(
        "LOCATION_INVENTORY_VARIANT_NOT_FOUND",
        "catalog variant was not found for product",
        404,
        { product_id: productId, variant_id: variantId },
      );
    }
  } else if (variants.length > 0) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_VARIANT_REQUIRED",
      "variant_id is required for a product with variants",
      400,
      { product_id: productId },
    );
  }
  return product;
}

async function loadLevel(
  target: OperationalQueryTarget,
  params: {
    merchantId: string;
    locationId: string;
    productId: string;
    variantId?: string;
    lock?: boolean;
  },
): Promise<LocationInventoryLevel | null> {
  const rows = await operationalQueryRows<LevelRow>(
    target,
    `SELECT id, merchant_id, location_id, product_id, variant_id,
            quantity, low_stock_threshold, version, created_at, updated_at
       FROM location_inventory_levels
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
        AND variant_id IS NOT DISTINCT FROM $4
      LIMIT 1${params.lock ? " FOR UPDATE" : ""}`,
    [
      params.merchantId,
      params.locationId,
      params.productId,
      params.variantId || null,
    ],
  );
  return rows[0] ? toLevel(rows[0]) : null;
}

async function requireLevel(
  target: OperationalQueryTarget,
  params: {
    merchantId: string;
    locationId: string;
    productId: string;
    variantId?: string;
    lock?: boolean;
  },
): Promise<LocationInventoryLevel> {
  const level = await loadLevel(target, params);
  if (!level) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_LEVEL_NOT_FOUND",
      "location inventory level was not found",
      404,
      {
        location_id: params.locationId,
        product_id: params.productId,
        variant_id: params.variantId || null,
      },
    );
  }
  return level;
}

async function replayMutation(
  target: OperationalQueryTarget,
  params: {
    merchantId: string;
    locationId: string;
    productId: string;
    variantId?: string;
    keyHash: string;
    requestHash: string;
  },
): Promise<LocationInventoryLevel | null> {
  const rows = await operationalQueryRows<ReplayRow>(
    target,
    `SELECT location_id, product_id, variant_id, request_hash,
            after_quantity, resulting_version, created_at
       FROM inventory_mutations
      WHERE merchant_id = $1 AND idempotency_key_hash = $2
      LIMIT 1`,
    [params.merchantId, params.keyHash],
  );
  const replay = rows[0];
  if (!replay) return null;
  if (
    replay.request_hash !== params.requestHash ||
    replay.location_id !== params.locationId ||
    replay.product_id !== params.productId ||
    (replay.variant_id || undefined) !== params.variantId
  ) {
    throw new LocationInventoryAuthorityError(
      "LOCATION_INVENTORY_IDEMPOTENCY_CONFLICT",
      "idempotency key was already used for a different inventory request",
      409,
    );
  }
  const current = await requireLevel(target, {
    merchantId: params.merchantId,
    locationId: params.locationId,
    productId: params.productId,
    variantId: params.variantId,
  });
  return {
    ...current,
    quantity: Number(replay.after_quantity),
    version: Number(replay.resulting_version),
    updated_at: new Date(replay.created_at).toISOString(),
  };
}

async function lockCreationScope(
  target: OperationalQueryTarget,
  merchantId: string,
  locationId: string,
  productId: string,
  variantId?: string,
): Promise<void> {
  await target.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`location_inventory|${merchantId}|${locationId}|${productId}|${variantId || ""}`],
  );
}

async function markFresh(
  target: OperationalQueryTarget,
  merchantId: string,
  locationId: string,
): Promise<void> {
  await target.query(
    `UPDATE merchant_locations
        SET inventory_fresh_at = now(),
            updated_at = GREATEST(updated_at, now())
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, locationId],
  );
}

async function recordMutation(
  target: OperationalQueryTarget,
  params: {
    merchantId: string;
    locationId: string;
    productId: string;
    variantId?: string;
    mutationType: "set" | "adjust";
    before: number;
    after: number;
    expectedVersion: number;
    resultingVersion: number;
    actorAccountId?: string;
    reasonCode: string;
    keyHash: string;
    requestHash: string;
  },
): Promise<void> {
  await target.query(
    `INSERT INTO inventory_mutations (
       id, merchant_id, location_id, product_id, variant_id, mutation_type,
       before_quantity, after_quantity, expected_version, resulting_version,
       actor_type, actor_account_id, reason_code, idempotency_key_hash,
       request_hash
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'merchant',$11,$12,$13,$14)`,
    [
      mutationId(params.merchantId, params.keyHash),
      params.merchantId,
      params.locationId,
      params.productId,
      params.variantId || null,
      params.mutationType,
      params.before,
      params.after,
      params.expectedVersion,
      params.resultingVersion,
      params.actorAccountId || null,
      params.reasonCode,
      params.keyHash,
      params.requestHash,
    ],
  );
}

export async function listLocationInventoryLevelsAuthoritative(params: {
  merchantId: unknown;
  locationId: unknown;
}): Promise<LocationInventoryLevel[]> {
  const merchantId = text(params.merchantId, "merchant_id", 128);
  const locationId = text(params.locationId, "location_id", 160);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await requireLocation(client, merchantId, locationId);
    const rows = await operationalQueryRows<LevelRow>(
      client,
      `SELECT id, merchant_id, location_id, product_id, variant_id,
              quantity, low_stock_threshold, version, created_at, updated_at
         FROM location_inventory_levels
        WHERE merchant_id = $1 AND location_id = $2
        ORDER BY product_id, variant_id NULLS FIRST, id`,
      [merchantId, locationId],
    );
    return rows.map(toLevel);
  });
}

export async function getLocationInventoryLevelAuthoritative(params: {
  merchantId: unknown;
  locationId: unknown;
  productId: unknown;
  variantId?: unknown;
}): Promise<LocationInventoryLevel> {
  const merchantId = text(params.merchantId, "merchant_id", 128);
  const locationId = text(params.locationId, "location_id", 160);
  const productId = text(params.productId, "product_id", 160);
  const variantId = optionalText(params.variantId, "variant_id", 160);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await requireLocation(client, merchantId, locationId);
    await requireInventoryScope(client, merchantId, productId, variantId);
    return requireLevel(client, { merchantId, locationId, productId, variantId });
  });
}

export async function createLocationInventoryLevelAuthoritative(params: {
  merchantId: unknown;
  locationId: unknown;
  productId: unknown;
  variantId?: unknown;
  quantity: unknown;
  lowStockThreshold?: unknown;
  idempotencyKey: unknown;
  actorAccountId?: unknown;
  reason?: unknown;
}): Promise<LocationInventoryMutationResult> {
  const merchantId = text(params.merchantId, "merchant_id", 128);
  const locationId = text(params.locationId, "location_id", 160);
  const productId = text(params.productId, "product_id", 160);
  const variantId = optionalText(params.variantId, "variant_id", 160);
  const quantity = nonNegativeInteger(params.quantity, "quantity");
  const requestedLowStockThreshold =
    params.lowStockThreshold === undefined
      ? undefined
      : nonNegativeInteger(params.lowStockThreshold, "low_stock_threshold");
  const keyHash = idempotencyHash(params.idempotencyKey);
  const actorAccountId = optionalText(params.actorAccountId, "actor_account_id", 200);
  const reason = optionalText(params.reason, "reason", 500);
  const hash = requestHash({
    operation: "create",
    location_id: locationId,
    product_id: productId,
    variant_id: variantId || null,
    quantity,
    low_stock_threshold: requestedLowStockThreshold ?? null,
    reason: reason || null,
  });

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const replay = await replayMutation(client, {
      merchantId, locationId, productId, variantId, keyHash, requestHash: hash,
    });
    if (replay) return { level: replay, replayed: true };

    await requireLocation(client, merchantId, locationId);
    const product = await requireInventoryScope(
      client,
      merchantId,
      productId,
      variantId,
    );
    const lowStockThreshold =
      requestedLowStockThreshold ?? Number(product.low_stock_threshold);

    await lockCreationScope(
      client,
      merchantId,
      locationId,
      productId,
      variantId,
    );
    const existing = await loadLevel(client, {
      merchantId, locationId, productId, variantId, lock: true,
    });
    if (existing) {
      throw new LocationInventoryAuthorityError(
        "LOCATION_INVENTORY_LEVEL_EXISTS",
        "location inventory level already exists",
        409,
        { current_level: existing },
      );
    }

    const id = stableLevelId(merchantId, locationId, productId, variantId);
    const rows = await operationalQueryRows<LevelRow>(
      client,
      `INSERT INTO location_inventory_levels (
         id, merchant_id, location_id, product_id, variant_id,
         quantity, low_stock_threshold, version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,1)
       RETURNING id, merchant_id, location_id, product_id, variant_id,
                 quantity, low_stock_threshold, version, created_at, updated_at`,
      [
        id,
        merchantId,
        locationId,
        productId,
        variantId || null,
        quantity,
        lowStockThreshold,
      ],
    );
    const level = toLevel(rows[0]);
    await recordMutation(client, {
      merchantId,
      locationId,
      productId,
      variantId,
      mutationType: "set",
      before: 0,
      after: quantity,
      expectedVersion: 0,
      resultingVersion: 1,
      actorAccountId,
      reasonCode: reason || "location_inventory_initial_allocation",
      keyHash,
      requestHash: hash,
    });
    await markFresh(client, merchantId, locationId);
    return { level, replayed: false };
  });
}

async function mutateLocationInventoryLevel(params: {
  merchantId: unknown;
  locationId: unknown;
  productId: unknown;
  variantId?: unknown;
  expectedVersion: unknown;
  quantity?: unknown;
  delta?: unknown;
  idempotencyKey: unknown;
  actorAccountId?: unknown;
  reason?: unknown;
  operation: "set" | "adjust";
}): Promise<LocationInventoryMutationResult> {
  const merchantId = text(params.merchantId, "merchant_id", 128);
  const locationId = text(params.locationId, "location_id", 160);
  const productId = text(params.productId, "product_id", 160);
  const variantId = optionalText(params.variantId, "variant_id", 160);
  const expectedVersion = positiveVersion(params.expectedVersion);
  const quantity =
    params.operation === "set"
      ? nonNegativeInteger(params.quantity, "quantity")
      : undefined;
  const delta =
    params.operation === "adjust"
      ? signedInteger(params.delta, "delta")
      : undefined;
  const keyHash = idempotencyHash(params.idempotencyKey);
  const actorAccountId = optionalText(params.actorAccountId, "actor_account_id", 200);
  const reason = optionalText(params.reason, "reason", 500);
  const hash = requestHash({
    operation: params.operation,
    location_id: locationId,
    product_id: productId,
    variant_id: variantId || null,
    expected_version: expectedVersion,
    quantity: quantity ?? null,
    delta: delta ?? null,
    reason: reason || null,
  });

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const replay = await replayMutation(client, {
      merchantId, locationId, productId, variantId, keyHash, requestHash: hash,
    });
    if (replay) return { level: replay, replayed: true };

    await requireLocation(client, merchantId, locationId);
    await requireInventoryScope(client, merchantId, productId, variantId);
    const current = await requireLevel(client, {
      merchantId, locationId, productId, variantId, lock: true,
    });
    if (current.version !== expectedVersion) {
      throw new LocationInventoryAuthorityError(
        "LOCATION_INVENTORY_VERSION_CONFLICT",
        "location inventory level was changed by another request",
        409,
        {
          expected_version: expectedVersion,
          current_version: current.version,
          current_level: current,
        },
      );
    }

    const after =
      params.operation === "set"
        ? Number(quantity)
        : current.quantity + Number(delta);
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new LocationInventoryAuthorityError(
        "LOCATION_INVENTORY_NEGATIVE_STOCK",
        "inventory mutation would make location stock negative",
        409,
        { current_quantity: current.quantity, delta: delta ?? null },
      );
    }

    const rows = await operationalQueryRows<LevelRow>(
      client,
      `UPDATE location_inventory_levels
          SET quantity = $5,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1
          AND location_id = $2
          AND product_id = $3
          AND variant_id IS NOT DISTINCT FROM $4
          AND version = $6
        RETURNING id, merchant_id, location_id, product_id, variant_id,
                  quantity, low_stock_threshold, version, created_at, updated_at`,
      [
        merchantId,
        locationId,
        productId,
        variantId || null,
        after,
        expectedVersion,
      ],
    );
    if (!rows[0]) {
      throw new LocationInventoryAuthorityError(
        "LOCATION_INVENTORY_VERSION_CONFLICT",
        "location inventory level was changed by another request",
        409,
      );
    }
    const level = toLevel(rows[0]);
    await recordMutation(client, {
      merchantId,
      locationId,
      productId,
      variantId,
      mutationType: params.operation,
      before: current.quantity,
      after,
      expectedVersion,
      resultingVersion: level.version,
      actorAccountId,
      reasonCode:
        reason ||
        (params.operation === "set"
          ? "location_inventory_set"
          : "location_inventory_adjust"),
      keyHash,
      requestHash: hash,
    });
    await markFresh(client, merchantId, locationId);
    return { level, replayed: false };
  });
}

export async function setLocationInventoryLevelAuthoritative(params: {
  merchantId: unknown;
  locationId: unknown;
  productId: unknown;
  variantId?: unknown;
  expectedVersion: unknown;
  quantity: unknown;
  idempotencyKey: unknown;
  actorAccountId?: unknown;
  reason?: unknown;
}): Promise<LocationInventoryMutationResult> {
  return mutateLocationInventoryLevel({ ...params, operation: "set" });
}

export async function adjustLocationInventoryLevelAuthoritative(params: {
  merchantId: unknown;
  locationId: unknown;
  productId: unknown;
  variantId?: unknown;
  expectedVersion: unknown;
  delta: unknown;
  idempotencyKey: unknown;
  actorAccountId?: unknown;
  reason?: unknown;
}): Promise<LocationInventoryMutationResult> {
  return mutateLocationInventoryLevel({ ...params, operation: "adjust" });
}
