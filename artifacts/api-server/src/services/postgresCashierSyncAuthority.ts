import crypto from "node:crypto";
import { catalogCommerceFromMetadata } from "./catalogCommerceMetadata";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

const CASHIER_SCHEMA_VERSION = 1;
const MAX_ENVELOPES = 128;
const MAX_LINES = 100;
const MAX_TEXT = 500;

type CashierEnvelope = {
  schema_version: number;
  operation_id: string;
  device_id: string;
  device_sequence: number;
  entity_type: string;
  entity_id: string;
  operation: string;
  occurred_at: string;
  payload: unknown;
};

type CashierPromotionSnapshot = {
  promotion_id: string;
  promotion_name: string;
  effect: string;
  promotion_version?: number;
  percentage_bps?: number;
  amount_minor?: number;
};

type CashierSaleLine = {
  line_id: string;
  product_id: string;
  variant_id?: string;
  product_name_snapshot: string;
  variant_name_snapshot?: string;
  sku_snapshot?: string;
  barcode_snapshot?: string;
  catalog_version?: number;
  quantity: number;
  base_unit_price_minor: number;
  effective_unit_price_minor: number;
  discount_minor: number;
  line_total_minor: number;
  promotion?: CashierPromotionSnapshot;
};

type CashierSale = {
  sale_id: string;
  operation_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  source: "cashier";
  status: "completed";
  lines: CashierSaleLine[];
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  currency_code: "IQD";
  currency_fraction_digits: 0;
  payment_method: "cash" | "card" | "electronic" | "other";
  payment_status: "paid" | "pending";
  payment_provider?: string;
  payment_reference?: string;
  note?: string;
  occurred_at: string;
};

type CashierMovement = {
  movement_id: string;
  operation_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  product_id: string;
  variant_id?: string;
  delta: number;
  reason: "sale";
  related_sale_id: string;
  note?: string;
  occurred_at: string;
};

type ValidatedBundle = {
  cloudMerchantId: string;
  localMerchantId: string;
  deviceId: string;
  deviceSequence: number;
  operationId: string;
  sale: CashierSale;
  movements: Map<string, CashierMovement>;
  envelopes: CashierEnvelope[];
  requestHash: string;
};

type ProductRow = {
  id: string;
  quantity: number;
  low_stock_threshold: number;
  version: number;
  status: string;
  metadata: Record<string, unknown> | null;
};

type VariantRow = {
  id: string;
  quantity: number;
};

type ExistingOrderRow = {
  id: string;
  source_channel: string;
  metadata: Record<string, unknown> | null;
};

export type CashierSaleSyncResult = {
  operation_id: string;
  order_id: string;
  device_sequence: number;
  replayed: boolean;
  inventory_mutation_count: number;
  accepted_entity_ids: string[];
};

export class CashierSyncError extends Error {
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
    this.name = "CashierSyncError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CashierSyncError(
      "CASHIER_SYNC_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength = MAX_TEXT): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return identifier(value, field, maxLength);
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} is invalid`, 400, { field });
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} is invalid`, 400, { field });
  }
  return parsed;
}

function signedInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed === 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} is invalid`, 400, { field });
  }
  return parsed;
}

function instant(value: unknown, field: string): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} is invalid`, 400, { field });
  }
  return parsed.toISOString();
}

function safeMultiply(left: number, right: number, field: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} overflow`, 400, { field });
  }
  return result;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} overflow`, 400, { field });
  }
  return result;
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
  return value;
}

function sha256(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function itemKey(productId: string, variantId?: string): string {
  return `${productId}\u0000${variantId || ""}`;
}

function parsePromotion(value: unknown): CashierPromotionSnapshot | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = record(value);
  const effect = identifier(raw.effect, "promotion.effect", 64);
  if (!["percentage_off", "fixed_amount_off", "fixed_price", "free_delivery"].includes(effect)) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "promotion effect is invalid", 400);
  }
  return {
    promotion_id: identifier(raw.promotion_id, "promotion.id"),
    promotion_name: identifier(raw.promotion_name, "promotion.name", 300),
    effect,
    ...(raw.promotion_version !== undefined
      ? { promotion_version: positiveInteger(raw.promotion_version, "promotion.version") }
      : {}),
    ...(raw.percentage_bps !== undefined
      ? { percentage_bps: positiveInteger(raw.percentage_bps, "promotion.percentage_bps") }
      : {}),
    ...(raw.amount_minor !== undefined
      ? { amount_minor: nonNegativeInteger(raw.amount_minor, "promotion.amount_minor") }
      : {}),
  };
}

