import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import { CashierSyncError } from "./postgresCashierSyncAuthority";
import {
  CASHIER_REFUND_PRICING_VERSION,
  cashierNetReturnRefundMinor,
} from "./cashierRefundPricing";
import {
  identifier,
  instant,
  itemKey,
  nonNegativeInteger,
  parseOriginalSale,
  positiveInteger,
  record,
  safeAdd,
  safeMultiply,
  sha256,
  validateCashierCompensationSyncBundle,
  type CompensationKind,
  type CompensationMovement,
  type OriginalSale,
  type OriginalSaleLine,
  type ValidatedCompensationBundle,
} from "./cashierCompensationSyncValidation";

export { validateCashierCompensationSyncBundle } from "./cashierCompensationSyncValidation";

type ExistingOrderRow = {
  id: string;
  source_channel: string;
  fulfillment_location_id: string | null;
  metadata: Record<string, unknown> | null;
};

type ProductRow = {
  id: string;
  quantity: number;
  low_stock_threshold: number;
  version: number;
  status: string;
};

type VariantRow = {
  id: string;
  quantity: number;
};

type OriginalInventoryMutation = {
  location_id: string | null;
  product_id: string;
  variant_id: string | null;
  before_quantity: number;
  after_quantity: number;
};

type StoredCompensation = {
  kind: CompensationKind;
  operation_id: string;
  request_hash: string;
  device_id: string;
  device_sequence: string;
  occurred_at: string;
  snapshot: Record<string, unknown>;
  accepted_entity_ids: string[];
};

export type CashierCompensationSyncResult = {
  operation_id: string;
  order_id: string;
  device_sequence: number;
  compensation_kind: CompensationKind;
  replayed: boolean;
  inventory_mutation_count: number;
  accepted_entity_ids: string[];
};

function cashierMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> {
  return record(record(metadata).cashier_sync);
}

function storedCompensations(metadata: Record<string, unknown>): StoredCompensation[] {
  const value = metadata.compensations;
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = record(item);
    const kind = identifier(raw.kind, "compensation.kind", 16);
    if (kind !== "return" && kind !== "void") {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_METADATA_CORRUPT",
        "cashier compensation metadata is corrupt",
        409,
      );
    }
    return {
      kind,
      operation_id: identifier(raw.operation_id, "compensation.operation_id"),
      request_hash: identifier(raw.request_hash, "compensation.request_hash", 128),
      device_id: identifier(raw.device_id, "compensation.device_id"),
      device_sequence: identifier(raw.device_sequence, "compensation.device_sequence", 40),
      occurred_at: instant(raw.occurred_at, "compensation.occurred_at"),
      snapshot: record(raw.snapshot),
      accepted_entity_ids: Array.isArray(raw.accepted_entity_ids)
        ? raw.accepted_entity_ids.map((id) => identifier(id, "compensation.accepted_entity_id"))
        : [],
    } satisfies StoredCompensation;
  });
}

