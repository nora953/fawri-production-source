import crypto from "node:crypto";

import { CatalogRuntimeError } from "./catalogInventoryRuntime";
import {
  normalizeCatalogMerchantId,
  normalizeCatalogProductId,
} from "./catalogProductNormalization";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import * as core from "./postgresCatalogAuthorityCore";
import {
  adjustMerchantLocationInventoryAuthoritative,
  resolveSingleInventoryLocationForCompatibilityAuthoritative,
  setMerchantLocationInventoryAuthoritative,
} from "./postgresMerchantLocationInventoryAuthority";

export * from "./postgresCatalogAuthorityCore";

const ARCHIVE_OPTION = "__fawri_archived_variant_id";

type VariantIdentity = {
  id: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function attachmentImageId(
  graphKey: string,
  ownerKey: string,
  value: unknown,
  ordinal: number,
): string {
  const record = typeof value === "string" ? { url: value } : asRecord(value);
  const storageKey = String(record.storage_key || "").trim();
  const url = String(record.url || "").trim();
  return `imgref_${crypto
    .createHash("sha256")
    .update(`${graphKey}\0${ownerKey}\0${storageKey}\0${url}\0${ordinal}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function scopeImageReferences(
  value: unknown,
  graphKey: string,
  ownerKey: string,
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((image, ordinal) => {
    const id = attachmentImageId(graphKey, ownerKey, image, ordinal);
    if (typeof image === "string") {
      return { id, url: image };
    }
    return {
      ...asRecord(image),
      id,
    };
  });
}

/**
 * Catalog media assets may intentionally be reused by the product and by
 * several variants. The database row ID therefore identifies the attachment
 * (owner + media), not the underlying media asset itself.
 */
export function scopeCatalogImageAttachmentIds(
  inputValue: unknown,
  graphKey: string,
): Record<string, unknown> {
  const input = structuredClone(asRecord(inputValue));

  if (Object.prototype.hasOwnProperty.call(input, "image_refs")) {
    input.image_refs = scopeImageReferences(input.image_refs, graphKey, "product");
  }
  if (Object.prototype.hasOwnProperty.call(input, "images")) {
    input.images = scopeImageReferences(input.images, graphKey, "product");
  }
  if (Array.isArray(input.variants)) {
    input.variants = input.variants.map((value, index) => {
      const variant = asRecord(value);
      if (!Object.prototype.hasOwnProperty.call(variant, "image_refs")) {
        return variant;
      }
      const ownerId = String(variant.id || "").trim() || `index-${index}`;
      return {
        ...variant,
        image_refs: scopeImageReferences(
          variant.image_refs,
          graphKey,
          `variant:${ownerId}`,
        ),
      };
    });
  }

  return input;
}

function variantId(value: unknown): string {
  return String(asRecord(value).id || "").trim();
}

function preserveExistingInventoryOnCatalogEdit(
  inputValue: Record<string, unknown>,
  current: Awaited<ReturnType<typeof core.getCatalogProductAuthoritative>>,
): Record<string, unknown> {
  const input = structuredClone(inputValue);
  const hasTopLevelStock =
    Object.prototype.hasOwnProperty.call(input, "stock_quantity") ||
    Object.prototype.hasOwnProperty.call(input, "quantity");

  if (Array.isArray(input.variants)) {
    const existingById = new Map(
      current.variants.map((variant) => [variant.id, variant]),
    );
    const variants = input.variants.map((value) => {
      const variant = { ...asRecord(value) };
      const id = String(variant.id || "").trim();
      const existing = id ? existingById.get(id) : undefined;
      if (!existing) return variant;
      variant.stock_quantity = existing.stock_quantity;
      delete variant.quantity;
      return variant;
    });
    input.variants = variants;

    if (current.variants.length > 0 || variants.length > 0) {
      delete input.stock_quantity;
      delete input.quantity;
    }
    return input;
  }

  if (hasTopLevelStock) {
    input.stock_quantity = current.stock_quantity;
    delete input.quantity;
  }
  return input;
}


function filterArchivedProduct<T>(product: T, archived: Set<string>): T {
  if (archived.size === 0 || !product || typeof product !== "object") return product;
  const carrier = product as T & { variants?: VariantIdentity[] };
  if (!Array.isArray(carrier.variants)) return product;
  return Object.assign({}, product, {
    variants: carrier.variants.filter((variant) => !archived.has(variant.id)),
  }) as T;
}

function archivedShadow(value: unknown): Record<string, unknown> {
  const shadow = structuredClone(asRecord(value));
  const id = String(shadow.id || "").trim();
  shadow.sku = "";
  shadow.barcode = "";
  shadow.stock_quantity = 0;
  shadow.options = {
    [ARCHIVE_OPTION]: id.slice(0, 120) || "archived",
  };
  shadow.image_refs = [];
  delete shadow.price_iqd;
  delete shadow.cost_iqd;
  return shadow;
}

function assertItemTypeImmutable(
  currentValue: unknown,
  input: Record<string, unknown>,
): void {
  if (!Object.prototype.hasOwnProperty.call(input, "item_type")) return;
  const current = asRecord(currentValue);
  const currentType = current.item_type === "service" ? "service" : "product";
  const requestedType = String(input.item_type || "").trim();
  if (!requestedType || requestedType === currentType) return;
  throw new CatalogRuntimeError(
    "CATALOG_ITEM_TYPE_IMMUTABLE",
    "catalog item type cannot be changed after creation",
    409,
    {
      current_item_type: currentType,
      requested_item_type: requestedType,
    },
  );
}

async function readArchivedVariantIds(
  merchantId: string,
  productId?: string,
): Promise<Set<string>> {
  if (!operationalPostgresAuthorityRequired()) return new Set();
  return withMerchantOperationalTransaction(merchantId, async (target) => {
    const rows = productId
      ? await operationalQueryRows<{ id: string }>(
          target,
          `SELECT id
             FROM product_variants
            WHERE merchant_id = $1 AND product_id = $2
              AND COALESCE(metadata->>'catalog_archived', 'false') = 'true'`,
          [merchantId, productId],
        )
      : await operationalQueryRows<{ id: string }>(
          target,
          `SELECT id
             FROM product_variants
            WHERE merchant_id = $1
              AND COALESCE(metadata->>'catalog_archived', 'false') = 'true'`,
          [merchantId],
        );
    return new Set(rows.map((row) => row.id));
  });
}

function inventoryTrackingDisabled(input: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(input, "track_inventory")) {
    return false;
  }
  const value = input.track_inventory;
  return value === false || value === 0 || value === "0" || value === "false";
}

async function assertLocationInventoryShapeChangeSafe(input: {
  merchantId: string;
  productId: string;
  current: Awaited<ReturnType<typeof core.getCatalogProductAuthoritative>>;
  requestedVariants: unknown[];
  newlyRemovedIds: string[];
  catalogInput: Record<string, unknown>;
}): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) return;

  const currentRecord = asRecord(input.current);
  const currentTracksInventory =
    currentRecord.item_type !== "service" &&
    currentRecord.track_inventory !== false;
  if (!currentTracksInventory) return;

  const convertingSimpleToVariants =
    input.current.variants.length === 0 &&
    input.requestedVariants.length > 0;
  const disablingTracking = inventoryTrackingDisabled(input.catalogInput);
  const currentHasStock =
    Number(input.current.stock_quantity || 0) > 0 ||
    input.current.variants.some(
      (variant) => Number(variant.stock_quantity || 0) > 0,
    );

  await withMerchantOperationalTransaction(input.merchantId, async (target) => {
    const rows = await operationalQueryRows<{
      variant_id: string | null;
      on_hand_quantity: number;
      reserved_quantity: number;
    }>(
      target,
      `SELECT variant_id, on_hand_quantity, reserved_quantity
         FROM location_inventory_levels
        WHERE merchant_id = $1
          AND product_id = $2
          AND (
            on_hand_quantity > 0
            OR reserved_quantity > 0
          )
        FOR UPDATE`,
      [input.merchantId, input.productId],
    );

    const blockedVariantIds = new Set(input.newlyRemovedIds);
    const removedVariantHasStock = rows.some(
      (row) => row.variant_id && blockedVariantIds.has(row.variant_id),
    );
    const simpleStockExists = rows.some((row) => row.variant_id === null);
    const anyLocationStock = rows.length > 0;

    if (
      (convertingSimpleToVariants &&
        (currentHasStock || simpleStockExists)) ||
      (disablingTracking && (currentHasStock || anyLocationStock)) ||
      removedVariantHasStock
    ) {
      throw new CatalogRuntimeError(
        "CATALOG_INVENTORY_SHAPE_CHANGE_BLOCKED",
        "catalog inventory shape cannot change while stock or reservations remain",
        409,
        {
          product_id: input.productId,
          ...(input.newlyRemovedIds.length > 0
            ? { variant_ids: input.newlyRemovedIds }
            : {}),
          conversion: convertingSimpleToVariants
            ? "simple_to_variants"
            : disablingTracking
              ? "inventory_tracking_disabled"
              : "variant_archive",
        },
      );
    }
  });
}

