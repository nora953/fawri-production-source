import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import { CashierSyncError } from "./postgresCashierSyncAuthority";

const CASHIER_SCHEMA_VERSION = 1;
const MAX_ENVELOPES = 128;
const MAX_LINES = 100;
const MAX_TEXT = 500;
const CASHIER_RETURN_REFUND_ALLOCATION_VERSION = 2 as const;

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

type OriginalSaleLine = {
  line_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  effective_unit_price_minor: number;
  line_total_minor: number;
};

type OriginalSale = {
  sale_id: string;
  operation_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  source: "cashier";
  status: "completed";
  currency_code: "IQD";
  currency_fraction_digits: 0;
  total_minor: number;
  lines: OriginalSaleLine[];
};

type ReturnLine = {
  original_line_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  effective_unit_price_minor: number;
  refund_minor: number;
};

type ReturnSnapshot = {
  refund_allocation_version?: 2;
  return_id: string;
  operation_id: string;
  sale_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  lines: ReturnLine[];
  refund_total_minor: number;
  currency_code: "IQD";
  currency_fraction_digits: 0;
  note?: string;
  occurred_at: string;
};

type VoidSnapshot = {
  operation_id: string;
  sale_id: string;
  device_id: string;
  device_sequence: number;
  refund_total_minor: number;
  currency_code: "IQD";
  currency_fraction_digits: 0;
  note?: string;
  occurred_at: string;
};

type CompensationMovement = {
  movement_id: string;
  operation_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  product_id: string;
  variant_id?: string;
  delta: number;
  reason: "return" | "sale_void";
  related_sale_id: string;
  note?: string;
  occurred_at: string;
};

type CompensationKind = "return" | "void";

type ValidatedCompensationBundle = {
  kind: CompensationKind;
  cloudMerchantId: string;
  localMerchantId: string;
  deviceId: string;
  deviceSequence: number;
  operationId: string;
  saleId: string;
  occurredAt: string;
  returnSnapshot?: ReturnSnapshot;
  voidSnapshot?: VoidSnapshot;
  movements: Map<string, CompensationMovement>;
  envelopes: CashierEnvelope[];
  requestHash: string;
};

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