async function loadOriginalOrder(
  target: OperationalQueryTarget,
  merchantId: string,
  saleId: string,
): Promise<ExistingOrderRow | null> {
  const rows = await operationalQueryRows<ExistingOrderRow>(
    target,
    `SELECT id, source_channel, fulfillment_location_id, metadata
       FROM orders
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, saleId],
  );
  return rows[0] || null;
}

async function findOperationUsage(
  target: OperationalQueryTarget,
  merchantId: string,
  operationId: string,
): Promise<ExistingOrderRow | null> {
  const rows = await operationalQueryRows<ExistingOrderRow>(
    target,
    `SELECT id, source_channel, fulfillment_location_id, metadata
       FROM orders
      WHERE merchant_id = $1
        AND source_channel = 'cashier'
        AND (
          metadata->'cashier_sync'->>'operation_id' = $2
          OR EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(metadata->'cashier_sync'->'compensations') = 'array'
                    THEN metadata->'cashier_sync'->'compensations'
                  ELSE '[]'::jsonb
                END
              ) AS compensation
             WHERE compensation->>'operation_id' = $2
          )
        )
      ORDER BY id
      LIMIT 1
      FOR UPDATE`,
    [merchantId, operationId],
  );
  return rows[0] || null;
}

function replayFromUsage(
  usage: ExistingOrderRow,
  bundle: ValidatedCompensationBundle,
): CashierCompensationSyncResult | null {
  const metadata = cashierMetadata(usage.metadata);
  if (String(metadata.operation_id || "") === bundle.operationId) {
    throw new CashierSyncError(
      "CASHIER_SYNC_IDEMPOTENCY_CONFLICT",
      "cashier compensation operation id is already used by a sale",
      409,
    );
  }
  const existing = storedCompensations(metadata).find(
    (item) => item.operation_id === bundle.operationId,
  );
  if (!existing) return null;
  if (
    usage.id !== bundle.saleId ||
    existing.kind !== bundle.kind ||
    existing.request_hash !== bundle.requestHash ||
    existing.device_id !== bundle.deviceId ||
    existing.device_sequence !== String(bundle.deviceSequence)
  ) {
    throw new CashierSyncError(
      "CASHIER_SYNC_IDEMPOTENCY_CONFLICT",
      "cashier compensation operation id was already used with different content",
      409,
    );
  }
  return {
    operation_id: bundle.operationId,
    order_id: usage.id,
    device_sequence: bundle.deviceSequence,
    compensation_kind: bundle.kind,
    replayed: true,
    inventory_mutation_count: 0,
    accepted_entity_ids: bundle.envelopes.map((item) => item.entity_id),
  };
}

async function assertDeviceSequenceUnused(
  target: OperationalQueryTarget,
  bundle: ValidatedCompensationBundle,
): Promise<void> {
  const rows = await operationalQueryRows<{ id: string }>(
    target,
    `SELECT id
       FROM orders
      WHERE merchant_id = $1
        AND source_channel = 'cashier'
        AND (
          (
            metadata->'cashier_sync'->>'device_id' = $2
            AND metadata->'cashier_sync'->>'device_sequence' = $3
          )
          OR EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(metadata->'cashier_sync'->'compensations') = 'array'
                    THEN metadata->'cashier_sync'->'compensations'
                  ELSE '[]'::jsonb
                END
              ) AS compensation
             WHERE compensation->>'device_id' = $2
               AND compensation->>'device_sequence' = $3
          )
        )
      ORDER BY id
      LIMIT 1
      FOR UPDATE`,
    [bundle.cloudMerchantId, bundle.deviceId, String(bundle.deviceSequence)],
  );
  if (rows[0]) {
    throw new CashierSyncError(
      "CASHIER_SYNC_DEVICE_SEQUENCE_CONFLICT",
      "cashier device sequence was already used by another operation",
      409,
      { existing_order_id: rows[0].id },
    );
  }
}

async function loadOriginalInventoryMutations(
  target: OperationalQueryTarget,
  merchantId: string,
  requestHash: string,
): Promise<Map<string, OriginalInventoryMutation>> {
  const rows = await operationalQueryRows<OriginalInventoryMutation>(
    target,
    `SELECT location_id, product_id, variant_id, before_quantity, after_quantity
       FROM inventory_mutations
      WHERE merchant_id = $1
        AND reason_code = 'cashier_sale_sync'
        AND request_hash = $2
      ORDER BY product_id, variant_id`,
    [merchantId, requestHash],
  );
  const result = new Map<string, OriginalInventoryMutation>();
  for (const row of rows) {
    const key = itemKey(row.product_id, row.variant_id || undefined);
    if (result.has(key)) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_MOVEMENT_CORRUPT",
        "original cashier inventory evidence is duplicated",
        409,
      );
    }
    result.set(key, row);
  }
  return result;
}

function validateOriginalInventoryEvidence(
  originalSale: OriginalSale,
  mutations: Map<string, OriginalInventoryMutation>,
  expectedLocationId?: string,
): void {
  const lines = new Map(
    originalSale.lines.map((line) => [itemKey(line.product_id, line.variant_id), line]),
  );
  for (const [key, mutation] of mutations) {
    if (expectedLocationId && mutation.location_id !== expectedLocationId) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_MOVEMENT_CORRUPT",
        "original cashier inventory evidence belongs to a different location",
        409,
      );
    }
    const line = lines.get(key);
    if (!line) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_MOVEMENT_CORRUPT",
        "original cashier inventory evidence has no matching sale line",
        409,
      );
    }
    const removed =
      Number(mutation.before_quantity) - Number(mutation.after_quantity);
    if (!Number.isSafeInteger(removed) || removed !== line.quantity) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_MOVEMENT_CORRUPT",
        "original cashier inventory evidence does not match sale quantity",
        409,
      );
    }
  }
}

function inventoryStatus(currentStatus: string, quantity: number, lowStockThreshold: number): string {
  if (currentStatus === "draft" || currentStatus === "hidden_from_fawri") return currentStatus;
  if (quantity === 0) return "out_of_stock";
  if (quantity <= lowStockThreshold) return "low_stock";
  return "available";
}

function sumVariantStock(
  variants: VariantRow[],
  replacedVariantId: string,
  replacementQuantity: number,
): number {
  let total = 0;
  for (const variant of variants) {
    const quantity =
      variant.id === replacedVariantId
        ? replacementQuantity
        : Number(variant.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_STOCK_INVALID",
        "cashier compensation encountered invalid variant stock",
        409,
      );
    }
    total += quantity;
    if (!Number.isSafeInteger(total)) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_STOCK_INVALID",
        "cashier compensation stock total overflow",
        409,
      );
    }
  }
  return total;
}

function assertMovementMatches(
  bundle: ValidatedCompensationBundle,
  line: OriginalSaleLine,
  quantity: number,
  movement: CompensationMovement,
): void {
  if (
    movement.product_id !== line.product_id ||
    movement.variant_id !== line.variant_id ||
    movement.delta !== quantity ||
    movement.related_sale_id !== bundle.saleId ||
    movement.reason !== (bundle.kind === "return" ? "return" : "sale_void")
  ) {
    throw new CashierSyncError(
      "CASHIER_SYNC_MOVEMENT_MISMATCH",
      "cashier compensation inventory movement does not match server-derived stock restoration",
      409,
    );
  }
}

async function applyLegacyRestock(
  target: OperationalQueryTarget,
  bundle: ValidatedCompensationBundle,
  line: OriginalSaleLine,
  quantity: number,
  movement: CompensationMovement,
): Promise<void> {
  assertMovementMatches(bundle, line, quantity, movement);
  const products = await operationalQueryRows<ProductRow>(
    target,
    `SELECT id, quantity, low_stock_threshold, version, status
       FROM products
      WHERE merchant_id = $1 AND id = $2 AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE`,
    [bundle.cloudMerchantId, line.product_id],
  );
  const product = products[0];
  if (!product) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_PRODUCT_NOT_FOUND",
      "cashier compensation product no longer exists",
      409,
      { product_id: line.product_id },
    );
  }
  const variants = await operationalQueryRows<VariantRow>(
    target,
    `SELECT id, quantity
       FROM product_variants
      WHERE merchant_id = $1 AND product_id = $2
      ORDER BY id
      FOR UPDATE`,
    [bundle.cloudMerchantId, line.product_id],
  );

  let before: number;
  let after: number;
  let productQuantityAfter: number;
  if (line.variant_id) {
    const variant = variants.find((item) => item.id === line.variant_id);
    if (!variant) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_VARIANT_NOT_FOUND",
        "cashier compensation variant no longer exists",
        409,
        { product_id: line.product_id, variant_id: line.variant_id },
      );
    }
    before = Number(variant.quantity);
    after = before + quantity;
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before < 0) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_STOCK_INVALID",
        "cashier compensation would produce invalid stock",
        409,
      );
    }
    productQuantityAfter = sumVariantStock(variants, line.variant_id, after);
    await target.query(
      `UPDATE product_variants
          SET quantity = $4, updated_at = now()
        WHERE merchant_id = $1 AND product_id = $2 AND id = $3`,
      [bundle.cloudMerchantId, line.product_id, line.variant_id, after],
    );
  } else {
    if (variants.length > 0) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_CATALOG_SHAPE_CHANGED",
        "cashier compensation cannot safely restore a pre-variant sale after catalog shape changed",
        409,
        { product_id: line.product_id },
      );
    }
    before = Number(product.quantity);
    after = before + quantity;
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before < 0) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_STOCK_INVALID",
        "cashier compensation would produce invalid stock",
        409,
      );
    }
    productQuantityAfter = after;
  }

  const expectedVersion = Number(product.version);
  const resultingVersion = expectedVersion + 1;
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion <= 0 ||
    !Number.isSafeInteger(resultingVersion)
  ) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_PRODUCT_VERSION_INVALID",
      "cashier compensation encountered an invalid catalog version",
      409,
    );
  }
  const lowStockThreshold = Number(product.low_stock_threshold);
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_STOCK_INVALID",
      "cashier compensation encountered an invalid low-stock threshold",
      409,
    );
  }
  const nextStatus = inventoryStatus(
    product.status,
    productQuantityAfter,
    lowStockThreshold,
  );
  const updated = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE products
        SET quantity = $3,
            version = version + 1,
            status = $4,
            updated_at = now()
      WHERE merchant_id = $1 AND id = $2 AND version = $5 AND deleted_at IS NULL
      RETURNING id`,
    [bundle.cloudMerchantId, line.product_id, productQuantityAfter, nextStatus, expectedVersion],
  );
  if (updated.length !== 1) {
    throw new CashierSyncError(
      "CASHIER_SYNC_PRODUCT_VERSION_CONFLICT",
      "catalog changed during cashier compensation reconciliation",
      409,
      { product_id: line.product_id },
    );
  }

  const keyHash = sha256(
    `cashier-${bundle.kind}:${bundle.cloudMerchantId}:${bundle.operationId}:${line.line_id}`,
  );
  await target.query(
    `INSERT INTO inventory_mutations (
       id, merchant_id, product_id, variant_id, mutation_type,
       before_quantity, after_quantity, expected_version, resulting_version,
       actor_type, actor_account_id, reason_code, idempotency_key_hash,
       request_hash, created_at
     ) VALUES ($1,$2,$3,$4,'adjust',$5,$6,$7,$8,'merchant',$2,$9,$10,$11,$12)`,
    [
      `cashier_comp_${keyHash.slice(0, 38)}`,
      bundle.cloudMerchantId,
      line.product_id,
      line.variant_id || null,
      before,
      after,
      expectedVersion,
      resultingVersion,
      bundle.kind === "return" ? "cashier_return_sync" : "cashier_void_sync",
      keyHash,
      bundle.requestHash,
      new Date(bundle.occurredAt),
    ],
  );
}

