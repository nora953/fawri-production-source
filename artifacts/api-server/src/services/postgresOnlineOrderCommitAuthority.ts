import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalSerializableTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import {
  planOnlineOrderFulfillmentWithTarget,
} from "./postgresOnlineOrderFulfillmentPlanner";
import {
  priceOnlineOrderWithTarget,
  type OnlineOrderPricedLine,
  type OnlineOrderRequestedItem,
} from "./postgresOnlineOrderPricing";

type ExistingOrderRow = {
  id: string;
  status: string;
  fulfillment_location_id: string | null;
  subtotal_iqd: number;
  delivery_fee_iqd: number;
  total_iqd: number;
  metadata: Record<string, unknown> | null;
};

type InventoryLevelRow = {
  id: string;
  quantity: number;
  version: number;
};

type LegacyProductRow = {
  id: string;
  quantity: number;
  status: string;
  low_stock_threshold: number;
  version: number;
};

export type OnlineOrderCommitResult =
  | {
      outcome: "delivery_unavailable";
      reason: string;
      order_id?: never;
      replayed: false;
    }
  | {
      outcome: "unfulfillable";
      reason: string;
      order_id?: never;
      replayed: false;
    }
  | {
      outcome: "pending_confirmation";
      order_id: string;
      replayed: boolean;
      candidate_location_ids: string[];
      subtotal_minor: number;
      delivery_fee_minor: number;
      total_minor: number;
      currency_code: string;
    }
  | {
      outcome: "committed";
      order_id: string;
      replayed: boolean;
      fulfillment_location_id: string;
      subtotal_minor: number;
      delivery_fee_minor: number;
      total_minor: number;
      currency_code: string;
    }
  | {
      outcome: "replayed";
      order_id: string;
      replayed: true;
      order_status: string;
      fulfillment_location_id?: string;
      subtotal_minor: number;
      delivery_fee_minor: number;
      total_minor: number;
      currency_code: string;
    };

export class OnlineOrderCommitError extends Error {
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
    this.name = "OnlineOrderCommitError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function identifier(value: unknown, field: string, max = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_IDENTIFIER_INVALID",
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
  max: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return identifier(value, field, max);
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_QUANTITY_INVALID",
      `${field} must be a positive safe integer`,
      400,
      { field },
    );
  }
  return parsed;
}

function safeAdd(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_AMOUNT_INVALID",
      `${field} exceeds safe integer range`,
      409,
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : stableJson(value))
    .digest("hex");
}

function deterministicOrderId(merchantId: string, requestId: string): string {
  return `online_order_${sha256(`${merchantId}\0${requestId}`).slice(0, 40)}`;
}

function deterministicOrderItemId(
  orderId: string,
  productId: string,
  variantId?: string,
): string {
  return `online_order_item_${sha256(
    `${orderId}\0${productId}\0${variantId || ""}`,
  ).slice(0, 40)}`;
}