function parseSaleLine(value: unknown): CashierSaleLine {
  const raw = record(value);
  const quantity = positiveInteger(raw.quantity, "line.quantity");
  const base = nonNegativeInteger(raw.base_unit_price_minor, "line.base_unit_price_minor");
  const effective = nonNegativeInteger(
    raw.effective_unit_price_minor,
    "line.effective_unit_price_minor",
  );
  const discount = nonNegativeInteger(raw.discount_minor, "line.discount_minor");
  const lineTotal = nonNegativeInteger(raw.line_total_minor, "line.line_total_minor");
  if (effective > base) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "effective price exceeds base price", 400);
  }
  const baseTotal = safeMultiply(base, quantity, "line.base_total");
  const effectiveTotal = safeMultiply(effective, quantity, "line.effective_total");
  if (lineTotal !== effectiveTotal || discount !== baseTotal - effectiveTotal) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale line totals are inconsistent", 400);
  }
  return {
    line_id: identifier(raw.line_id, "line.line_id"),
    product_id: identifier(raw.product_id, "line.product_id"),
    ...(raw.variant_id ? { variant_id: identifier(raw.variant_id, "line.variant_id") } : {}),
    product_name_snapshot: identifier(raw.product_name_snapshot, "line.product_name_snapshot", 300),
    ...(raw.variant_name_snapshot
      ? { variant_name_snapshot: identifier(raw.variant_name_snapshot, "line.variant_name_snapshot", 300) }
      : {}),
    ...(raw.sku_snapshot ? { sku_snapshot: identifier(raw.sku_snapshot, "line.sku_snapshot", 160) } : {}),
    ...(raw.barcode_snapshot
      ? { barcode_snapshot: identifier(raw.barcode_snapshot, "line.barcode_snapshot", 160) }
      : {}),
    ...(raw.catalog_version !== undefined
      ? { catalog_version: positiveInteger(raw.catalog_version, "line.catalog_version") }
      : {}),
    quantity,
    base_unit_price_minor: base,
    effective_unit_price_minor: effective,
    discount_minor: discount,
    line_total_minor: lineTotal,
    ...(raw.promotion ? { promotion: parsePromotion(raw.promotion) } : {}),
  };
}