async function applyLocationRestock(
  target: OperationalQueryTarget,
  bundle: ValidatedCompensationBundle,
  line: OriginalSaleLine,
  quantity: number,
  movement: CompensationMovement,
  locationId: string,
): Promise<void> {
  assertMovementMatches(bundle, line, quantity, movement);

  const products = await operationalQueryRows<ProductRow>(
    target,
    `SELECT id, quantity, low_stock_threshold, version, status
       FROM products
      WHERE merchant_id = $1 AND id = $2 AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE`,
    [bundle.cloudMerchantId, line.product_id],
  );
  const product = products[0];
  if (!product) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_PRODUCT_NOT_FOUND",
      "cashier compensation product no longer exists",
      409,
      { product_id: line.product_id },
    );
  }

  const variants = await operationalQueryRows<VariantRow>(
    target,
    `SELECT id, quantity
       FROM product_variants
      WHERE merchant_id = $1 AND product_id = $2
      ORDER BY id
      FOR UPDATE`,
    [bundle.cloudMerchantId, line.product_id],
  );

  let legacyVariant: VariantRow | undefined;
  if (line.variant_id) {
    legacyVariant = variants.find((item) => item.id === line.variant_id);
    if (!legacyVariant) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_VARIANT_NOT_FOUND",
        "cashier compensation variant no longer exists",
        409,
        { product_id: line.product_id, variant_id: line.variant_id },
      );
    }
  } else if (variants.length > 0) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_CATALOG_SHAPE_CHANGED",
      "cashier compensation cannot safely restore a pre-variant sale after catalog shape changed",
      409,
      { product_id: line.product_id },
    );
  }

  const levels = await operationalQueryRows<{
    id: string;
    quantity: number;
    version: number;
  }>(
    target,
    `SELECT id, quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
        AND variant_id IS NOT DISTINCT FROM $4::text
      LIMIT 1
      FOR UPDATE`,
    [
      bundle.cloudMerchantId,
      locationId,
      line.product_id,
      line.variant_id || null,
    ],
  );
  const level = levels[0];
  if (!level) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_LOCATION_INVENTORY_MISSING",
      "original cashier location inventory level no longer exists",
      409,
      {
        location_id: locationId,
        product_id: line.product_id,
        ...(line.variant_id ? { variant_id: line.variant_id } : {}),
      },
    );
  }

  const before = Number(level.quantity);
  const after = before + quantity;
  const expectedVersion = Number(level.version);
  if (
    !Number.isSafeInteger(before) ||
    before < 0 ||
    !Number.isSafeInteger(after) ||
    after < 0 ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion <= 0
  ) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_STOCK_INVALID",
      "cashier compensation would produce invalid location stock",
      409,
      {
        location_id: locationId,
        product_id: line.product_id,
      },
    );
  }
  const resultingVersion = expectedVersion + 1;

  const updatedLevel = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE location_inventory_levels
        SET quantity = $5,
            version = version + 1,
            updated_at = now()
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
        AND variant_id IS NOT DISTINCT FROM $4::text
        AND version = $6
      RETURNING id`,
    [
      bundle.cloudMerchantId,
      locationId,
      line.product_id,
      line.variant_id || null,
      after,
      expectedVersion,
    ],
  );
  if (updatedLevel.length !== 1) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_LOCATION_VERSION_CONFLICT",
      "location inventory changed during cashier compensation",
      409,
      {
        location_id: locationId,
        product_id: line.product_id,
      },
    );
  }

  await target.query(
    `UPDATE merchant_locations
        SET inventory_fresh_at = now(),
            updated_at = GREATEST(updated_at, now())
      WHERE merchant_id = $1 AND id = $2`,
    [bundle.cloudMerchantId, locationId],
  );

  const legacyProductBefore = Number(product.quantity);
  const legacyProductAfter = legacyProductBefore + quantity;
  if (
    !Number.isSafeInteger(legacyProductBefore) ||
    legacyProductBefore < 0 ||
    !Number.isSafeInteger(legacyProductAfter)
  ) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_STOCK_INVALID",
      "legacy catalog inventory projection is invalid",
      409,
      { product_id: line.product_id },
    );
  }

  if (legacyVariant && line.variant_id) {
    const legacyVariantBefore = Number(legacyVariant.quantity);
    const legacyVariantAfter = legacyVariantBefore + quantity;
    if (
      !Number.isSafeInteger(legacyVariantBefore) ||
      legacyVariantBefore < 0 ||
      !Number.isSafeInteger(legacyVariantAfter)
    ) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_STOCK_INVALID",
        "legacy variant inventory projection is invalid",
        409,
        {
          product_id: line.product_id,
          variant_id: line.variant_id,
        },
      );
    }
    await target.query(
      `UPDATE product_variants
          SET quantity = $4,
              updated_at = now()
        WHERE merchant_id = $1 AND product_id = $2 AND id = $3`,
      [
        bundle.cloudMerchantId,
        line.product_id,
        line.variant_id,
        legacyVariantAfter,
      ],
    );
  }

  const lowStockThreshold = Number(product.low_stock_threshold);
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_STOCK_INVALID",
      "cashier compensation encountered an invalid low-stock threshold",
      409,
    );
  }
  const nextStatus = inventoryStatus(
    product.status,
    legacyProductAfter,
    lowStockThreshold,
  );
  const updatedProduct = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE products
        SET quantity = $3,
            status = $4,
            updated_at = now()
      WHERE merchant_id = $1
        AND id = $2
        AND version = $5
        AND deleted_at IS NULL
      RETURNING id`,
    [
      bundle.cloudMerchantId,
      line.product_id,
      legacyProductAfter,
      nextStatus,
      Number(product.version),
    ],
  );
  if (updatedProduct.length !== 1) {
    throw new CashierSyncError(
      "CASHIER_SYNC_PRODUCT_VERSION_CONFLICT",
      "catalog definition changed during cashier compensation reconciliation",
      409,
      { product_id: line.product_id },
    );
  }

  const keyHash = sha256(
    `cashier-${bundle.kind}:${bundle.cloudMerchantId}:${locationId}:${bundle.operationId}:${line.line_id}`,
  );
  await target.query(
    `INSERT INTO inventory_mutations (
       id, merchant_id, location_id, product_id, variant_id, mutation_type,
       before_quantity, after_quantity, expected_version, resulting_version,
       actor_type, actor_account_id, reason_code, idempotency_key_hash,
       request_hash, created_at
     ) VALUES (
       $1,$2,$3,$4,$5,'adjust',$6,$7,$8,$9,
       'cashier',NULL,$10,$11,$12,$13
     )`,
    [
      `cashier_comp_${keyHash.slice(0, 38)}`,
      bundle.cloudMerchantId,
      locationId,
      line.product_id,
      line.variant_id || null,
      before,
      after,
      expectedVersion,
      resultingVersion,
      bundle.kind === "return" ? "cashier_return_sync" : "cashier_void_sync",
      keyHash,
      bundle.requestHash,
      new Date(bundle.occurredAt),
    ],
  );
}

