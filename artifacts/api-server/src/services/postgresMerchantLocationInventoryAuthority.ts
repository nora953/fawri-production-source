import crypto from "node:crypto";

import {
  CashierLocationInventoryError,
  mutateCashierLocationInventoryInTransaction,
} from "./cashierLocationInventoryAuthority";
import { resolveCashierLocationForBranch } from "./cashierLocationBindingAuthority";
import { CatalogRuntimeError } from "./catalogInventoryRuntime";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type LocationRow = {
  id: string;
  name: string;
  status: string;
  operational_status: string;
  is_default: boolean;
  legacy_branch_key: string | null;
};

type ProductRow = {
  id: string;
  version: number;
  variant_stock_mode: boolean;
  metadata: Record<string, unknown> | null;
};

type LevelRow = {
  location_id: string;
  product_id: string;
  variant_id: string | null;
  on_hand_quantity: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  version: number;
  inventory_fresh_at: Date | string;
};

type ExistingMutationRow = {
  request_hash: string;
};

export type MerchantInventoryLocation = {
  id: string;
  name: string;
  is_default: boolean;
  status: string;
  operational_status: string;
  legacy_branch_key?: string;
};

export type MerchantProductLocationInventory = {
  merchant_id: string;
  product_id: string;
  product_version: number;
  variant_stock_mode: boolean;
  locations: Array<{
    id: string;
    name: string;
    is_default: boolean;
    status: string;
    operational_status: string;
    legacy_branch_key?: string;
    levels: Array<{
      variant_id?: string;
      on_hand_quantity: number;
      reserved_quantity: number;
      available_quantity: number;
      low_stock_threshold: number;
      version: number;
      inventory_fresh_at: string;
    }>;
  }>;
};

export type MerchantLocationInventoryMutationResult = {
  replayed: boolean;
  mutated: boolean;
  product_id: string;
  location_id: string;
};

function text(value: unknown, field: string, max = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new CatalogRuntimeError(
      "CATALOG_FIELD_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max = 500): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, max);
}

function nonNegativeInteger(value: unknown, field: string): number {
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

function expectedVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CatalogRuntimeError(
      "CATALOG_VERSION_REQUIRED",
      "expected_version must be a positive integer",
      400,
    );
  }
  return parsed;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stableRequestHash(value: Record<string, unknown>): string {
  const normalized = Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
  return sha256(JSON.stringify(normalized));
}

function tracksInventory(metadata: Record<string, unknown> | null): boolean {
  const root =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    metadata.fawri_catalog_v2 &&
    typeof metadata.fawri_catalog_v2 === "object" &&
    !Array.isArray(metadata.fawri_catalog_v2)
      ? (metadata.fawri_catalog_v2 as Record<string, unknown>)
      : {};
  const itemType = String(root.item_type || "product").trim();
  const tracked =
    typeof root.track_inventory === "boolean"
      ? root.track_inventory
      : true;
  return itemType === "product" && tracked;
}

function requirePostgres(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CatalogRuntimeError(
      "CATALOG_LOCATION_INVENTORY_POSTGRES_REQUIRED",
      "location inventory requires PostgreSQL authority",
      503,
    );
  }
}

async function ensureDefaultLocation(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  await resolveCashierLocationForBranch(target, {
    merchantId,
    branchKey: "main",
    branchLabel: "Main Location",
  });
}