function parseEnvelope(value: unknown): CashierEnvelope {
  const raw = record(value);
  const schemaVersion = Number(raw.schema_version);
  if (schemaVersion !== CASHIER_SCHEMA_VERSION) {
    throw new CashierSyncError(
      "CASHIER_SYNC_SCHEMA_UNSUPPORTED",
      "cashier sync schema is unsupported",
      409,
    );
  }
  const operation = identifier(raw.operation, "envelope.operation", 32);
  if (operation !== "append" && operation !== "void") {
    throw new CashierSyncError(
      "CASHIER_SYNC_INVALID",
      "compensation envelope operation is invalid",
      400,
    );
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

function parseReturnLine(value: unknown): ReturnLine {
  const raw = record(value);
  const quantity = positiveInteger(raw.quantity, "return.line.quantity");
  const effective = nonNegativeInteger(
    raw.effective_unit_price_minor,
    "return.line.effective_unit_price_minor",
  );
  const refund = nonNegativeInteger(raw.refund_minor, "return.line.refund_minor");
  return {
    original_line_id: identifier(raw.original_line_id, "return.line.original_line_id"),
    product_id: identifier(raw.product_id, "return.line.product_id"),
    ...(raw.variant_id
      ? { variant_id: identifier(raw.variant_id, "return.line.variant_id") }
      : {}),
    quantity,
    effective_unit_price_minor: effective,
    refund_minor: refund,
  };
}

function parseReturnSnapshot(value: unknown): ReturnSnapshot {
  const raw = record(value);
  if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > MAX_LINES) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", "return lines are invalid", 400);
  }
  const currencyCode = identifier(raw.currency_code, "return.currency_code", 3);
  const fractionDigits = Number(raw.currency_fraction_digits);
  if (currencyCode !== "IQD" || fractionDigits !== 0) {
    throw new CashierSyncError(
      "CASHIER_SYNC_CURRENCY_UNSUPPORTED",
      "cashier compensation sync currently accepts IQD minor units only",
      409,
    );
  }
  const allocationVersion =
    raw.refund_allocation_version === undefined ||
    raw.refund_allocation_version === null
      ? undefined
      : Number(raw.refund_allocation_version);
  if (
    allocationVersion !== undefined &&
    allocationVersion !== CASHIER_RETURN_REFUND_ALLOCATION_VERSION
  ) {
    throw new CashierSyncError(
      "CASHIER_SYNC_SCHEMA_UNSUPPORTED",
      "cashier return refund allocation version is unsupported",
      409,
    );
  }
  const lines = raw.lines.map(parseReturnLine);
  const lineIds = new Set<string>();
  let refundTotal = 0;
  for (const line of lines) {
    if (lineIds.has(line.original_line_id)) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "duplicate return line", 400);
    }
    lineIds.add(line.original_line_id);
    if (
      allocationVersion === undefined &&
      line.refund_minor !==
        safeMultiply(
          line.effective_unit_price_minor,
          line.quantity,
          "return.line.refund_minor",
        )
    ) {
      throw new CashierSyncError(
        "CASHIER_SYNC_INVALID",
        "legacy return line refund is inconsistent",
        400,
      );
    }
    refundTotal = safeAdd(refundTotal, line.refund_minor, "return.refund_total_minor");
  }
  const claimedRefund = nonNegativeInteger(raw.refund_total_minor, "return.refund_total_minor");
  if (claimedRefund !== refundTotal) {
    throw new CashierSyncError(
      "CASHIER_SYNC_INVALID",
      "return refund total is inconsistent",
      400,
    );
  }
  return {
    ...(allocationVersion === CASHIER_RETURN_REFUND_ALLOCATION_VERSION
      ? { refund_allocation_version: CASHIER_RETURN_REFUND_ALLOCATION_VERSION }
      : {}),
    return_id: identifier(raw.return_id, "return.return_id"),
    operation_id: identifier(raw.operation_id, "return.operation_id"),
    sale_id: identifier(raw.sale_id, "return.sale_id"),
    local_merchant_id: identifier(raw.local_merchant_id, "return.local_merchant_id"),
    ...(raw.cloud_merchant_id
      ? { cloud_merchant_id: identifier(raw.cloud_merchant_id, "return.cloud_merchant_id") }
      : {}),
    device_id: identifier(raw.device_id, "return.device_id"),
    device_sequence: positiveInteger(raw.device_sequence, "return.device_sequence"),
    lines,
    refund_total_minor: claimedRefund,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    ...(raw.note ? { note: optionalText(raw.note, "return.note") } : {}),
    occurred_at: instant(raw.occurred_at, "return.occurred_at"),
  };
}

function parseVoidSnapshot(value: unknown): VoidSnapshot {
  const raw = record(value);
  const currencyCode = identifier(raw.currency_code, "void.currency_code", 3);
  const fractionDigits = Number(raw.currency_fraction_digits);
  if (currencyCode !== "IQD" || fractionDigits !== 0) {
    throw new CashierSyncError(
      "CASHIER_SYNC_CURRENCY_UNSUPPORTED",
      "cashier compensation sync currently accepts IQD minor units only",
      409,
    );
  }
  return {
    operation_id: identifier(raw.operation_id, "void.operation_id"),
    sale_id: identifier(raw.sale_id, "void.sale_id"),
    device_id: identifier(raw.device_id, "void.device_id"),
    device_sequence: positiveInteger(raw.device_sequence, "void.device_sequence"),
    refund_total_minor: nonNegativeInteger(raw.refund_total_minor, "void.refund_total_minor"),
    currency_code: "IQD",
    currency_fraction_digits: 0,
    ...(raw.note ? { note: optionalText(raw.note, "void.note") } : {}),
    occurred_at: instant(raw.occurred_at, "void.occurred_at"),
  };
}

function parseMovement(
  value: unknown,
  expectedReason: CompensationMovement["reason"],
): CompensationMovement {
  const raw = record(value);
  const reason = identifier(raw.reason, "movement.reason", 64);
  if (reason !== expectedReason) {
    throw new CashierSyncError(
      "CASHIER_SYNC_INVALID",
      `compensation sync requires ${expectedReason} movements`,
      400,
    );
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
    delta: positiveInteger(raw.delta, "movement.delta"),
    reason: expectedReason,
    related_sale_id: identifier(raw.related_sale_id, "movement.related_sale_id"),
    ...(raw.note ? { note: optionalText(raw.note, "movement.note") } : {}),
    occurred_at: instant(raw.occurred_at, "movement.occurred_at"),
  };
}

