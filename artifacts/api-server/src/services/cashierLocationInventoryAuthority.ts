import crypto from "node:crypto";
import { resolveCashierLocationForBranch } from "./cashierLocationBindingAuthority";
import {
  catalogCommerceFieldsOf,
  catalogCommerceFromMetadata,
} from "./catalogCommerceMetadata";
import type {
  CatalogProduct,
  CatalogProductStatus,
} from "./catalogInventoryRuntime";
import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type LocationRow = {
  id: string;
  is_default: boolean;
  status: string;
};

type ProductRow = {
  id: string;
  quantity: number;
  low_stock_threshold: number;
  variant_stock_mode: boolean;
  version: number;
  status: string;
  metadata: Record<string, unknown> | null;
};

type VariantRow = {
  id: string;
  quantity: number;
  metadata: Record<string, unknown> | null;
};

type LevelRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  on_hand_quantity: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  version: number;
  inventory_fresh_at: Date | string;
};

export type CashierLocationInventoryMutationResult =
  | { tracked: false }
  | {
      tracked: true;
      location_id: string;
      before_on_hand_quantity: number;
      after_on_hand_quantity: number;
      before_reserved_quantity: number;
      after_reserved_quantity: number;
      location_expected_version: number;
      location_resulting_version: number;
      legacy_before_quantity: number;
      legacy_after_quantity: number;
      product_expected_version: number;
      product_resulting_version: number;
    };

export class CashierLocationInventoryError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CashierLocationInventoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function itemKey(productId: string, variantId?: string | null): string {
  return `${productId}\u0000${variantId || ""}`;
}

function deterministicLevelId(input: {
  merchantId: string;
  locationId: string;
  productId: string;
  variantId?: string;
}): string {
  return `location_inventory_${crypto
    .createHash("sha256")
    .update(
      `${input.merchantId}\0${input.locationId}\0${input.productId}\0${input.variantId || ""}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 40)}`;
}

function safeNonNegative(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_STATE_INVALID",
      `${field} is invalid`,
      500,
      { field },
    );
  }
  return parsed;
}

function locationStatus(
  currentStatus: string,
  quantity: number,
  lowStockThreshold: number,
): CatalogProductStatus {
  if (currentStatus === "draft" || currentStatus === "hidden_from_fawri") {
    return currentStatus;
  }
  if (quantity === 0) return "out_of_stock";
  if (quantity <= lowStockThreshold) return "low_stock";
  return "available";
}

async function requireActiveLocation(
  target: OperationalQueryTarget,
  merchantId: string,
  locationId: string,
  allowInactive = false,
): Promise<LocationRow> {
  const rows = await operationalQueryRows<LocationRow>(
    target,
    `SELECT id, is_default, status
       FROM merchant_locations
      WHERE merchant_id = $1
        AND id = $2
      LIMIT 1`,
    [merchantId, locationId],
  );
  const location = rows[0];
  if (!location) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_NOT_FOUND",
      "cashier location was not found",
      409,
      { location_id: locationId },
    );
  }
  if (!allowInactive && location.status !== "active") {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INACTIVE",
      "cashier location is disabled",
      409,
      { location_id: locationId },
    );
  }
  return location;
}

async function ensureLocationInventoryRows(
  target: OperationalQueryTarget,
  merchantId: string,
  location: LocationRow,
): Promise<void> {
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
           p.merchant_id || ':' || $2 || ':' || p.id || ':'
         ),
         1,
         32
       ),
       p.merchant_id,
       $2,
       p.id,
       NULL,
       CASE WHEN $3::boolean THEN p.quantity ELSE 0 END,
       0,
       p.low_stock_threshold,
       1,
       now(),
       now(),
       now()
     FROM products AS p
     WHERE p.merchant_id = $1
       AND p.deleted_at IS NULL
       AND p.variant_stock_mode = FALSE
       AND COALESCE(
         p.metadata->'fawri_catalog_v2'->>'item_type',
         'product'
       ) = 'product'
       AND (
         jsonb_typeof(
           p.metadata->'fawri_catalog_v2'->'track_inventory'
         ) IS DISTINCT FROM 'boolean'
         OR (
           p.metadata->'fawri_catalog_v2'->>'track_inventory'
         )::boolean = TRUE
       )
     ON CONFLICT DO NOTHING`,
    [merchantId, location.id, location.is_default],
  );

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
           v.merchant_id || ':' || $2 || ':' || v.product_id || ':' || v.id
         ),
         1,
         32
       ),
       v.merchant_id,
       $2,
       v.product_id,
       v.id,
       CASE WHEN $3::boolean THEN v.quantity ELSE 0 END,
       0,
       p.low_stock_threshold,
       1,
       now(),
       now(),
       now()
     FROM product_variants AS v
     JOIN products AS p
       ON p.id = v.product_id
      AND p.merchant_id = v.merchant_id
     WHERE v.merchant_id = $1
       AND p.deleted_at IS NULL
       AND p.variant_stock_mode = TRUE
       AND COALESCE(v.metadata->>'catalog_archived', 'false') <> 'true'
       AND COALESCE(
         p.metadata->'fawri_catalog_v2'->>'item_type',
         'product'
       ) = 'product'
       AND (
         jsonb_typeof(
           p.metadata->'fawri_catalog_v2'->'track_inventory'
         ) IS DISTINCT FROM 'boolean'
         OR (
           p.metadata->'fawri_catalog_v2'->>'track_inventory'
         )::boolean = TRUE
       )
     ON CONFLICT DO NOTHING`,
    [merchantId, location.id, location.is_default],
  );
}

async function ensureDefaultAndCurrentInventoryRows(
  target: OperationalQueryTarget,
  merchantId: string,
  currentLocation: LocationRow,
): Promise<void> {
  const defaultBinding = await resolveCashierLocationForBranch(target, {
    merchantId,
    branchKey: "main",
  });
  const rows = await operationalQueryRows<LocationRow>(
    target,
    `SELECT id, is_default, status
       FROM merchant_locations
      WHERE merchant_id = $1
        AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, defaultBinding.id],
  );
  const defaultLocation = rows[0];
  if (!defaultLocation || !defaultLocation.is_default) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_STATE_INVALID",
      "default merchant location could not be loaded",
      500,
    );
  }

  await ensureLocationInventoryRows(target, merchantId, defaultLocation);
  if (currentLocation.id !== defaultLocation.id) {
    await ensureLocationInventoryRows(target, merchantId, currentLocation);
  }
}