async function activeLocations(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<LocationRow[]> {
  await ensureDefaultLocation(target, merchantId);
  return operationalQueryRows<LocationRow>(
    target,
    `SELECT
       id,
       name,
       status,
       operational_status,
       is_default,
       legacy_branch_key
     FROM merchant_locations
    WHERE merchant_id = $1
      AND status = 'active'
    ORDER BY is_default DESC, name, id`,
    [merchantId],
  );
}

async function productRow(
  target: OperationalQueryTarget,
  merchantId: string,
  productId: string,
  lock = false,
): Promise<ProductRow> {
  const rows = await operationalQueryRows<ProductRow>(
    target,
    `SELECT id, version, variant_stock_mode, metadata
       FROM products
      WHERE merchant_id = $1
        AND id = $2
        AND deleted_at IS NULL
      LIMIT 1
      ${lock ? "FOR UPDATE" : ""}`,
    [merchantId, productId],
  );
  const product = rows[0];
  if (!product) {
    throw new CatalogRuntimeError(
      "CATALOG_PRODUCT_NOT_FOUND",
      "catalog product was not found",
      404,
      { product_id: productId },
    );
  }
  if (!tracksInventory(product.metadata)) {
    throw new CatalogRuntimeError(
      "CATALOG_INVENTORY_NOT_TRACKED",
      "inventory mutations are disabled for this catalog item",
      409,
      { product_id: productId },
    );
  }
  return product;
}

async function requireActiveLocation(
  target: OperationalQueryTarget,
  merchantId: string,
  locationId: string,
): Promise<LocationRow> {
  const rows = await operationalQueryRows<LocationRow>(
    target,
    `SELECT
       id,
       name,
       status,
       operational_status,
       is_default,
       legacy_branch_key
     FROM merchant_locations
    WHERE merchant_id = $1
      AND id = $2
    LIMIT 1
    FOR UPDATE`,
    [merchantId, locationId],
  );
  const location = rows[0];
  if (!location) {
    throw new CatalogRuntimeError(
      "CATALOG_LOCATION_NOT_FOUND",
      "inventory location was not found",
      404,
      { location_id: locationId },
    );
  }
  if (location.status !== "active") {
    throw new CatalogRuntimeError(
      "CATALOG_LOCATION_INACTIVE",
      "inventory location is disabled",
      409,
      { location_id: locationId },
    );
  }
  return location;
}

async function materializeProductLevels(
  target: OperationalQueryTarget,
  merchantId: string,
  productId: string,
): Promise<void> {
  await activeLocations(target, merchantId);
  const product = await productRow(target, merchantId, productId);

  if (product.variant_stock_mode) {
    await target.query(
      `INSERT INTO location_inventory_levels (
         id,
         merchant_id,
         location_id,
         product_id,
         variant_id,
         on_hand_quantity,
         reserved_quantity,
         low_stock_threshold,
         version,
         inventory_fresh_at,
         created_at,
         updated_at
       )
       SELECT
         'location_inventory_' || substr(
           md5(
             variant.merchant_id || ':' || location.id || ':' ||
             variant.product_id || ':' || variant.id
           ),
           1,
           32
         ),
         variant.merchant_id,
         location.id,
         variant.product_id,
         variant.id,
         CASE WHEN location.is_default THEN variant.quantity ELSE 0 END,
         0,
         product.low_stock_threshold,
         1,
         now(),
         now(),
         now()
       FROM product_variants AS variant
       JOIN products AS product
         ON product.id = variant.product_id
        AND product.merchant_id = variant.merchant_id
       JOIN merchant_locations AS location
         ON location.merchant_id = variant.merchant_id
        AND location.status = 'active'
       WHERE variant.merchant_id = $1
         AND variant.product_id = $2
         AND product.deleted_at IS NULL
         AND product.variant_stock_mode = TRUE
         AND COALESCE(variant.metadata->>'catalog_archived', 'false') <> 'true'
       ON CONFLICT DO NOTHING`,
      [merchantId, productId],
    );
    return;
  }

  await target.query(
    `INSERT INTO location_inventory_levels (
       id,
       merchant_id,
       location_id,
       product_id,
       variant_id,
       on_hand_quantity,
       reserved_quantity,
       low_stock_threshold,
       version,
       inventory_fresh_at,
       created_at,
       updated_at
     )
     SELECT
       'location_inventory_' || substr(
         md5(
           product.merchant_id || ':' || location.id || ':' ||
           product.id || ':'
         ),
         1,
         32
       ),
       product.merchant_id,
       location.id,
       product.id,
       NULL,
       CASE WHEN location.is_default THEN product.quantity ELSE 0 END,
       0,
       product.low_stock_threshold,
       1,
       now(),
       now(),
       now()
     FROM products AS product
     JOIN merchant_locations AS location
       ON location.merchant_id = product.merchant_id
      AND location.status = 'active'
     WHERE product.merchant_id = $1
       AND product.id = $2
       AND product.deleted_at IS NULL
       AND product.variant_stock_mode = FALSE
     ON CONFLICT DO NOTHING`,
    [merchantId, productId],
  );
}

function iso(value: Date | string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new CatalogRuntimeError(
      "CATALOG_LOCATION_INVENTORY_STATE_INVALID",
      "inventory freshness timestamp is invalid",
      503,
    );
  }
  return parsed.toISOString();
}