function parseOriginalSale(value: unknown): OriginalSale {
  const raw = record(value);
  if (
    identifier(raw.source, "sale.source", 32) !== "cashier" ||
    identifier(raw.status, "sale.status", 32) !== "completed"
  ) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "original cashier sale lifecycle is invalid",
      409,
    );
  }
  if (
    identifier(raw.currency_code, "sale.currency_code", 3) !== "IQD" ||
    Number(raw.currency_fraction_digits) !== 0
  ) {
    throw new CashierSyncError(
      "CASHIER_SYNC_CURRENCY_UNSUPPORTED",
      "original cashier sale currency is unsupported",
      409,
    );
  }
  if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > MAX_LINES) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "original cashier sale lines are invalid",
      409,
    );
  }
  const lines = raw.lines.map((value) => {
    const line = record(value);
    return {
      line_id: identifier(line.line_id, "sale.line.line_id"),
      product_id: identifier(line.product_id, "sale.line.product_id"),
      ...(line.variant_id
        ? { variant_id: identifier(line.variant_id, "sale.line.variant_id") }
        : {}),
      quantity: positiveInteger(line.quantity, "sale.line.quantity"),
      effective_unit_price_minor: nonNegativeInteger(
        line.effective_unit_price_minor,
        "sale.line.effective_unit_price_minor",
      ),
      line_total_minor: nonNegativeInteger(
        line.line_total_minor,
        "sale.line.line_total_minor",
      ),
    } satisfies OriginalSaleLine;
  });
  const lineIds = new Set<string>();
  const itemKeys = new Set<string>();
  let preManualDiscountTotal = 0;
  for (const line of lines) {
    if (
      line.line_total_minor !==
      safeMultiply(
        line.effective_unit_price_minor,
        line.quantity,
        "sale.line.line_total_minor",
      )
    ) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
        "original cashier sale line total is inconsistent",
        409,
      );
    }
    preManualDiscountTotal = safeAdd(
      preManualDiscountTotal,
      line.line_total_minor,
      "sale total",
    );
    if (lineIds.has(line.line_id) || itemKeys.has(itemKey(line.product_id, line.variant_id))) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
        "original cashier sale contains duplicate lines",
        409,
      );
    }
    lineIds.add(line.line_id);
    itemKeys.add(itemKey(line.product_id, line.variant_id));
  }
  const totalMinor = nonNegativeInteger(raw.total_minor, "sale.total_minor");
  if (totalMinor > preManualDiscountTotal) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "original cashier sale total exceeds immutable line evidence",
      409,
    );
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
    currency_code: "IQD",
    currency_fraction_digits: 0,
    total_minor: totalMinor,
    lines,
  };
}