export async function projectCashierCatalogForLocationAuthoritative(input: {
  merchantId: string;
  locationId: string;
  products: CatalogProduct[];
}): Promise<{
  location_id: string;
  products: CatalogProduct[];
}> {
  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const location = await requireActiveLocation(
      client,
      input.merchantId,
      input.locationId,
    );
    await ensureDefaultAndCurrentInventoryRows(
      client,
      input.merchantId,
      location,
    );

    const rows = await operationalQueryRows<LevelRow>(
      client,
      `SELECT
         id,
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
      ORDER BY product_id, variant_id NULLS FIRST`,
      [input.merchantId, input.locationId],
    );
    const levels = new Map(
      rows.map((row) => [itemKey(row.product_id, row.variant_id), row]),
    );

    const products = input.products.map((product) => {
      const commerce = catalogCommerceFieldsOf(product);
      const tracked =
        commerce.item_type === "product" && commerce.track_inventory;
      if (!tracked) return structuredClone(product);

      if (product.variants.length > 0) {
        let total = 0;
        const variants = product.variants.map((variant) => {
          const level = levels.get(itemKey(product.id, variant.id));
          const stock = level
            ? safeNonNegative(level.on_hand_quantity, "variant on_hand_quantity")
            : 0;
          total += stock;
          if (!Number.isSafeInteger(total)) {
            throw new CashierLocationInventoryError(
              "CASHIER_LOCATION_INVENTORY_STATE_INVALID",
              "location variant stock total overflow",
              500,
            );
          }
          return {
            ...variant,
            stock_quantity: stock,
          };
        });
        return {
          ...product,
          variants,
          stock_quantity: total,
          status: locationStatus(
            product.status,
            total,
            product.low_stock_threshold,
          ),
        };
      }

      const level = levels.get(itemKey(product.id));
      const stock = level
        ? safeNonNegative(level.on_hand_quantity, "product on_hand_quantity")
        : 0;
      return {
        ...product,
        stock_quantity: stock,
        status: locationStatus(
          product.status,
          stock,
          level
            ? safeNonNegative(
                level.low_stock_threshold,
                "location low_stock_threshold",
              )
            : product.low_stock_threshold,
        ),
      };
    });

    return {
      location_id: input.locationId,
      products,
    };
  });
}