async function applyRestock(
  target: OperationalQueryTarget,
  bundle: ValidatedCompensationBundle,
  line: OriginalSaleLine,
  quantity: number,
  movement: CompensationMovement,
  locationId?: string,
): Promise<void> {
  if (locationId) {
    await applyLocationRestock(
      target,
      bundle,
      line,
      quantity,
      movement,
      locationId,
    );
    return;
  }
  await applyLegacyRestock(target, bundle, line, quantity, movement);
}

function originalLineById(sale: OriginalSale, lineId: string): OriginalSaleLine {
  const line = sale.lines.find((item) => item.line_id === lineId);
  if (!line) {
    throw new CashierSyncError(
      "CASHIER_RETURN_LINE_NOT_FOUND",
      "return line does not belong to the original sale",
      409,
      { original_line_id: lineId },
    );
  }
  return line;
}

function returnedQuantity(
  compensations: StoredCompensation[],
  lineId: string,
): number {
  let total = 0;
  for (const compensation of compensations) {
    if (compensation.kind !== "return") continue;
    const snapshot = record(compensation.snapshot);
    const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
    for (const value of lines) {
      const line = record(value);
      if (String(line.original_line_id || "") !== lineId) continue;
      total = safeAdd(
        total,
        positiveInteger(line.quantity, "stored_return.quantity"),
        "returned quantity",
      );
    }
  }
  return total;
}