export function validateCashierCompensationSyncBundle(
  body: unknown,
): ValidatedCompensationBundle {
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
  const envelopeIds = new Set<string>();
  for (const envelope of envelopes) {
    if (
      envelope.operation_id !== operationId ||
      envelope.device_id !== deviceId ||
      envelope.device_sequence !== deviceSequence
    ) {
      throw new CashierSyncError(
        "CASHIER_SYNC_INVALID",
        "compensation envelope operation identity mismatch",
        400,
      );
    }
    if (
      envelope.entity_type !== "return" &&
      envelope.entity_type !== "sale" &&
      envelope.entity_type !== "inventory_movement"
    ) {
      throw new CashierSyncError(
        "CASHIER_SYNC_ENTITY_UNSUPPORTED",
        "compensation sync bundle contains an unsupported entity",
        409,
      );
    }
    const envelopeKey = `${envelope.entity_type}\u0000${envelope.entity_id}`;
    if (envelopeIds.has(envelopeKey)) {
      throw new CashierSyncError(
        "CASHIER_SYNC_INVALID",
        "compensation bundle contains duplicate entity evidence",
        400,
      );
    }
    envelopeIds.add(envelopeKey);
  }

  const returnEnvelopes = envelopes.filter((item) => item.entity_type === "return");
  const saleEnvelopes = envelopes.filter((item) => item.entity_type === "sale");
  let kind: CompensationKind;
  let saleId: string;
  let occurredAt: string;
  let returnSnapshot: ReturnSnapshot | undefined;
  let voidSnapshot: VoidSnapshot | undefined;

  if (returnEnvelopes.length === 1 && saleEnvelopes.length === 0) {
    kind = "return";
    const envelope = returnEnvelopes[0];
    if (envelope.operation !== "append") {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "return envelope must append", 400);
    }
    returnSnapshot = parseReturnSnapshot(envelope.payload);
    saleId = returnSnapshot.sale_id;
    occurredAt = returnSnapshot.occurred_at;
    if (
      envelope.entity_id !== returnSnapshot.return_id ||
      envelope.occurred_at !== returnSnapshot.occurred_at ||
      returnSnapshot.operation_id !== operationId ||
      returnSnapshot.local_merchant_id !== localMerchantId ||
      returnSnapshot.device_id !== deviceId ||
      returnSnapshot.device_sequence !== deviceSequence
    ) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "return envelope payload mismatch", 400);
    }
    if (
      returnSnapshot.cloud_merchant_id &&
      returnSnapshot.cloud_merchant_id !== cloudMerchantId
    ) {
      throw new CashierSyncError(
        "CASHIER_SYNC_TENANT_MISMATCH",
        "return cloud merchant mismatch",
        403,
      );
    }
  } else if (saleEnvelopes.length === 1 && returnEnvelopes.length === 0) {
    kind = "void";
    const envelope = saleEnvelopes[0];
    if (envelope.operation !== "void") {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "void sale envelope is invalid", 400);
    }
    const salePayload = record(envelope.payload);
    if (identifier(salePayload.status, "void.sale.status", 32) !== "voided") {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "void sale status is invalid", 400);
    }
    if (Array.isArray(salePayload.returns) && salePayload.returns.length > 0) {
      throw new CashierSyncError(
        "CASHIER_SYNC_INVALID",
        "a sale with returns cannot be voided",
        400,
      );
    }
    voidSnapshot = parseVoidSnapshot(salePayload.void);
    saleId = identifier(salePayload.sale_id, "void.sale.sale_id");
    occurredAt = voidSnapshot.occurred_at;
    if (
      envelope.entity_id !== saleId ||
      envelope.occurred_at !== voidSnapshot.occurred_at ||
      voidSnapshot.operation_id !== operationId ||
      voidSnapshot.sale_id !== saleId ||
      voidSnapshot.device_id !== deviceId ||
      voidSnapshot.device_sequence !== deviceSequence
    ) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "void envelope payload mismatch", 400);
    }
    if (
      identifier(salePayload.local_merchant_id, "void.sale.local_merchant_id") !==
      localMerchantId
    ) {
      throw new CashierSyncError(
        "CASHIER_SYNC_TENANT_MISMATCH",
        "void local merchant mismatch",
        403,
      );
    }
    if (
      salePayload.cloud_merchant_id &&
      identifier(salePayload.cloud_merchant_id, "void.sale.cloud_merchant_id") !==
        cloudMerchantId
    ) {
      throw new CashierSyncError(
        "CASHIER_SYNC_TENANT_MISMATCH",
        "void cloud merchant mismatch",
        403,
      );
    }
  } else {
    throw new CashierSyncError(
      "CASHIER_SYNC_INVALID",
      "compensation bundle must contain exactly one return or one void sale",
      400,
    );
  }

  const expectedMovementReason = kind === "return" ? "return" : "sale_void";
  const movements = new Map<string, CompensationMovement>();
  for (const envelope of envelopes.filter((item) => item.entity_type === "inventory_movement")) {
    if (envelope.operation !== "append") {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "inventory movement must append", 400);
    }
    const movement = parseMovement(envelope.payload, expectedMovementReason);
    if (
      envelope.entity_id !== movement.movement_id ||
      envelope.occurred_at !== movement.occurred_at ||
      movement.operation_id !== operationId ||
      movement.local_merchant_id !== localMerchantId ||
      movement.device_id !== deviceId ||
      movement.device_sequence !== deviceSequence ||
      movement.related_sale_id !== saleId
    ) {
      throw new CashierSyncError(
        "CASHIER_SYNC_INVALID",
        "compensation inventory movement payload mismatch",
        400,
      );
    }
    if (movement.cloud_merchant_id && movement.cloud_merchant_id !== cloudMerchantId) {
      throw new CashierSyncError(
        "CASHIER_SYNC_TENANT_MISMATCH",
        "compensation movement cloud merchant mismatch",
        403,
      );
    }
    const key = itemKey(movement.product_id, movement.variant_id);
    if (movements.has(key)) {
      throw new CashierSyncError(
        "CASHIER_SYNC_INVALID",
        "duplicate compensation inventory movement",
        400,
      );
    }
    movements.set(key, movement);
  }

  const normalizedForHash = {
    schema_version: CASHIER_SCHEMA_VERSION,
    kind,
    cloud_merchant_id: cloudMerchantId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    device_sequence: deviceSequence,
    operation_id: operationId,
    sale_id: saleId,
    ...(returnSnapshot ? { return_snapshot: returnSnapshot } : {}),
    ...(voidSnapshot ? { void_snapshot: voidSnapshot } : {}),
    movements: [...movements.values()].sort((left, right) =>
      itemKey(left.product_id, left.variant_id).localeCompare(
        itemKey(right.product_id, right.variant_id),
      ),
    ),
  };

  return {
    kind,
    cloudMerchantId,
    localMerchantId,
    deviceId,
    deviceSequence,
    operationId,
    saleId,
    occurredAt,
    ...(returnSnapshot ? { returnSnapshot } : {}),
    ...(voidSnapshot ? { voidSnapshot } : {}),
    movements,
    envelopes,
    requestHash: sha256(normalizedForHash),
  };
}

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