function locationDto(row: LocationRow): MerchantInventoryLocation {
  return {
    id: row.id,
    name: row.name,
    is_default: row.is_default,
    status: row.status,
    operational_status: row.operational_status,
    ...(row.legacy_branch_key
      ? { legacy_branch_key: row.legacy_branch_key }
      : {}),
  };
}

export async function listMerchantInventoryLocationsAuthoritative(
  merchantIdValue: unknown,
): Promise<MerchantInventoryLocation[]> {
  requirePostgres();
  const merchantId = text(merchantIdValue, "merchant_id", 128);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const rows = await activeLocations(client, merchantId);
    return rows.map(locationDto);
  });
}

export async function getMerchantProductLocationInventoryAuthoritative(input: {
  merchantId: unknown;
  productId: unknown;
}): Promise<MerchantProductLocationInventory> {
  requirePostgres();
  const merchantId = text(input.merchantId, "merchant_id", 128);
  const productId = text(input.productId, "product_id", 160);

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await materializeProductLevels(client, merchantId, productId);
    const product = await productRow(client, merchantId, productId);
    const locations = await activeLocations(client, merchantId);
    const levels = await operationalQueryRows<LevelRow>(
      client,
      `SELECT
         location_id,
         product_id,
         variant_id,
         on_hand_quantity,
         reserved_quantity,
         low_stock_threshold,
         version,
         inventory_fresh_at
       FROM location_inventory_levels
      WHERE merchant_id = $1
        AND product_id = $2
        AND location_id = ANY($3::text[])
      ORDER BY location_id, variant_id NULLS FIRST`,
      [merchantId, productId, locations.map((location) => location.id)],
    );
    const byLocation = new Map<string, LevelRow[]>();
    for (const level of levels) {
      const list = byLocation.get(level.location_id) || [];
      list.push(level);
      byLocation.set(level.location_id, list);
    }

    return {
      merchant_id: merchantId,
      product_id: productId,
      product_version: product.version,
      variant_stock_mode: product.variant_stock_mode,
      locations: locations.map((location) => ({
        ...locationDto(location),
        levels: (byLocation.get(location.id) || []).map((level) => ({
          ...(level.variant_id ? { variant_id: level.variant_id } : {}),
          on_hand_quantity: Number(level.on_hand_quantity),
          reserved_quantity: Number(level.reserved_quantity),
          available_quantity:
            Number(level.on_hand_quantity) - Number(level.reserved_quantity),
          low_stock_threshold: Number(level.low_stock_threshold),
          version: Number(level.version),
          inventory_fresh_at: iso(level.inventory_fresh_at),
        })),
      })),
    };
  });
}