function returnedRefundMinor(
  compensations: StoredCompensation[],
  lineId: string,
): number {
  let total = 0;
  for (const compensation of compensations) {
    if (compensation.kind !== "return") continue;
    const snapshot = record(compensation.snapshot);
    const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
    for (const value of lines) {
      const line = record(value);
      if (String(line.original_line_id || "") !== lineId) continue;
      total = safeAdd(
        total,
        nonNegativeInteger(line.refund_minor, "stored_return.refund_minor"),
        "returned refund",
      );
    }
  }
  return total;
}

function acceptedEntityIds(bundle: ValidatedCompensationBundle): string[] {
  return bundle.envelopes.map((item) => item.entity_id);
}

function compensationMetadataEntry(
  bundle: ValidatedCompensationBundle,
): StoredCompensation {
  return {
    kind: bundle.kind,
    operation_id: bundle.operationId,
    request_hash: bundle.requestHash,
    device_id: bundle.deviceId,
    device_sequence: String(bundle.deviceSequence),
    occurred_at: bundle.occurredAt,
    snapshot: record(
      bundle.kind === "return" ? bundle.returnSnapshot : bundle.voidSnapshot,
    ),
    accepted_entity_ids: acceptedEntityIds(bundle),
  };
}

async function applyReturn(
  target: OperationalQueryTarget,
  bundle: ValidatedCompensationBundle,
  originalSale: OriginalSale,
  originalMutations: Map<string, OriginalInventoryMutation>,
  previousCompensations: StoredCompensation[],
  locationId?: string,
): Promise<number> {
  const snapshot = bundle.returnSnapshot!;
  if (
    snapshot.sale_id !== originalSale.sale_id ||
    snapshot.local_merchant_id !== originalSale.local_merchant_id ||
    snapshot.currency_code !== originalSale.currency_code ||
    snapshot.currency_fraction_digits !== originalSale.currency_fraction_digits
  ) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_MISMATCH",
      "return does not match the original cashier sale",
      409,
    );
  }
  if (previousCompensations.some((item) => item.kind === "void")) {
    throw new CashierSyncError(
      "CASHIER_RETURN_AFTER_VOID_NOT_ALLOWED",
      "a voided cashier sale cannot be returned",
      409,
    );
  }

  let expectedRefundTotal = 0;
  let mutationCount = 0;
  for (const requested of snapshot.lines) {
    const line = originalLineById(originalSale, requested.original_line_id);
    if (
      requested.product_id !== line.product_id ||
      requested.variant_id !== line.variant_id ||
      requested.effective_unit_price_minor !== line.effective_unit_price_minor
    ) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_MISMATCH",
        "return line does not match original sale evidence",
        409,
      );
    }
    const alreadyReturned = returnedQuantity(previousCompensations, line.line_id);
    const remaining = line.quantity - alreadyReturned;
    if (!Number.isSafeInteger(remaining) || remaining < 0 || requested.quantity > remaining) {
      throw new CashierSyncError(
        "CASHIER_RETURN_QUANTITY_EXCEEDS_SOLD",
        "return quantity exceeds the remaining returnable quantity",
        409,
        { original_line_id: line.line_id, remaining_quantity: Math.max(0, remaining) },
      );
    }
    const expectedRefund =
      snapshot.refund_pricing_version === CASHIER_REFUND_PRICING_VERSION
        ? cashierNetReturnRefundMinor(
            originalSale,
            line.line_id,
            alreadyReturned,
            returnedRefundMinor(previousCompensations, line.line_id),
            requested.quantity,
          )
        : safeMultiply(
            line.effective_unit_price_minor,
            requested.quantity,
            "return refund",
          );
    if (requested.refund_minor !== expectedRefund) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_MISMATCH",
        "return refund does not match original sale price",
        409,
      );
    }
    expectedRefundTotal = safeAdd(
      expectedRefundTotal,
      expectedRefund,
      "return refund total",
    );

    const key = itemKey(line.product_id, line.variant_id);
    const originalMutation = originalMutations.get(key);
    const movement = bundle.movements.get(key);
    if (!originalMutation) {
      if (movement) {
        throw new CashierSyncError(
          "CASHIER_SYNC_MOVEMENT_MISMATCH",
          "non-inventory sale line must not include a return stock movement",
          409,
        );
      }
      continue;
    }
    if (!movement) {
      throw new CashierSyncError(
        "CASHIER_SYNC_MOVEMENT_MISMATCH",
        "tracked return is missing its inventory movement evidence",
        409,
      );
    }
    await applyRestock(
      target,
      bundle,
      line,
      requested.quantity,
      movement,
      locationId,
    );
    bundle.movements.delete(key);
    mutationCount += 1;
  }
  if (snapshot.refund_total_minor !== expectedRefundTotal) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_MISMATCH",
      "return total does not match original sale evidence",
      409,
    );
  }
  return mutationCount;
}