async function assertNoPromotionReferences(
  merchantId: string,
  productId: string,
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0 || !operationalPostgresAuthorityRequired()) return;
  await withMerchantOperationalTransaction(merchantId, async (target) => {
    const rows = await operationalQueryRows<{ variant_id: string }>(
      target,
      `SELECT DISTINCT variant_id
         FROM commerce_promotions
        WHERE merchant_id = $1 AND product_id = $2
          AND variant_id = ANY($3::text[])`,
      [merchantId, productId, variantIds],
    );
    if (rows.length > 0) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_HISTORY_CONFLICT",
        "variant cannot be removed while referenced by an active commerce promotion",
        409,
        {
          variant_ids: rows.map((row) => row.variant_id),
          dependencies: rows.map((row) => ({
            variant_id: row.variant_id,
            kind: "commerce_promotions",
          })),
        },
      );
    }
  });
}

async function markArchivedVariants(
  merchantId: string,
  productId: string,
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0 || !operationalPostgresAuthorityRequired()) return;
  await withMerchantOperationalTransaction(merchantId, async (target) => {
    await target.query(
      `UPDATE product_variants
          SET quantity = 0,
              metadata = COALESCE(metadata, '{}'::jsonb)
                || jsonb_build_object(
                     'catalog_archived', true,
                     'catalog_archived_at', now()
                   ),
              updated_at = now()
        WHERE merchant_id = $1 AND product_id = $2
          AND id = ANY($3::text[])`,
      [merchantId, productId, variantIds],
    );
  });
}