function parseSale(value: unknown): CashierSale {
  const raw = record(value);
  if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > MAX_LINES) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale lines are invalid", 400);
  }
  const source = identifier(raw.source, "sale.source", 32);
  const status = identifier(raw.status, "sale.status", 32);
  if (source !== "cashier" || status !== "completed") {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale lifecycle is invalid", 400);
  }
  const currencyCode = identifier(raw.currency_code, "sale.currency_code", 3);
  const fractionDigits = Number(raw.currency_fraction_digits);
  if (currencyCode !== "IQD" || fractionDigits !== 0) {
    throw new CashierSyncError(
      "CASHIER_SYNC_CURRENCY_UNSUPPORTED",
      "cashier cloud sync currently accepts IQD minor units only",
      409,
    );
  }
  const paymentMethod = identifier(raw.payment_method, "sale.payment_method", 32);
  const paymentStatus = identifier(raw.payment_status, "sale.payment_status", 32);
  if (!["cash", "card", "electronic", "other"].includes(paymentMethod)) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "payment method is invalid", 400);
  }
  if (!["paid", "pending"].includes(paymentStatus)) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "payment status is invalid", 400);
  }
  if (paymentMethod === "cash" && paymentStatus !== "paid") {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "cash cashier sales must be paid", 400);
  }
  const lines = raw.lines.map(parseSaleLine);
  const lineIds = new Set<string>();
  const itemKeys = new Set<string>();
  let subtotal = 0;
  let discount = 0;
  let total = 0;
  for (const line of lines) {
    if (lineIds.has(line.line_id)) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "duplicate sale line id", 400);
    }
    lineIds.add(line.line_id);
    const key = itemKey(line.product_id, line.variant_id);
    if (itemKeys.has(key)) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "duplicate sale catalog item", 400);
    }
    itemKeys.add(key);
    subtotal = safeAdd(
      subtotal,
      safeMultiply(line.base_unit_price_minor, line.quantity, "sale.subtotal"),
      "sale.subtotal",
    );
    discount = safeAdd(discount, line.discount_minor, "sale.discount");
    total = safeAdd(total, line.line_total_minor, "sale.total");
  }
  const claimedSubtotal = nonNegativeInteger(raw.subtotal_minor, "sale.subtotal_minor");
  const claimedDiscount = nonNegativeInteger(raw.discount_minor, "sale.discount_minor");
  const claimedTotal = nonNegativeInteger(raw.total_minor, "sale.total_minor");
  if (
    claimedSubtotal !== subtotal ||
    claimedDiscount !== discount ||
    claimedTotal !== total ||
    subtotal - discount !== total
  ) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale totals are inconsistent", 400);
  }
  return {
    sale_id: identifier(raw.sale_id, "sale.sale_id"),
    operation_id: identifier(raw.operation_id, "sale.operation_id"),
    local_merchant_id: identifier(raw.local_merchant_id, "sale.local_merchant_id"),
    ...(raw.cloud_merchant_id
      ? { cloud_merchant_id: identifier(raw.cloud_merchant_id, "sale.cloud_merchant_id") }
      : {}),
    device_id: identifier(raw.device_id, "sale.device_id"),
    device_sequence: positiveInteger(raw.device_sequence, "sale.device_sequence"),
    source: "cashier",
    status: "completed",
    lines,
    subtotal_minor: claimedSubtotal,
    discount_minor: claimedDiscount,
    total_minor: claimedTotal,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    payment_method: paymentMethod as CashierSale["payment_method"],
    payment_status: paymentStatus as CashierSale["payment_status"],
    ...(raw.payment_provider
      ? { payment_provider: optionalText(raw.payment_provider, "sale.payment_provider", 100) }
      : {}),
    ...(raw.payment_reference
      ? { payment_reference: optionalText(raw.payment_reference, "sale.payment_reference", 200) }
      : {}),
    ...(raw.note ? { note: optionalText(raw.note, "sale.note", MAX_TEXT) } : {}),
    occurred_at: instant(raw.occurred_at, "sale.occurred_at"),
  };
}

function parseMovement(value: unknown): CashierMovement {
  const raw = record(value);
  const reason = identifier(raw.reason, "movement.reason", 64);
  if (reason !== "sale") {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale sync accepts sale movements only", 400);
  }
  return {
    movement_id: identifier(raw.movement_id, "movement.movement_id"),
    operation_id: identifier(raw.operation_id, "movement.operation_id"),
    local_merchant_id: identifier(raw.local_merchant_id, "movement.local_merchant_id"),
    ...(raw.cloud_merchant_id
      ? { cloud_merchant_id: identifier(raw.cloud_merchant_id, "movement.cloud_merchant_id") }
      : {}),
    device_id: identifier(raw.device_id, "movement.device_id"),
    device_sequence: positiveInteger(raw.device_sequence, "movement.device_sequence"),
    product_id: identifier(raw.product_id, "movement.product_id"),
    ...(raw.variant_id ? { variant_id: identifier(raw.variant_id, "movement.variant_id") } : {}),
    delta: signedInteger(raw.delta, "movement.delta"),
    reason: "sale",
    related_sale_id: identifier(raw.related_sale_id, "movement.related_sale_id"),
    ...(raw.note ? { note: optionalText(raw.note, "movement.note", MAX_TEXT) } : {}),
    occurred_at: instant(raw.occurred_at, "movement.occurred_at"),
  };
}

function parseEnvelope(value: unknown): CashierEnvelope {
  const raw = record(value);
  const schemaVersion = Number(raw.schema_version);
  if (schemaVersion !== CASHIER_SCHEMA_VERSION) {
    throw new CashierSyncError("CASHIER_SYNC_SCHEMA_UNSUPPORTED", "cashier sync schema is unsupported", 409);
  }
  const operation = identifier(raw.operation, "envelope.operation", 32);
  if (operation !== "append") {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale sync requires append envelopes", 400);
  }
  return {
    schema_version: schemaVersion,
    operation_id: identifier(raw.operation_id, "envelope.operation_id"),
    device_id: identifier(raw.device_id, "envelope.device_id"),
    device_sequence: positiveInteger(raw.device_sequence, "envelope.device_sequence"),
    entity_type: identifier(raw.entity_type, "envelope.entity_type", 64),
    entity_id: identifier(raw.entity_id, "envelope.entity_id"),
    operation,
    occurred_at: instant(raw.occurred_at, "envelope.occurred_at"),
    payload: raw.payload,
  };
}