async function applyVoid(
  target: OperationalQueryTarget,
  bundle: ValidatedCompensationBundle,
  originalSale: OriginalSale,
  originalMutations: Map<string, OriginalInventoryMutation>,
  previousCompensations: StoredCompensation[],
  locationId?: string,
): Promise<number> {
  const snapshot = bundle.voidSnapshot!;
  if (previousCompensations.length > 0) {
    throw new CashierSyncError(
      "CASHIER_VOID_AFTER_COMPENSATION_NOT_ALLOWED",
      "a cashier sale with an existing return or void cannot be voided",
      409,
    );
  }
  if (
    snapshot.sale_id !== originalSale.sale_id ||
    snapshot.refund_total_minor !== originalSale.total_minor ||
    snapshot.currency_code !== originalSale.currency_code ||
    snapshot.currency_fraction_digits !== originalSale.currency_fraction_digits
  ) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_MISMATCH",
      "void does not match original cashier sale evidence",
      409,
    );
  }

  let mutationCount = 0;
  for (const line of originalSale.lines) {
    const key = itemKey(line.product_id, line.variant_id);
    const originalMutation = originalMutations.get(key);
    const movement = bundle.movements.get(key);
    if (!originalMutation) {
      if (movement) {
        throw new CashierSyncError(
          "CASHIER_SYNC_MOVEMENT_MISMATCH",
          "non-inventory sale line must not include a void stock movement",
          409,
        );
      }
      continue;
    }
    if (!movement) {
      throw new CashierSyncError(
        "CASHIER_SYNC_MOVEMENT_MISMATCH",
        "tracked void is missing its inventory movement evidence",
        409,
      );
    }
    await applyRestock(
      target,
      bundle,
      line,
      line.quantity,
      movement,
      locationId,
    );
    bundle.movements.delete(key);
    mutationCount += 1;
  }
  return mutationCount;
}