export async function createCatalogProductAuthoritative(
  params: Parameters<typeof core.createCatalogProductAuthoritative>[0],
): Promise<Awaited<ReturnType<typeof core.createCatalogProductAuthoritative>>> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const graphKey = `${merchantId}\0create\0${String(params.idempotencyKey || "")}`;
  const input = scopeCatalogImageAttachmentIds(params.input, graphKey);
  return core.createCatalogProductAuthoritative({
    ...params,
    merchantId,
    input,
  } as Parameters<typeof core.createCatalogProductAuthoritative>[0]);
}

export async function listCatalogProductsAuthoritative(
  merchantIdValue: unknown,
): Promise<Awaited<ReturnType<typeof core.listCatalogProductsAuthoritative>>> {
  const products = await core.listCatalogProductsAuthoritative(merchantIdValue);
  if (!operationalPostgresAuthorityRequired()) return products;
  const merchantId = normalizeCatalogMerchantId(merchantIdValue);
  const archived = await readArchivedVariantIds(merchantId);
  return products.map((product) => filterArchivedProduct(product, archived));
}

export async function getCatalogProductAuthoritative(
  merchantIdValue: unknown,
  productIdValue: unknown,
): Promise<Awaited<ReturnType<typeof core.getCatalogProductAuthoritative>>> {
  const product = await core.getCatalogProductAuthoritative(
    merchantIdValue,
    productIdValue,
  );
  if (!operationalPostgresAuthorityRequired()) return product;
  const merchantId = normalizeCatalogMerchantId(merchantIdValue);
  const productId = normalizeCatalogProductId(productIdValue);
  const archived = await readArchivedVariantIds(merchantId, productId);
  return filterArchivedProduct(product, archived);
}

