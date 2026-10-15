import crypto from "node:crypto";
import { CashierSyncError } from "./postgresCashierSyncAuthority";
import {
  CASHIER_REFUND_PRICING_VERSION,
  cashierAdjustedLineRevenueById,
} from "./cashierRefundPricing";

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

export type OriginalSaleLine = {
  line_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  effective_unit_price_minor: number;
  line_total_minor: number;
};

export type OriginalSale = {
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
  manual_discount_minor: number;
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
  refund_pricing_version?: 2;
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

export type CompensationMovement = {
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

export type CompensationKind = "return" | "void";

export type ValidatedCompensationBundle = {
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

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function identifier(value: unknown, field: string, maxLength = 200): string {
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

export function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} is invalid`, 400, { field });
  }
  return parsed;
}

export function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} is invalid`, 400, { field });
  }
  return parsed;
}

export function instant(value: unknown, field: string): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} is invalid`, 400, { field });
  }
  return parsed.toISOString();
}

export function safeMultiply(left: number, right: number, field: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CashierSyncError("CASHIER_SYNC_INVALID", `${field} overflow`, 400, { field });
  }
  return result;
}

export function safeAdd(left: number, right: number, field: string): number {
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

export function sha256(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function itemKey(productId: string, variantId?: string): string {
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
  const lines = raw.lines.map(parseReturnLine);
  const lineIds = new Set<string>();
  let refundTotal = 0;
  for (const line of lines) {
    if (lineIds.has(line.original_line_id)) {
      throw new CashierSyncError("CASHIER_SYNC_INVALID", "duplicate return line", 400);
    }
    lineIds.add(line.original_line_id);
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
  const refundPricingVersion =
    raw.refund_pricing_version === undefined
      ? undefined
      : Number(raw.refund_pricing_version);
  if (
    refundPricingVersion !== undefined &&
    refundPricingVersion !== CASHIER_REFUND_PRICING_VERSION
  ) {
    throw new CashierSyncError(
      "CASHIER_SYNC_INVALID",
      "return refund pricing version is unsupported",
      400,
    );
  }
  return {
    ...(refundPricingVersion === CASHIER_REFUND_PRICING_VERSION
      ? { refund_pricing_version: CASHIER_REFUND_PRICING_VERSION }
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

export function parseOriginalSale(value: unknown): OriginalSale {
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
    const quantity = positiveInteger(line.quantity, "sale.line.quantity");
    const effectiveUnitPriceMinor = nonNegativeInteger(
      line.effective_unit_price_minor,
      "sale.line.effective_unit_price_minor",
    );
    const lineTotalMinor = nonNegativeInteger(
      line.line_total_minor,
      "sale.line.line_total_minor",
    );
    if (
      lineTotalMinor !==
      safeMultiply(effectiveUnitPriceMinor, quantity, "sale.line.line_total_minor")
    ) {
      throw new CashierSyncError(
        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
        "original cashier sale line total is inconsistent",
        409,
      );
    }
    return {
      line_id: identifier(line.line_id, "sale.line.line_id"),
      product_id: identifier(line.product_id, "sale.line.product_id"),
      ...(line.variant_id
        ? { variant_id: identifier(line.variant_id, "sale.line.variant_id") }
        : {}),
      quantity,
      effective_unit_price_minor: effectiveUnitPriceMinor,
      line_total_minor: lineTotalMinor,
    } satisfies OriginalSaleLine;
  });
  const lineIds = new Set<string>();
  const itemKeys = new Set<string>();
  for (const line of lines) {
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
  const sale: OriginalSale = {
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
    total_minor: nonNegativeInteger(raw.total_minor, "sale.total_minor"),
    manual_discount_minor: nonNegativeInteger(
      raw.manual_discount_minor ?? 0,
      "sale.manual_discount_minor",
    ),
    lines,
  };
  try {
    cashierAdjustedLineRevenueById(sale);
  } catch {
    throw new CashierSyncError(
      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",
      "original cashier sale discount evidence is inconsistent",
      409,
    );
  }
  return sale;
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