export async function syncCashierCompensationAuthoritative(params: {
  merchantId: unknown;
  body: unknown;
}): Promise<CashierCompensationSyncResult> {
  const merchantId = identifier(params.merchantId, "merchant_id");
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierSyncError(
      "CASHIER_SYNC_POSTGRES_REQUIRED",
      "cashier cloud sync requires PostgreSQL operational authority",
      503,
    );
  }
  const bundle = validateCashierCompensationSyncBundle(params.body);
  if (bundle.cloudMerchantId !== merchantId) {
    throw new CashierSyncError(
      "CASHIER_SYNC_TENANT_MISMATCH",
      "authenticated merchant does not match cashier device binding",
      403,
    );
  }

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`cashier-device:${merchantId}:${bundle.deviceId}`],
    );

    const operationUsage = await findOperationUsage(
      client,
      merchantId,
      bundle.operationId,
    );
    if (operationUsage) {
      const replay = replayFromUsage(operationUsage, bundle);
      if (replay) return replay;
    }

    const order = await loadOriginalOrder(client, merchantId, bundle.saleId);
    if (!order || order.source_channel !== "cashier") {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_SALE_NOT_FOUND",
        "original cashier sale was not found",
        404,
      );
    }
    const metadata = cashierMetadata(order.metadata);
    const originalSale = parseOriginalSale(metadata.sale_snapshot);
    if (
      originalSale.sale_id !== order.id ||
      originalSale.local_merchant_id !== bundle.localMerchantId ||
      (originalSale.cloud_merchant_id &&
        originalSale.cloud_merchant_id !== bundle.cloudMerchantId)
    ) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_MISMATCH",
        "cashier compensation merchant or sale identity mismatch",
        409,
      );
    }
    const originalRequestHash = identifier(
      metadata.request_hash,
      "cashier_sync.request_hash",
      128,
    );
    if (!/^[a-f0-9]{64}$/.test(originalRequestHash)) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
        "original cashier sale request hash is invalid",
        409,
      );
    }
    const previousCompensations = storedCompensations(metadata);
    const metadataLocationId = String(metadata.location_id || "").trim();
    if (
      order.fulfillment_location_id &&
      metadataLocationId &&
      order.fulfillment_location_id !== metadataLocationId
    ) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
        "original cashier sale location evidence is inconsistent",
        409,
      );
    }
    const locationId =
      order.fulfillment_location_id || metadataLocationId || undefined;

    await assertDeviceSequenceUnused(client, bundle);
    const originalMutations = await loadOriginalInventoryMutations(
      client,
      merchantId,
      originalRequestHash,
    );
    validateOriginalInventoryEvidence(
      originalSale,
      originalMutations,
      locationId,
    );

    let inventoryMutationCount = 0;
    if (bundle.kind === "return") {
      inventoryMutationCount = await applyReturn(
        client,
        bundle,
        originalSale,
        originalMutations,
        previousCompensations,
        locationId,
      );
    } else {
      inventoryMutationCount = await applyVoid(
        client,
        bundle,
        originalSale,
        originalMutations,
        previousCompensations,
        locationId,
      );
    }
    if (bundle.movements.size !== 0) {
      throw new CashierSyncError(
        "CASHIER_SYNC_MOVEMENT_MISMATCH",
        "cashier compensation bundle contains extra inventory movements",
        409,
        { remaining_movements: bundle.movements.size },
      );
    }

    const nextCompensations = [
      ...previousCompensations,
      compensationMetadataEntry(bundle),
    ];
    const nextCashierMetadata = {
      ...metadata,
      compensations: nextCompensations,
      ...(bundle.kind === "void" ? { current_sale_status: "voided" } : {}),
    };
    const nextMetadata = {
      ...record(order.metadata),
      cashier_sync: nextCashierMetadata,
    };

    // Cashier orders are recorded as delivered at sale time. The canonical order
    // lifecycle treats delivered as terminal, so compensation must not bypass it
    // by rewriting the generic order status to cancelled. Return/void state is
    // append-only cashier evidence in metadata; merchant cashier history renders
    // that evidence directly.
    await client.query(
      `UPDATE orders
          SET version = version + 1,
              metadata = $3::jsonb,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, order.id, JSON.stringify(nextMetadata)],
    );

    return {
      operation_id: bundle.operationId,
      order_id: order.id,
      device_sequence: bundle.deviceSequence,
      compensation_kind: bundle.kind,
      replayed: false,
      inventory_mutation_count: inventoryMutationCount,
      accepted_entity_ids: acceptedEntityIds(bundle),
    };
  });
}