export function validateCashierSaleSyncBundle(body: unknown): ValidatedBundle {
  const raw = record(body);
  const cloudMerchantId = identifier(raw.cloud_merchant_id, "cloud_merchant_id");
  const localMerchantId = identifier(raw.local_merchant_id, "local_merchant_id");
  const deviceId = identifier(raw.device_id, "device_id");
  const operationId = identifier(raw.operation_id, "operation_id");
  const deviceSequence = positiveInteger(raw.device_sequence, "device_sequence");
  if (!Array.isArray(raw.envelopes) || raw.envelopes.length === 0 || raw.envelopes.length > MAX_ENVELOPES) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sync envelopes are invalid", 400);
  }
  const envelopes = raw.envelopes.map(parseEnvelope);
  for (const envelope of envelopes) {
    if (
      envelope.operation_id !== operationId ||
      envelope.device_id !== deviceId ||
      envelope.device_sequence !== deviceSequence
    ) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "envelope operation identity mismatch", 400);
    }
    if (envelope.entity_type !== "sale" && envelope.entity_type !== "inventory_movement") {
      throw new CashierSyncError("CASHIER_SYNC_ENTITY_UNSUPPORTED", "sale sync bundle contains an unsupported entity", 409);
    }
  }
  const saleEnvelopes = envelopes.filter((item) => item.entity_type === "sale");
  if (saleEnvelopes.length !== 1) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale sync requires exactly one sale envelope", 400);
  }
  const sale = parseSale(saleEnvelopes[0].payload);
  if (
    saleEnvelopes[0].entity_id !== sale.sale_id ||
    sale.operation_id !== operationId ||
    sale.local_merchant_id !== localMerchantId ||
    sale.device_id !== deviceId ||
    sale.device_sequence !== deviceSequence ||
    sale.occurred_at !== saleEnvelopes[0].occurred_at
  ) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "sale envelope payload mismatch", 400);
  }
  if (sale.cloud_merchant_id && sale.cloud_merchant_id !== cloudMerchantId) {
    throw new CashierSyncError("CASHIER_SYNC_TENANT_MISMATCH", "sale cloud merchant mismatch", 403);
  }
  const movements = new Map<string, CashierMovement>();
  for (const envelope of envelopes.filter((item) => item.entity_type === "inventory_movement")) {
    const movement = parseMovement(envelope.payload);
    if (
      envelope.entity_id !== movement.movement_id ||
      movement.operation_id !== operationId ||
      movement.local_merchant_id !== localMerchantId ||
      movement.device_id !== deviceId ||
      movement.device_sequence !== deviceSequence ||
      movement.related_sale_id !== sale.sale_id ||
      movement.occurred_at !== envelope.occurred_at
    ) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "inventory movement payload mismatch", 400);
    }
    if (movement.cloud_merchant_id && movement.cloud_merchant_id !== cloudMerchantId) {
      throw new CashierSyncError("CASHIER_SYNC_TENANT_MISMATCH", "movement cloud merchant mismatch", 403);
    }
    const key = itemKey(movement.product_id, movement.variant_id);
    if (movements.has(key)) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "duplicate inventory movement", 400);
    }
    movements.set(key, movement);
  }
  const normalizedForHash = {
    schema_version: CASHIER_SCHEMA_VERSION,
    cloud_merchant_id: cloudMerchantId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    device_sequence: deviceSequence,
    operation_id: operationId,
    sale,
    movements: [...movements.values()].sort((left, right) =>
      itemKey(left.product_id, left.variant_id).localeCompare(itemKey(right.product_id, right.variant_id)),
    ),
  };
  return {
    cloudMerchantId,
    localMerchantId,
    deviceId,
    deviceSequence,
    operationId,
    sale,
    movements,
    envelopes,
    requestHash: sha256(normalizedForHash),
  };
}

function metadataCashier(metadata: Record<string, unknown> | null): Record<string, unknown> {
  return record(record(metadata).cashier_sync);
}

function inventoryStatus(currentStatus: string, quantity: number, lowStockThreshold: number): string {
  if (currentStatus === "draft" || currentStatus === "hidden_from_fawri") return currentStatus;
  if (quantity === 0) return "out_of_stock";
  if (quantity <= lowStockThreshold) return "low_stock";
  return "available";
}