function normalizeItems(
  items: readonly OnlineOrderRequestedItem[],
): OnlineOrderRequestedItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 250) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_ITEMS_INVALID",
      "order items are invalid",
      400,
    );
  }
  const aggregated = new Map<string, OnlineOrderRequestedItem>();
  for (const item of items) {
    const productId = identifier(item.product_id, "product_id", 160);
    const variantId = item.variant_id
      ? identifier(item.variant_id, "variant_id", 160)
      : undefined;
    const quantity = positiveInteger(item.quantity, "quantity");
    const key = `${productId}\0${variantId || ""}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity = safeAdd(existing.quantity, quantity, "quantity");
    } else {
      aggregated.set(key, {
        product_id: productId,
        ...(variantId ? { variant_id: variantId } : {}),
        quantity,
      });
    }
  }
  return [...aggregated.values()].sort((left, right) => {
    const product = left.product_id.localeCompare(right.product_id);
    return product || (left.variant_id || "").localeCompare(right.variant_id || "");
  });
}

function inventoryStatus(
  currentStatus: string,
  quantity: number,
  lowStockThreshold: number,
): string {
  if (currentStatus === "draft" || currentStatus === "hidden_from_fawri") {
    return currentStatus;
  }
  if (quantity === 0) return "out_of_stock";
  if (quantity <= lowStockThreshold) return "low_stock";
  return "available";
}

function commitMetadata(value: Record<string, unknown> | null): Record<string, unknown> {
  const metadata = value && typeof value === "object" ? value : {};
  const online = metadata.online_order_commit;
  return online && typeof online === "object" && !Array.isArray(online)
    ? (online as Record<string, unknown>)
    : {};
}

function normalizeSourceChannel(value: unknown): string {
  const source = optionalText(value, "source_channel", 40) || "online";
  if (!["online", "messenger", "instagram", "web"].includes(source)) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_SOURCE_INVALID",
      "source channel is invalid",
      400,
    );
  }
  return source;
}

async function existingOrder(
  target: OperationalQueryTarget,
  merchantId: string,
  orderId: string,
): Promise<ExistingOrderRow | null> {
  const rows = await operationalQueryRows<ExistingOrderRow>(
    target,
    `SELECT id, status::text AS status, fulfillment_location_id,
            subtotal_iqd, delivery_fee_iqd, total_iqd, metadata
       FROM orders
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, orderId],
  );
  return rows[0] || null;
}

function replayResult(
  order: ExistingOrderRow,
  requestHash: string,
): OnlineOrderCommitResult {
  const metadata = commitMetadata(order.metadata);
  if (String(metadata.request_hash || "") !== requestHash) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_IDEMPOTENCY_CONFLICT",
      "request id was already used for a different order",
      409,
    );
  }
  const currency = String(metadata.currency_code || "IQD");
  return {
    outcome: "replayed",
    order_id: order.id,
    replayed: true,
    order_status: order.status,
    ...(order.fulfillment_location_id
      ? { fulfillment_location_id: order.fulfillment_location_id }
      : {}),
    subtotal_minor: Number(order.subtotal_iqd),
    delivery_fee_minor: Number(order.delivery_fee_iqd),
    total_minor: Number(order.total_iqd),
    currency_code: currency,
  };
}

async function insertOrder(
  target: OperationalQueryTarget,
  input: {
    orderId: string;
    merchantId: string;
    conversationId?: string;
    customerExternalId?: string;
    customerName: string;
    customerPhone?: string;
    customerAddress: string;
    customerArea: string;
    fulfillmentLocationId?: string;
    status: "pending_confirmation" | "confirmed";
    subtotal: number;
    deliveryFee: number;
    total: number;
    sourceChannel: string;
    notes?: string;
    metadata: Record<string, unknown>;
    at: Date;
  },
): Promise<void> {
  await target.query(
    `INSERT INTO orders (
       id, merchant_id, conversation_id, customer_external_id,
       customer_name, customer_phone, customer_address, customer_area,
       fulfillment_location_id, status, payment_method, payment_status,
       subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel,
       version, notes, confirmed_at, metadata, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::order_status,
       'cash_on_delivery','cash_on_delivery',$11,$12,$13,$14,1,$15,
       $16,$17::jsonb,$18,$18
     )`,
    [
      input.orderId,
      input.merchantId,
      input.conversationId || null,
      input.customerExternalId || null,
      input.customerName,
      input.customerPhone || null,
      input.customerAddress,
      input.customerArea,
      input.fulfillmentLocationId || null,
      input.status,
      input.subtotal,
      input.deliveryFee,
      input.total,
      input.sourceChannel,
      input.notes || null,
      input.status === "confirmed" ? input.at : null,
      JSON.stringify(input.metadata),
      input.at,
    ],
  );
}