async function replayForKey(
  target: OperationalQueryTarget,
  merchantId: string,
  keyHash: string,
  requestHash: string,
): Promise<boolean> {
  const rows = await operationalQueryRows<ExistingMutationRow>(
    target,
    `SELECT request_hash
       FROM location_inventory_mutations
      WHERE merchant_id = $1
        AND idempotency_key_hash = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, keyHash],
  );
  const existing = rows[0];
  if (!existing) return false;
  if (existing.request_hash !== requestHash) {
    throw new CatalogRuntimeError(
      "CATALOG_IDEMPOTENCY_CONFLICT",
      "inventory idempotency key was already used with different content",
      409,
    );
  }
  return true;
}

async function writeMutationAudit(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    locationId: string;
    productId: string;
    variantId?: string;
    mutationType: "set" | "adjust";
    reasonCode: string;
    keyHash: string;
    requestHash: string;
    operationId: string;
    occurredAt: Date;
    mutation: Extract<
      Awaited<ReturnType<typeof mutateCashierLocationInventoryInTransaction>>,
      { tracked: true }
    >;
  },
): Promise<void> {
  await target.query(
    `INSERT INTO location_inventory_mutations (
       id, merchant_id, location_id, product_id, variant_id, mutation_type,
       before_on_hand_quantity, after_on_hand_quantity,
       before_reserved_quantity, after_reserved_quantity,
       expected_version, resulting_version, actor_type, actor_account_id,
       operation_id, reason_code, idempotency_key_hash, request_hash,
       occurred_at, created_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
       'merchant',$2,$13,$14,$15,$16,$17,now()
     )`,
    [
      `merchant_loc_mut_${input.keyHash.slice(0, 35)}`,
      input.merchantId,
      input.locationId,
      input.productId,
      input.variantId || null,
      input.mutationType,
      input.mutation.before_on_hand_quantity,
      input.mutation.after_on_hand_quantity,
      input.mutation.before_reserved_quantity,
      input.mutation.after_reserved_quantity,
      input.mutation.location_expected_version,
      input.mutation.location_resulting_version,
      input.operationId,
      input.reasonCode,
      input.keyHash,
      input.requestHash,
      input.occurredAt,
    ],
  );

  await target.query(
    `INSERT INTO inventory_mutations (
       id, merchant_id, product_id, variant_id, mutation_type,
       before_quantity, after_quantity, expected_version, resulting_version,
       actor_type, actor_account_id, reason_code, idempotency_key_hash,
       request_hash, created_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,'merchant',$2,$10,$11,$12,$13
     )`,
    [
      `merchant_mut_${input.keyHash.slice(0, 40)}`,
      input.merchantId,
      input.productId,
      input.variantId || null,
      input.mutationType,
      input.mutation.legacy_before_quantity,
      input.mutation.legacy_after_quantity,
      input.mutation.product_expected_version,
      input.mutation.product_resulting_version,
      input.reasonCode,
      input.keyHash,
      input.requestHash,
      input.occurredAt,
    ],
  );
}

async function mutateMerchantLocationInventory(input: {
  merchantId: string;
  locationId: string;
  productId: string;
  variantId?: string;
  expectedVersion: number;
  mode: "set" | "adjust";
  quantity?: number;
  delta?: number;
  idempotencyKey?: string;
  reason?: string;
}): Promise<MerchantLocationInventoryMutationResult> {
  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    await materializeProductLevels(client, input.merchantId, input.productId);
    await requireActiveLocation(client, input.merchantId, input.locationId);

    const request = {
      merchant_id: input.merchantId,
      location_id: input.locationId,
      product_id: input.productId,
      variant_id: input.variantId || null,
      expected_version: input.expectedVersion,
      mode: input.mode,
      quantity: input.quantity ?? null,
      delta: input.delta ?? null,
      reason: input.reason || null,
    };
    const requestHash = stableRequestHash(request);
    const keyHash =
      input.mode === "adjust"
        ? sha256(
            `merchant-location-adjust:${text(
              input.idempotencyKey,
              "idempotency_key",
              512,
            )}`,
          )
        : sha256(
            `merchant-location-set:${input.merchantId}:${input.locationId}:${input.productId}:${input.variantId || ""}:${input.expectedVersion}:${input.quantity}`,
          );

    if (await replayForKey(client, input.merchantId, keyHash, requestHash)) {
      return {
        replayed: true,
        mutated: false,
        product_id: input.productId,
        location_id: input.locationId,
      };
    }

    const product = await productRow(
      client,
      input.merchantId,
      input.productId,
      true,
    );
    if (product.version !== input.expectedVersion) {
      throw new CatalogRuntimeError(
        "CATALOG_VERSION_CONFLICT",
        "product was changed by another request",
        409,
        {
          expected_version: input.expectedVersion,
          current_version: product.version,
        },
      );
    }

    let delta = input.delta;
    if (input.mode === "set") {
      const rows = await operationalQueryRows<LevelRow>(
        client,
        `SELECT
           location_id,
           product_id,
           variant_id,
           on_hand_quantity,
           reserved_quantity,
           low_stock_threshold,
           version,
           inventory_fresh_at
         FROM location_inventory_levels
        WHERE merchant_id = $1
          AND location_id = $2
          AND product_id = $3
          AND variant_id IS NOT DISTINCT FROM $4::text
        LIMIT 1
        FOR UPDATE`,
        [
          input.merchantId,
          input.locationId,
          input.productId,
          input.variantId || null,
        ],
      );
      const level = rows[0];
      if (!level) {
        throw new CatalogRuntimeError(
          "CATALOG_LOCATION_INVENTORY_STATE_INVALID",
          "location inventory row is missing",
          503,
        );
      }
      delta = Number(input.quantity) - Number(level.on_hand_quantity);
      if (delta === 0) {
        return {
          replayed: false,
          mutated: false,
          product_id: input.productId,
          location_id: input.locationId,
        };
      }
    }

    if (!Number.isSafeInteger(delta) || delta === 0) {
      throw new CatalogRuntimeError(
        "CATALOG_DELTA_INVALID",
        "inventory delta must be a non-zero integer",
        400,
      );
    }

    let mutation;
    try {
      mutation = await mutateCashierLocationInventoryInTransaction(client, {
        merchantId: input.merchantId,
        locationId: input.locationId,
        productId: input.productId,
        ...(input.variantId ? { variantId: input.variantId } : {}),
        delta,
      });
    } catch (error) {
      if (error instanceof CashierLocationInventoryError) {
        throw new CatalogRuntimeError(
          error.code,
          error.message,
          error.status,
          error.details,
        );
      }
      throw error;
    }
    if (!mutation.tracked) {
      throw new CatalogRuntimeError(
        "CATALOG_INVENTORY_NOT_TRACKED",
        "inventory mutations are disabled for this catalog item",
        409,
      );
    }

    const occurredAt = new Date();
    const reasonCode =
      input.mode === "set"
        ? "merchant_location_inventory_set"
        : input.reason || "merchant_location_inventory_adjust";
    await writeMutationAudit(client, {
      merchantId: input.merchantId,
      locationId: input.locationId,
      productId: input.productId,
      ...(input.variantId ? { variantId: input.variantId } : {}),
      mutationType: input.mode,
      reasonCode,
      keyHash,
      requestHash,
      operationId: `merchant_inventory_${keyHash.slice(0, 32)}`,
      occurredAt,
      mutation,
    });

    return {
      replayed: false,
      mutated: true,
      product_id: input.productId,
      location_id: input.locationId,
    };
  });
}

export async function resolveSingleInventoryLocationForCompatibilityAuthoritative(
  merchantIdValue: unknown,
): Promise<string> {
  requirePostgres();
  const merchantId = text(merchantIdValue, "merchant_id", 128);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const locations = await activeLocations(client, merchantId);
    if (locations.length !== 1) {
      throw new CatalogRuntimeError(
        "CATALOG_LOCATION_REQUIRED",
        "location_id is required when the merchant has multiple inventory locations",
        409,
        { location_count: locations.length },
      );
    }
    return locations[0].id;
  });
}

export async function setMerchantLocationInventoryAuthoritative(input: {
  merchantId: unknown;
  locationId: unknown;
  productId: unknown;
  variantId?: unknown;
  expectedVersion: unknown;
  quantity: unknown;
}): Promise<MerchantLocationInventoryMutationResult> {
  requirePostgres();
  const merchantId = text(input.merchantId, "merchant_id", 128);
  const locationId = text(input.locationId, "location_id", 160);
  const productId = text(input.productId, "product_id", 160);
  const variantId = optionalText(input.variantId, "variant_id", 160);
  const version = expectedVersion(input.expectedVersion);
  const quantity = nonNegativeInteger(input.quantity, "quantity");
  return mutateMerchantLocationInventory({
    merchantId,
    locationId,
    productId,
    ...(variantId ? { variantId } : {}),
    expectedVersion: version,
    mode: "set",
    quantity,
  });
}

export async function adjustMerchantLocationInventoryAuthoritative(input: {
  merchantId: unknown;
  locationId: unknown;
  productId: unknown;
  variantId?: unknown;
  expectedVersion: unknown;
  delta: unknown;
  idempotencyKey: unknown;
  reason?: unknown;
}): Promise<MerchantLocationInventoryMutationResult> {
  requirePostgres();
  const merchantId = text(input.merchantId, "merchant_id", 128);
  const locationId = text(input.locationId, "location_id", 160);
  const productId = text(input.productId, "product_id", 160);
  const variantId = optionalText(input.variantId, "variant_id", 160);
  const version = expectedVersion(input.expectedVersion);
  const delta = signedInteger(input.delta, "delta");
  const reason = optionalText(input.reason, "reason", 500);
  return mutateMerchantLocationInventory({
    merchantId,
    locationId,
    productId,
    ...(variantId ? { variantId } : {}),
    expectedVersion: version,
    mode: "adjust",
    delta,
    idempotencyKey: input.idempotencyKey as string,
    ...(reason ? { reason } : {}),
  });
}