async function loadExistingOrder(
  target: OperationalQueryTarget,
  merchantId: string,
  orderId: string,
): Promise<ExistingOrderRow | null> {
  const rows = await operationalQueryRows<ExistingOrderRow>(
    target,
    `SELECT id, source_channel, metadata
       FROM orders
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, orderId],
  );
  return rows[0] || null;
}

async function assertDeviceSequenceUnused(
  target: OperationalQueryTarget,
  bundle: ValidatedBundle,
): Promise<void> {
  const rows = await operationalQueryRows<{ id: string; metadata: Record<string, unknown> | null }>(
    target,
    `SELECT id, metadata
       FROM orders
      WHERE merchant_id = $1
        AND source_channel = 'cashier'
        AND metadata->'cashier_sync'->>'device_id' = $2
        AND metadata->'cashier_sync'->>'device_sequence' = $3
      LIMIT 1
      FOR UPDATE`,
    [bundle.cloudMerchantId, bundle.deviceId, String(bundle.deviceSequence)],
  );
  if (rows[0] && rows[0].id !== bundle.sale.sale_id) {
    throw new CashierSyncError(
      "CASHIER_SYNC_DEVICE_SEQUENCE_CONFLICT",
      "cashier device sequence was already used by another sale",
      409,
      { existing_order_id: rows[0].id },
    );
  }
}

async function applyInventoryForLine(
  target: OperationalQueryTarget,
  bundle: ValidatedBundle,
  line: CashierSaleLine,
): Promise<boolean> {
  const products = await operationalQueryRows<ProductRow>(
    target,
    `SELECT id, quantity, low_stock_threshold, version, status, metadata
       FROM products
      WHERE merchant_id = $1 AND id = $2 AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE`,
    [bundle.cloudMerchantId, line.product_id],
  );
  const product = products[0];
  if (!product) {
    throw new CashierSyncError("CASHIER_SYNC_PRODUCT_NOT_FOUND", "cashier sale product no longer exists", 409, {
      product_id: line.product_id,
    });
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
  const tracked = catalogCommerceFromMetadata(product.metadata).track_inventory;
  const movement = bundle.movements.get(itemKey(line.product_id, line.variant_id));
  if (!tracked) {
    if (movement) {
      throw new CashierSyncError(
        "CASHIER_SYNC_MOVEMENT_MISMATCH",
        "non-inventory item must not include a stock movement",
        409,
      );
    }
    return false;
  }
  let before: number;
  let after: number;
  let productQuantityAfter: number;
  if (variants.length > 0) {
    if (!line.variant_id) {
      throw new CashierSyncError("CASHIER_SYNC_VARIANT_REQUIRED", "variant id is required", 409, {
        product_id: line.product_id,
      });
    }
    const variant = variants.find((item) => item.id === line.variant_id);
    if (!variant) {
      throw new CashierSyncError("CASHIER_SYNC_VARIANT_NOT_FOUND", "cashier sale variant no longer exists", 409, {
        product_id: line.product_id,
        variant_id: line.variant_id,
      });
    }
    before = Number(variant.quantity);
    after = before - line.quantity;
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after < 0) {
      throw new CashierSyncError("CASHIER_SYNC_NEGATIVE_STOCK", "cloud stock is insufficient for offline sale", 409, {
        product_id: line.product_id,
        variant_id: line.variant_id,
        current_quantity: before,
        requested_quantity: line.quantity,
      });
    }
    if (!movement || movement.delta !== -line.quantity) {
      throw new CashierSyncError("CASHIER_SYNC_MOVEMENT_MISMATCH", "sale inventory movement does not match sale quantity", 409);
    }
    await target.query(
      `UPDATE product_variants
          SET quantity = $4, updated_at = now()
        WHERE merchant_id = $1 AND product_id = $2 AND id = $3`,
      [bundle.cloudMerchantId, line.product_id, line.variant_id, after],
    );
    productQuantityAfter = variants.reduce(
      (total, item) => total + (item.id === line.variant_id ? after : Number(item.quantity)),
      0,
    );
  } else {
    if (line.variant_id) {
      throw new CashierSyncError("CASHIER_SYNC_VARIANT_NOT_FOUND", "cashier sale variant no longer exists", 409, {
        product_id: line.product_id,
        variant_id: line.variant_id,
      });
    }
    before = Number(product.quantity);
    after = before - line.quantity;
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after < 0) {
      throw new CashierSyncError("CASHIER_SYNC_NEGATIVE_STOCK", "cloud stock is insufficient for offline sale", 409, {
        product_id: line.product_id,
        current_quantity: before,
        requested_quantity: line.quantity,
      });
    }
    if (!movement || movement.delta !== -line.quantity) {
      throw new CashierSyncError("CASHIER_SYNC_MOVEMENT_MISMATCH", "sale inventory movement does not match sale quantity", 409);
    }
    productQuantityAfter = after;
  }
  if (
    movement!.product_id !== line.product_id ||
    movement!.variant_id !== line.variant_id ||
    movement!.related_sale_id !== bundle.sale.sale_id
  ) {
    throw new CashierSyncError("CASHIER_SYNC_MOVEMENT_MISMATCH", "sale inventory movement identity mismatch", 409);
  }
  const expectedVersion = Number(product.version);
  const resultingVersion = expectedVersion + 1;
  const nextStatus = inventoryStatus(
    product.status,
    productQuantityAfter,
    Number(product.low_stock_threshold),
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
    throw new CashierSyncError("CASHIER_SYNC_PRODUCT_VERSION_CONFLICT", "catalog changed during cashier reconciliation", 409, {
      product_id: line.product_id,
    });
  }
  const keyHash = sha256(
    `cashier-sale:${bundle.cloudMerchantId}:${bundle.operationId}:${line.line_id}`,
  );
  await target.query(
    `INSERT INTO inventory_mutations (
       id, merchant_id, product_id, variant_id, mutation_type,
       before_quantity, after_quantity, expected_version, resulting_version,
       actor_type, actor_account_id, reason_code, idempotency_key_hash,
       request_hash, created_at
     ) VALUES ($1,$2,$3,$4,'adjust',$5,$6,$7,$8,'merchant',$2,$9,$10,$11,$12)`,
    [
      `cashier_mut_${keyHash.slice(0, 40)}`,
      bundle.cloudMerchantId,
      line.product_id,
      line.variant_id || null,
      before,
      after,
      expectedVersion,
      resultingVersion,
      "cashier_sale_sync",
      keyHash,
      bundle.requestHash,
      new Date(bundle.sale.occurred_at),
    ],
  );
  bundle.movements.delete(itemKey(line.product_id, line.variant_id));
  return true;
}

function orderPayment(sale: CashierSale): {
  method: "cash_on_delivery" | "other";
  status: "paid" | "electronic_pending";
  verifiedAt: Date | null;
  confirmationSource: "merchant_confirmed" | null;
} {
  if (sale.payment_method === "cash") {
    return {
      method: "cash_on_delivery",
      status: "paid",
      verifiedAt: new Date(sale.occurred_at),
      confirmationSource: "merchant_confirmed",
    };
  }
  if (sale.payment_status === "paid") {
    return {
      method: "other",
      status: "paid",
      verifiedAt: new Date(sale.occurred_at),
      confirmationSource: "merchant_confirmed",
    };
  }
  return {
    method: "other",
    status: "electronic_pending",
    verifiedAt: null,
    confirmationSource: null,
  };
}

async function insertCanonicalOrder(
  target: OperationalQueryTarget,
  bundle: ValidatedBundle,
): Promise<void> {
  const payment = orderPayment(bundle.sale);
  const metadata = {
    cashier_sync: {
      schema_version: CASHIER_SCHEMA_VERSION,
      operation_id: bundle.operationId,
      request_hash: bundle.requestHash,
      local_merchant_id: bundle.localMerchantId,
      device_id: bundle.deviceId,
      device_sequence: String(bundle.deviceSequence),
      sale_id: bundle.sale.sale_id,
      occurred_at: bundle.sale.occurred_at,
      currency_code: bundle.sale.currency_code,
      currency_fraction_digits: bundle.sale.currency_fraction_digits,
      subtotal_minor: bundle.sale.subtotal_minor,
      discount_minor: bundle.sale.discount_minor,
      total_minor: bundle.sale.total_minor,
      sale_snapshot: bundle.sale,
    },
  };
  await target.query(
    `INSERT INTO orders (
       id, merchant_id, customer_name, status, payment_method, payment_status,
       subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version,
       notes, payment_verified_at, payment_confirmation_source,
       payment_provider, payment_provider_transaction_ref,
       confirmed_at, delivered_at, metadata, created_at, updated_at
     ) VALUES (
       $1,$2,'Cashier sale','delivered',$3,$4,$5,0,$5,'cashier',1,
       $6,$7,$8,$9,$10,$11,$11,$12::jsonb,$11,$11
     )`,
    [
      bundle.sale.sale_id,
      bundle.cloudMerchantId,
      payment.method,
      payment.status,
      bundle.sale.total_minor,
      bundle.sale.note || null,
      payment.verifiedAt,
      payment.confirmationSource,
      bundle.sale.payment_provider || null,
      bundle.sale.payment_reference || null,
      new Date(bundle.sale.occurred_at),
      JSON.stringify(metadata),
    ],
  );
  for (const line of bundle.sale.lines) {
    await target.query(
      `INSERT INTO order_items (
         id, order_id, merchant_id, product_id, product_variant_id,
         product_name_snapshot, variant_snapshot, quantity, unit_price_iqd,
         line_total_iqd, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
      [
        line.line_id,
        bundle.sale.sale_id,
        bundle.cloudMerchantId,
        line.product_id,
        line.variant_id || null,
        line.product_name_snapshot,
        JSON.stringify({
          ...(line.variant_name_snapshot ? { name: line.variant_name_snapshot } : {}),
          ...(line.sku_snapshot ? { sku: line.sku_snapshot } : {}),
          ...(line.barcode_snapshot ? { barcode: line.barcode_snapshot } : {}),
          ...(line.catalog_version ? { catalog_version: line.catalog_version } : {}),
          base_unit_price_minor: line.base_unit_price_minor,
          effective_unit_price_minor: line.effective_unit_price_minor,
          discount_minor: line.discount_minor,
          ...(line.promotion ? { promotion: line.promotion } : {}),
        }),
        line.quantity,
        line.effective_unit_price_minor,
        line.line_total_minor,
        new Date(bundle.sale.occurred_at),
      ],
    );
  }
}