async function insertOrderItems(
  target: OperationalQueryTarget,
  input: {
    orderId: string;
    merchantId: string;
    lines: OnlineOrderPricedLine[];
    at: Date;
  },
): Promise<void> {
  for (const line of input.lines) {
    await target.query(
      `INSERT INTO order_items (
         id, order_id, merchant_id, product_id, product_variant_id,
         product_name_snapshot, variant_snapshot, quantity, unit_price_iqd,
         line_total_iqd, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
      [
        deterministicOrderItemId(
          input.orderId,
          line.product_id,
          line.variant_id,
        ),
        input.orderId,
        input.merchantId,
        line.product_id,
        line.variant_id || null,
        line.product_name_snapshot,
        JSON.stringify({
          ...line.variant_snapshot,
          catalog_version: line.catalog_version,
          base_unit_price_minor: line.base_unit_price_minor,
          effective_unit_price_minor: line.unit_price_minor,
          ...(line.promotion ? { promotion: line.promotion } : {}),
        }),
        line.quantity,
        line.unit_price_minor,
        line.line_total_minor,
        input.at,
      ],
    );
  }
}

async function deductLine(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    locationId: string;
    orderId: string;
    requestHash: string;
    line: OnlineOrderPricedLine;
    at: Date;
  },
): Promise<{ expected_version: number; resulting_version: number }> {
  const levels = await operationalQueryRows<InventoryLevelRow>(
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
      input.merchantId,
      input.locationId,
      input.line.product_id,
      input.line.variant_id || null,
    ],
  );
  const level = levels[0];
  if (!level) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_INVENTORY_UNALLOCATED",
      "selected location has no inventory allocation for an order item",
      409,
      {
        location_id: input.locationId,
        product_id: input.line.product_id,
        variant_id: input.line.variant_id || null,
      },
    );
  }
  const before = Number(level.quantity);
  const expectedVersion = Number(level.version);
  if (
    !Number.isSafeInteger(before) ||
    before < input.line.quantity ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion <= 0
  ) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_STOCK_CHANGED",
      "selected location can no longer fulfill the order",
      409,
      {
        location_id: input.locationId,
        product_id: input.line.product_id,
        available_quantity: Number.isSafeInteger(before) ? before : null,
        requested_quantity: input.line.quantity,
      },
    );
  }
  const after = before - input.line.quantity;
  const resultingVersion = expectedVersion + 1;

  const updated = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE location_inventory_levels
        SET quantity = $5,
            version = version + 1,
            updated_at = $7
      WHERE merchant_id = $1
        AND location_id = $2
        AND product_id = $3
        AND variant_id IS NOT DISTINCT FROM $4::text
        AND version = $6
      RETURNING id`,
    [
      input.merchantId,
      input.locationId,
      input.line.product_id,
      input.line.variant_id || null,
      after,
      expectedVersion,
      input.at,
    ],
  );
  if (updated.length !== 1) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_STOCK_CHANGED",
      "inventory changed during order commit",
      409,
    );
  }

  if (input.line.variant_id) {
    await target.query(
      `UPDATE product_variants
          SET quantity = GREATEST(quantity - $4, 0),
              updated_at = $5
        WHERE merchant_id = $1 AND product_id = $2 AND id = $3`,
      [
        input.merchantId,
        input.line.product_id,
        input.line.variant_id,
        input.line.quantity,
        input.at,
      ],
    );
  }

  const products = await operationalQueryRows<LegacyProductRow>(
    target,
    `SELECT id, quantity, status, low_stock_threshold, version
       FROM products
      WHERE merchant_id = $1
        AND id = $2
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE`,
    [input.merchantId, input.line.product_id],
  );
  const product = products[0];
  if (!product) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_PRODUCT_CHANGED",
      "catalog product disappeared during order commit",
      409,
    );
  }
  const legacyBefore = Number(product.quantity);
  const lowThreshold = Number(product.low_stock_threshold);
  const catalogVersion = Number(product.version);
  if (
    !Number.isSafeInteger(legacyBefore) ||
    legacyBefore < 0 ||
    !Number.isSafeInteger(lowThreshold) ||
    lowThreshold < 0 ||
    !Number.isSafeInteger(catalogVersion) ||
    catalogVersion !== input.line.catalog_version
  ) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_PRODUCT_CHANGED",
      "catalog definition changed during order commit",
      409,
    );
  }
  const legacyAfter = Math.max(0, legacyBefore - input.line.quantity);
  const nextStatus = inventoryStatus(
    String(product.status),
    legacyAfter,
    lowThreshold,
  );
  const productUpdated = await operationalQueryRows<{ id: string }>(
    target,
    `UPDATE products
        SET quantity = $3,
            status = $4,
            updated_at = $6
      WHERE merchant_id = $1
        AND id = $2
        AND version = $5
        AND deleted_at IS NULL
      RETURNING id`,
    [
      input.merchantId,
      input.line.product_id,
      legacyAfter,
      nextStatus,
      catalogVersion,
      input.at,
    ],
  );
  if (productUpdated.length !== 1) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_PRODUCT_CHANGED",
      "catalog definition changed during order commit",
      409,
    );
  }

  const idempotencyKeyHash = sha256(
    `online-order:${input.merchantId}:${input.orderId}:${input.line.product_id}:${input.line.variant_id || ""}`,
  );
  const mutationRequestHash = sha256({
    order_id: input.orderId,
    request_hash: input.requestHash,
    location_id: input.locationId,
    product_id: input.line.product_id,
    variant_id: input.line.variant_id || null,
    quantity: input.line.quantity,
    before,
    after,
    expected_version: expectedVersion,
    resulting_version: resultingVersion,
  });
  await target.query(
    `INSERT INTO inventory_mutations (
       id, merchant_id, location_id, product_id, variant_id, mutation_type,
       before_quantity, after_quantity, expected_version, resulting_version,
       actor_type, actor_account_id, reason_code, idempotency_key_hash,
       request_hash, created_at
     ) VALUES (
       $1,$2,$3,$4,$5,'adjust',$6,$7,$8,$9,
       'online_order',NULL,'online_order_commit',$10,$11,$12
     )`,
    [
      `online_order_mut_${idempotencyKeyHash.slice(0, 40)}`,
      input.merchantId,
      input.locationId,
      input.line.product_id,
      input.line.variant_id || null,
      before,
      after,
      expectedVersion,
      resultingVersion,
      idempotencyKeyHash,
      mutationRequestHash,
      input.at,
    ],
  );

  return {
    expected_version: expectedVersion,
    resulting_version: resultingVersion,
  };
}