async function ensureAndLockItemLevel(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    location: LocationRow;
    productId: string;
    variantId?: string;
    fallbackQuantity: number;
    lowStockThreshold: number;
  },
): Promise<LevelRow> {
  const params = [
    input.merchantId,
    input.location.id,
    input.productId,
    input.variantId || null,
  ];
  let rows = await operationalQueryRows<LevelRow>(
    target,
    `SELECT
       id,
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
    params,
  );
  if (rows[0]) return rows[0];

  const initialQuantity = input.location.is_default
    ? input.fallbackQuantity
    : 0;
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
     ) VALUES (
       $1,$2,$3,$4,$5,$6,0,$7,1,now(),now(),now()
     )
     ON CONFLICT DO NOTHING`,
    [
      deterministicLevelId({
        merchantId: input.merchantId,
        locationId: input.location.id,
        productId: input.productId,
        ...(input.variantId ? { variantId: input.variantId } : {}),
      }),
      input.merchantId,
      input.location.id,
      input.productId,
      input.variantId || null,
      initialQuantity,
      input.lowStockThreshold,
    ],
  );

  rows = await operationalQueryRows<LevelRow>(
    target,
    `SELECT
       id,
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
    params,
  );
  if (!rows[0]) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_STATE_INVALID",
      "location inventory row could not be created",
      500,
      {
        location_id: input.location.id,
        product_id: input.productId,
        ...(input.variantId ? { variant_id: input.variantId } : {}),
      },
    );
  }
  return rows[0];
}

async function aggregateLocationInventory(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    productId: string;
    variantId?: string;
    variantMode: boolean;
  },
): Promise<number> {
  if (input.variantId) {
    const rows = await operationalQueryRows<{ total: string | number }>(
      target,
      `SELECT COALESCE(SUM(on_hand_quantity), 0)::bigint AS total
         FROM location_inventory_levels
        WHERE merchant_id = $1
          AND product_id = $2
          AND variant_id = $3`,
      [input.merchantId, input.productId, input.variantId],
    );
    return safeNonNegative(rows[0]?.total ?? 0, "variant aggregate stock");
  }

  const rows = await operationalQueryRows<{ total: string | number }>(
    target,
    input.variantMode
      ? `SELECT COALESCE(SUM(level.on_hand_quantity), 0)::bigint AS total
           FROM location_inventory_levels AS level
           JOIN product_variants AS variant
             ON variant.id = level.variant_id
            AND variant.product_id = level.product_id
            AND variant.merchant_id = level.merchant_id
          WHERE level.merchant_id = $1
            AND level.product_id = $2
            AND level.variant_id IS NOT NULL
            AND COALESCE(variant.metadata->>'catalog_archived', 'false') <> 'true'`
      : `SELECT COALESCE(SUM(on_hand_quantity), 0)::bigint AS total
           FROM location_inventory_levels
          WHERE merchant_id = $1
            AND product_id = $2
            AND variant_id IS NULL`,
    [input.merchantId, input.productId],
  );
  return safeNonNegative(rows[0]?.total ?? 0, "product aggregate stock");
}

export async function mutateCashierLocationInventoryInTransaction(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    locationId: string;
    productId: string;
    variantId?: string;
    delta: number;
    expectedLocationVersion?: number;
    allowInactiveLocation?: boolean;
  },
): Promise<CashierLocationInventoryMutationResult> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_DELTA_INVALID",
      "location inventory delta is invalid",
      400,
    );
  }

  const location = await requireActiveLocation(
    target,
    input.merchantId,
    input.locationId,
    input.allowInactiveLocation === true,
  );
  await ensureDefaultAndCurrentInventoryRows(
    target,
    input.merchantId,
    location,
  );

  const productRows = await operationalQueryRows<ProductRow>(
    target,
    `SELECT
       id,
       quantity,
       low_stock_threshold,
       variant_stock_mode,
       version,
       status,
       metadata
     FROM products
    WHERE merchant_id = $1
      AND id = $2
      AND deleted_at IS NULL
    LIMIT 1
    FOR UPDATE`,
    [input.merchantId, input.productId],
  );
  const product = productRows[0];
  if (!product) {
    throw new CashierLocationInventoryError(
      "CASHIER_SYNC_PRODUCT_NOT_FOUND",
      "cashier sale product no longer exists",
      409,
      { product_id: input.productId },
    );
  }

  const commerce = catalogCommerceFromMetadata(product.metadata);
  if (!commerce.track_inventory) return { tracked: false };

  const lowStockThreshold = safeNonNegative(
    product.low_stock_threshold,
    "product low_stock_threshold",
  );
  const variantMode = Boolean(product.variant_stock_mode);
  let fallbackQuantity: number;
  let legacyBeforeQuantity: number;

  if (variantMode) {
    if (!input.variantId) {
      throw new CashierLocationInventoryError(
        "CASHIER_SYNC_VARIANT_REQUIRED",
        "variant id is required",
        409,
        { product_id: input.productId },
      );
    }
    const variantRows = await operationalQueryRows<VariantRow>(
      target,
      `SELECT id, quantity, metadata
         FROM product_variants
        WHERE merchant_id = $1
          AND product_id = $2
          AND id = $3
        LIMIT 1
        FOR UPDATE`,
      [input.merchantId, input.productId, input.variantId],
    );
    const variant = variantRows[0];
    if (
      !variant ||
      String(variant.metadata?.catalog_archived || "false") === "true"
    ) {
      throw new CashierLocationInventoryError(
        "CASHIER_SYNC_VARIANT_NOT_FOUND",
        "cashier sale variant no longer exists",
        409,
        {
          product_id: input.productId,
          variant_id: input.variantId,
        },
      );
    }
    fallbackQuantity = safeNonNegative(
      variant.quantity,
      "legacy variant quantity",
    );
    legacyBeforeQuantity = fallbackQuantity;
  } else {
    if (input.variantId) {
      throw new CashierLocationInventoryError(
        "CASHIER_SYNC_VARIANT_NOT_FOUND",
        "cashier sale variant no longer exists",
        409,
        {
          product_id: input.productId,
          variant_id: input.variantId,
        },
      );
    }
    fallbackQuantity = safeNonNegative(
      product.quantity,
      "legacy product quantity",
    );
    legacyBeforeQuantity = fallbackQuantity;
  }

  const level = await ensureAndLockItemLevel(target, {
    merchantId: input.merchantId,
    location,
    productId: input.productId,
    ...(input.variantId ? { variantId: input.variantId } : {}),
    fallbackQuantity,
    lowStockThreshold,
  });
  const beforeOnHand = safeNonNegative(
    level.on_hand_quantity,
    "location on_hand_quantity",
  );
  const beforeReserved = safeNonNegative(
    level.reserved_quantity,
    "location reserved_quantity",
  );
  const afterOnHand = beforeOnHand + input.delta;
  if (
    !Number.isSafeInteger(afterOnHand) ||
    afterOnHand < 0 ||
    afterOnHand < beforeReserved
  ) {
    throw new CashierLocationInventoryError(
      "CASHIER_SYNC_NEGATIVE_STOCK",
      "location stock is insufficient for cashier operation",
      409,
      {
        location_id: input.locationId,
        product_id: input.productId,
        ...(input.variantId ? { variant_id: input.variantId } : {}),
        current_quantity: beforeOnHand,
        reserved_quantity: beforeReserved,
        delta: input.delta,
      },
    );
  }

  const locationExpectedVersion = safeNonNegative(
    level.version,
    "location inventory version",
  );
  if (locationExpectedVersion <= 0) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_STATE_INVALID",
      "location inventory version is invalid",
      500,
    );
  }
  if (
    input.expectedLocationVersion !== undefined &&
    locationExpectedVersion !== input.expectedLocationVersion
  ) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_VERSION_CONFLICT",
      "location inventory changed before the requested mutation",
      409,
      {
        location_id: input.locationId,
        product_id: input.productId,
        ...(input.variantId ? { variant_id: input.variantId } : {}),
        expected_version: input.expectedLocationVersion,
        current_version: locationExpectedVersion,
      },
    );
  }
  const locationResultingVersion = locationExpectedVersion + 1;
  const updatedLevel = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE location_inventory_levels
        SET on_hand_quantity = $5,
            version = version + 1,
            inventory_fresh_at = now(),
            updated_at = now()
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
        AND variant_id IS NOT DISTINCT FROM $4::text
        AND version = $6
      RETURNING id`,
    [
      input.merchantId,
      input.locationId,
      input.productId,
      input.variantId || null,
      afterOnHand,
      locationExpectedVersion,
    ],
  );
  if (updatedLevel.length !== 1) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_VERSION_CONFLICT",
      "location inventory changed during cashier reconciliation",
      409,
      {
        location_id: input.locationId,
        product_id: input.productId,
        ...(input.variantId ? { variant_id: input.variantId } : {}),
      },
    );
  }

  let legacyAfterQuantity: number;
  if (variantMode && input.variantId) {
    legacyAfterQuantity = await aggregateLocationInventory(target, {
      merchantId: input.merchantId,
      productId: input.productId,
      variantId: input.variantId,
      variantMode: true,
    });
    await target.query(
      `UPDATE product_variants
          SET quantity = $4,
              updated_at = now()
        WHERE merchant_id = $1
          AND product_id = $2
          AND id = $3`,
      [
        input.merchantId,
        input.productId,
        input.variantId,
        legacyAfterQuantity,
      ],
    );
  } else {
    legacyAfterQuantity = await aggregateLocationInventory(target, {
      merchantId: input.merchantId,
      productId: input.productId,
      variantMode: false,
    });
  }

  const productAggregate = await aggregateLocationInventory(target, {
    merchantId: input.merchantId,
    productId: input.productId,
    variantMode,
  });
  const productExpectedVersion = safeNonNegative(
    product.version,
    "product version",
  );
  if (productExpectedVersion <= 0) {
    throw new CashierLocationInventoryError(
      "CASHIER_LOCATION_INVENTORY_STATE_INVALID",
      "product version is invalid",
      500,
    );
  }
  const productResultingVersion = productExpectedVersion + 1;
  const nextStatus = locationStatus(
    product.status,
    productAggregate,
    lowStockThreshold,
  );
  const updatedProduct = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE products
        SET quantity = $3,
            version = version + 1,
            status = $4,
            updated_at = now()
      WHERE merchant_id = $1
        AND id = $2
        AND version = $5
        AND deleted_at IS NULL
      RETURNING id`,
    [
      input.merchantId,
      input.productId,
      productAggregate,
      nextStatus,
      productExpectedVersion,
    ],
  );
  if (updatedProduct.length !== 1) {
    throw new CashierLocationInventoryError(
      "CASHIER_SYNC_PRODUCT_VERSION_CONFLICT",
      "catalog changed during cashier location reconciliation",
      409,
      { product_id: input.productId },
    );
  }

  return {
    tracked: true,
    location_id: input.locationId,
    before_on_hand_quantity: beforeOnHand,
    after_on_hand_quantity: afterOnHand,
    before_reserved_quantity: beforeReserved,
    after_reserved_quantity: beforeReserved,
    location_expected_version: locationExpectedVersion,
    location_resulting_version: locationResultingVersion,
    legacy_before_quantity: legacyBeforeQuantity,
    legacy_after_quantity: legacyAfterQuantity,
    product_expected_version: productExpectedVersion,
    product_resulting_version: productResultingVersion,
  };
}