export async function syncCashierSaleAuthoritative(params: {
  merchantId: unknown;
  body: unknown;
}): Promise<CashierSaleSyncResult> {
  const merchantId = identifier(params.merchantId, "merchant_id");
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierSyncError(
      "CASHIER_SYNC_POSTGRES_REQUIRED",
      "cashier cloud sync requires PostgreSQL operational authority",
      503,
    );
  }
  const bundle = validateCashierSaleSyncBundle(params.body);
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
    const existing = await loadExistingOrder(client, merchantId, bundle.sale.sale_id);
    if (existing) {
      const cashierMetadata = metadataCashier(existing.metadata);
      if (
        existing.source_channel !== "cashier" ||
        String(cashierMetadata.operation_id || "") !== bundle.operationId ||
        String(cashierMetadata.request_hash || "") !== bundle.requestHash ||
        String(cashierMetadata.device_id || "") !== bundle.deviceId ||
        String(cashierMetadata.device_sequence || "") !== String(bundle.deviceSequence)
      ) {
        throw new CashierSyncError(
          "CASHIER_SYNC_IDEMPOTENCY_CONFLICT",
          "cashier sale identifier was already used with different content",
          409,
        );
      }
      return {
        operation_id: bundle.operationId,
        order_id: existing.id,
        device_sequence: bundle.deviceSequence,
        replayed: true,
        inventory_mutation_count: 0,
        accepted_entity_ids: bundle.envelopes.map((item) => item.entity_id),
      };
    }

    await assertDeviceSequenceUnused(client, bundle);
    let inventoryMutationCount = 0;
    for (const line of bundle.sale.lines) {
      if (await applyInventoryForLine(client, bundle, line)) inventoryMutationCount += 1;
    }
    if (bundle.movements.size !== 0) {
      throw new CashierSyncError(
        "CASHIER_SYNC_MOVEMENT_MISMATCH",
        "cashier sale bundle contains extra inventory movements",
        409,
        { remaining_movements: bundle.movements.size },
      );
    }
    await insertCanonicalOrder(client, bundle);
    return {
      operation_id: bundle.operationId,
      order_id: bundle.sale.sale_id,
      device_sequence: bundle.deviceSequence,
      replayed: false,
      inventory_mutation_count: inventoryMutationCount,
      accepted_entity_ids: bundle.envelopes.map((item) => item.entity_id),
    };
  });
}