export async function commitOnlineOrderWithTarget(
  target: OperationalQueryTarget,
  params: {
    merchantId: unknown;
    requestId: unknown;
    conversationId?: unknown;
    customerExternalId?: unknown;
    customerName: unknown;
    customerPhone?: unknown;
    customerAddress: unknown;
    area?: unknown;
    requestedItems: readonly OnlineOrderRequestedItem[];
    paymentMethod?: unknown;
    sourceChannel?: unknown;
    notes?: unknown;
    customerLatitude?: unknown;
    customerLongitude?: unknown;
    inventoryFreshnessMaxAgeMs?: unknown;
    now?: Date | string | number;
  },
): Promise<OnlineOrderCommitResult> {
  const merchantId = identifier(params.merchantId, "merchant_id", 128);
  const requestId = identifier(params.requestId, "request_id", 200);
  const conversationId = optionalText(params.conversationId, "conversation_id", 200);
  const customerExternalId = optionalText(
    params.customerExternalId,
    "customer_external_id",
    200,
  );
  const customerName = identifier(params.customerName, "customer_name", 300);
  const customerPhone = optionalText(params.customerPhone, "customer_phone", 80);
  const customerAddress = identifier(
    params.customerAddress,
    "customer_address",
    1000,
  );
  const area = optionalText(params.area, "customer_area", 500) || customerAddress;
  const notes = optionalText(params.notes, "notes", 2000);
  const sourceChannel = normalizeSourceChannel(params.sourceChannel);
  const paymentMethod = String(params.paymentMethod || "cash_on_delivery").trim();
  if (paymentMethod !== "cash_on_delivery") {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_PAYMENT_FLOW_NOT_READY",
      "electronic payment inventory commitment is not enabled in this flow yet",
      409,
    );
  }
  const requestedItems = normalizeItems(params.requestedItems);
  const at = params.now === undefined ? new Date() : new Date(params.now);
  if (!Number.isFinite(at.getTime())) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_TIME_INVALID",
      "order commit time is invalid",
      400,
    );
  }

  const requestHash = sha256({
    merchant_id: merchantId,
    request_id: requestId,
    conversation_id: conversationId || null,
    customer_external_id: customerExternalId || null,
    customer_name: customerName,
    customer_phone: customerPhone || null,
    customer_address: customerAddress,
    customer_area: area,
    requested_items: requestedItems,
    payment_method: paymentMethod,
    source_channel: sourceChannel,
    notes: notes || null,
  });
  const orderId = deterministicOrderId(merchantId, requestId);

  await target.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`online_order|${merchantId}|${requestId}`],
  );
  const prior = await existingOrder(target, merchantId, orderId);
  if (prior) return replayResult(prior, requestHash);

  const pricing = await priceOnlineOrderWithTarget(target, {
    merchantId,
    requestedItems,
    at,
  });

  const plan = await planOnlineOrderFulfillmentWithTarget(target, {
    merchantId,
    area,
    subtotalIqd: pricing.subtotal_minor,
    requestedItems,
    customerLatitude: params.customerLatitude,
    customerLongitude: params.customerLongitude,
    inventoryFreshnessMaxAgeMs: params.inventoryFreshnessMaxAgeMs,
    now: at,
  });

  if (plan.status === "delivery_unavailable") {
    return {
      outcome: "delivery_unavailable",
      reason: plan.reason,
      replayed: false,
    };
  }

  const routing = plan.routing;
  if (routing.status === "unfulfillable") {
    return {
      outcome: "unfulfillable",
      reason: routing.reason,
      replayed: false,
    };
  }

  const subtotal = pricing.subtotal_minor;
  const deliveryFee = Number(plan.delivery_quote.effective_fee_iqd);
  const total = safeAdd(subtotal, deliveryFee, "total");
  const customerArea =
    plan.delivery_quote.matched_area || area;

  if (routing.status === "pending_fulfillment_confirmation") {
    const metadata = {
      online_order_commit: {
        schema_version: 1,
        request_id: requestId,
        request_hash: requestHash,
        currency_code: pricing.currency_code,
        inventory_committed: false,
        routing_status: routing.status,
        routing_reason: routing.reason,
        candidate_location_ids: routing.candidate_location_ids,
        eligible_location_ids: plan.eligible_location_ids,
        delivery_area_rate_id: plan.delivery_quote.area_rate_id || null,
        pricing_snapshot: pricing,
        planned_at: at.toISOString(),
      },
    };
    await insertOrder(target, {
      orderId,
      merchantId,
      conversationId,
      customerExternalId,
      customerName,
      customerPhone,
      customerAddress,
      customerArea,
      status: "pending_confirmation",
      subtotal,
      deliveryFee,
      total,
      sourceChannel,
      notes,
      metadata,
      at,
    });
    await insertOrderItems(target, {
      orderId,
      merchantId,
      lines: pricing.lines,
      at,
    });
    return {
      outcome: "pending_confirmation",
      order_id: orderId,
      replayed: false,
      candidate_location_ids: routing.candidate_location_ids,
      subtotal_minor: subtotal,
      delivery_fee_minor: deliveryFee,
      total_minor: total,
      currency_code: pricing.currency_code,
    };
  }

  const locationId = routing.location_id;
  const locationLock = await operationalQueryRows<{
    id: string;
    online_fulfillment_enabled: boolean;
    operational_status: string;
    accept_online_orders_while_closed: boolean;
  }>(
    target,
    `SELECT id, online_fulfillment_enabled, operational_status,
            accept_online_orders_while_closed
       FROM merchant_locations
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, locationId],
  );
  const location = locationLock[0];
  if (
    !location ||
    !location.online_fulfillment_enabled ||
    location.operational_status === "temporarily_unavailable" ||
    (location.operational_status === "closed" &&
      !location.accept_online_orders_while_closed)
  ) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_LOCATION_CHANGED",
      "selected fulfillment location is no longer eligible",
      409,
    );
  }

  const inventoryVersions: Record<string, {
    expected_version: number;
    resulting_version: number;
  }> = {};
  for (const line of pricing.lines) {
    const versions = await deductLine(target, {
      merchantId,
      locationId,
      orderId,
      requestHash,
      line,
      at,
    });
    inventoryVersions[
      `${line.product_id}:${line.variant_id || ""}`
    ] = versions;
  }

  await target.query(
    `UPDATE merchant_locations
        SET inventory_fresh_at = $3,
            updated_at = GREATEST(updated_at, $3)
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, locationId, at],
  );

  const metadata = {
    online_order_commit: {
      schema_version: 1,
      request_id: requestId,
      request_hash: requestHash,
      currency_code: pricing.currency_code,
      inventory_committed: true,
      routing_status: routing.status,
      routing_reason: routing.reason,
      fulfillment_location_id: locationId,
      eligible_location_ids: plan.eligible_location_ids,
      delivery_area_rate_id: plan.delivery_quote.area_rate_id || null,
      inventory_versions: inventoryVersions,
      pricing_snapshot: pricing,
      committed_at: at.toISOString(),
    },
  };
  await insertOrder(target, {
    orderId,
    merchantId,
    conversationId,
    customerExternalId,
    customerName,
    customerPhone,
    customerAddress,
    customerArea,
    fulfillmentLocationId: locationId,
    status: "confirmed",
    subtotal,
    deliveryFee,
    total,
    sourceChannel,
    notes,
    metadata,
    at,
  });
  await insertOrderItems(target, {
    orderId,
    merchantId,
    lines: pricing.lines,
    at,
  });

  return {
    outcome: "committed",
    order_id: orderId,
    replayed: false,
    fulfillment_location_id: locationId,
    subtotal_minor: subtotal,
    delivery_fee_minor: deliveryFee,
    total_minor: total,
    currency_code: pricing.currency_code,
  };
}

export async function commitOnlineOrderAuthoritative(params: {
  merchantId: unknown;
  requestId: unknown;
  conversationId?: unknown;
  customerExternalId?: unknown;
  customerName: unknown;
  customerPhone?: unknown;
  customerAddress: unknown;
  area?: unknown;
  requestedItems: readonly OnlineOrderRequestedItem[];
  paymentMethod?: unknown;
  sourceChannel?: unknown;
  notes?: unknown;
  customerLatitude?: unknown;
  customerLongitude?: unknown;
  inventoryFreshnessMaxAgeMs?: unknown;
}): Promise<OnlineOrderCommitResult> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OnlineOrderCommitError(
      "ONLINE_ORDER_COMMIT_POSTGRES_REQUIRED",
      "online order commit requires PostgreSQL authority",
      503,
    );
  }
  const merchantId = identifier(params.merchantId, "merchant_id", 128);
  return withMerchantOperationalSerializableTransaction(
    merchantId,
    (client) =>
      commitOnlineOrderWithTarget(client, {
        ...params,
        merchantId,
      }),
  );
}