export async function updateCatalogProductAuthoritative(
  params: Parameters<typeof core.updateCatalogProductAuthoritative>[0],
): Promise<Awaited<ReturnType<typeof core.updateCatalogProductAuthoritative>>> {
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const current = await core.getCatalogProductAuthoritative(merchantId, productId);
  const input = preserveExistingInventoryOnCatalogEdit(
    scopeCatalogImageAttachmentIds(
      params.input,
      `${merchantId}\0${productId}`,
    ),
    current,
  );
  assertItemTypeImmutable(current, input);

  if (!operationalPostgresAuthorityRequired()) {
    return core.updateCatalogProductAuthoritative({
      ...params,
      merchantId,
      productId,
      input,
    } as Parameters<typeof core.updateCatalogProductAuthoritative>[0]);
  }

  const previouslyArchived = await readArchivedVariantIds(merchantId, productId);
  const variantsWereSupplied = Object.prototype.hasOwnProperty.call(input, "variants");
  const activeCurrent = current.variants.filter(
    (variant) => !previouslyArchived.has(variant.id),
  );
  const requestedVariants = variantsWereSupplied && Array.isArray(input.variants)
    ? input.variants
    : activeCurrent;
  const incomingIds = new Set(
    requestedVariants.map(variantId).filter(Boolean),
  );

  const archiveIds = new Set(
    [...previouslyArchived].filter((id) => !incomingIds.has(id)),
  );
  const newlyRemovedIds = variantsWereSupplied
    ? activeCurrent
        .filter((variant) => !incomingIds.has(variant.id))
        .map((variant) => variant.id)
    : [];

  await assertLocationInventoryShapeChangeSafe({
    merchantId,
    productId,
    current,
    requestedVariants,
    newlyRemovedIds,
    catalogInput: input,
  });
  await assertNoPromotionReferences(merchantId, productId, newlyRemovedIds);
  for (const id of newlyRemovedIds) archiveIds.add(id);

  const archivedVariants = current.variants.filter((variant) =>
    archiveIds.has(variant.id),
  );
  input.variants = [
    ...requestedVariants,
    ...archivedVariants.map(archivedShadow),
  ];

  // The archived rows are internal zero-stock shadows. Do not let a top-level
  // quantity from a now-empty variant form conflict with their zero stock.
  if (archiveIds.size > 0) {
    delete input.stock_quantity;
    delete input.quantity;
  }

  const internalParams = {
    ...params,
    merchantId,
    productId,
    input,
  } as Parameters<typeof core.updateCatalogProductAuthoritative>[0];

  const updated = await core.updateCatalogProductAuthoritative(internalParams);
  await markArchivedVariants(merchantId, productId, [...archiveIds]);
  return filterArchivedProduct(updated, archiveIds);
}

export async function setCatalogInventoryAuthoritative(
  params: Parameters<typeof core.setCatalogInventoryAuthoritative>[0],
): Promise<Awaited<ReturnType<typeof core.setCatalogInventoryAuthoritative>>> {
  if (!operationalPostgresAuthorityRequired()) {
    return core.setCatalogInventoryAuthoritative(params);
  }
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const locationId =
    await resolveSingleInventoryLocationForCompatibilityAuthoritative(
      merchantId,
    );
  await setMerchantLocationInventoryAuthoritative({
    merchantId,
    locationId,
    productId,
    variantId: params.variantId,
    expectedVersion: params.expectedVersion,
    quantity: params.quantity,
  });
  return getCatalogProductAuthoritative(merchantId, productId);
}

export async function adjustCatalogInventoryAuthoritative(
  params: Parameters<typeof core.adjustCatalogInventoryAuthoritative>[0],
): Promise<Awaited<ReturnType<typeof core.adjustCatalogInventoryAuthoritative>>> {
  if (!operationalPostgresAuthorityRequired()) {
    return core.adjustCatalogInventoryAuthoritative(params);
  }
  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const locationId =
    await resolveSingleInventoryLocationForCompatibilityAuthoritative(
      merchantId,
    );
  const mutation = await adjustMerchantLocationInventoryAuthoritative({
    merchantId,
    locationId,
    productId,
    variantId: params.variantId,
    expectedVersion: params.expectedVersion,
    delta: params.delta,
    idempotencyKey: params.idempotencyKey,
    reason: params.reason,
  });
  return {
    product: await getCatalogProductAuthoritative(merchantId, productId),
    replayed: mutation.replayed,
  };
}