function adjustedLineRevenueById(sale: OriginalSale): Map<string, number> {
  const preManualDiscountTotal = sale.lines.reduce(
    (sum, line) => safeAdd(sum, line.line_total_minor, "sale total"),
    0,
  );
  if (sale.total_minor > preManualDiscountTotal) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "original cashier sale total exceeds immutable line evidence",
      409,
    );
  }

  let remainingBase = BigInt(preManualDiscountTotal);
  let remainingDiscount = BigInt(preManualDiscountTotal - sale.total_minor);
  const adjusted = new Map<string, number>();

  sale.lines.forEach((line, index) => {
    const lineBase = BigInt(line.line_total_minor);
    const allocatedDiscount =
      remainingDiscount === 0n
        ? 0n
        : index === sale.lines.length - 1
          ? remainingDiscount
          : remainingBase > 0n
            ? (remainingDiscount * lineBase) / remainingBase
            : 0n;
    if (allocatedDiscount < 0n || allocatedDiscount > lineBase) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
        "cashier manual discount allocation is invalid",
        409,
      );
    }
    const charged = Number(lineBase - allocatedDiscount);
    if (!Number.isSafeInteger(charged) || charged < 0) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
        "cashier manual discount allocation overflowed",
        409,
      );
    }
    adjusted.set(line.line_id, charged);
    remainingBase -= lineBase;
    remainingDiscount -= allocatedDiscount;
  });

  if (remainingBase !== 0n || remainingDiscount !== 0n) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "cashier manual discount allocation is inconsistent",
      409,
    );
  }
  return adjusted;
}

function allocatedReturnRefundMinor(input: {
  sale: OriginalSale;
  line: OriginalSaleLine;
  alreadyReturned: number;
  returnQuantity: number;
}): number {
  const returnedAfter = input.alreadyReturned + input.returnQuantity;
  if (
    !Number.isSafeInteger(input.alreadyReturned) ||
    input.alreadyReturned < 0 ||
    !Number.isSafeInteger(input.returnQuantity) ||
    input.returnQuantity <= 0 ||
    !Number.isSafeInteger(returnedAfter) ||
    returnedAfter > input.line.quantity
  ) {
    throw new CashierSyncError(
      "CASHIER_RETURN_QUANTITY_EXCEEDS_SOLD",
      "return quantity exceeds the remaining returnable quantity",
      409,
      {
        original_line_id: input.line.line_id,
        remaining_quantity: Math.max(
          0,
          input.line.quantity - input.alreadyReturned,
        ),
      },
    );
  }

  const chargedLineRevenue = adjustedLineRevenueById(input.sale).get(
    input.line.line_id,
  );
  if (chargedLineRevenue === undefined) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "cashier return line allocation is missing",
      409,
    );
  }
  const quantityBig = BigInt(input.line.quantity);
  const revenueBig = BigInt(chargedLineRevenue);
  const before =
    (revenueBig * BigInt(input.alreadyReturned)) / quantityBig;
  const after =
    (revenueBig * BigInt(returnedAfter)) / quantityBig;
  const refund = Number(after - before);
  if (!Number.isSafeInteger(refund) || refund < 0) {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "cashier return refund allocation overflowed",
      409,
    );
  }
  return refund;
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
      snapshot.refund_allocation_version ===
      CASHIER_RETURN_REFUND_ALLOCATION_VERSION
        ? allocatedReturnRefundMinor({
            sale: originalSale,
            line,
            alreadyReturned,
            returnQuantity: requested.quantity,
          })
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
