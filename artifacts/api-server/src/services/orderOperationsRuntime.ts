import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { registerMerchantRuntimeDeletion } from "./merchantRuntime";

export type ServerOrderStatus =
  | "pending_confirmation"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "out_of_stock"
  | "waiting_customer_approval";

export type ServerPaymentMethod =
  | "cash_on_delivery"
  | "superqi"
  | "fastpay"
  | "zaincash"
  | "other";

export type ServerPaymentStatus =
  | "cash_on_delivery"
  | "electronic_pending"
  | "paid"
  | "failed"
  | "manual_review";

export type PaymentConfirmationSource =
  | "merchant_confirmed"
  | "provider_verified";

export type PaymentReconciliationStatus =
  | "clear"
  | "reconciliation_required"
  | "resolved";

export type ServerOrderItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
};

export type PaymentDecisionAudit = {
  id: string;
  merchant_id: string;
  order_id: string;
  operation: "confirm" | "reject";
  payment_channel: "cash_on_delivery" | "electronic";
  outcome: "paid" | "failed";
  confirmation_source?: PaymentConfirmationSource;
  previous_payment_status: ServerPaymentStatus;
  resulting_payment_status: ServerPaymentStatus;
  previous_order_status: ServerOrderStatus;
  resulting_order_status: ServerOrderStatus;
  actor_type: "merchant";
  actor_id: string;
  request_id?: string;
  reason?: string;
  expected_version: number;
  resulting_version: number;
  decided_at: string;
};

export type ServerOrder = {
  id: string;
  merchant_id: string;
  conversation_id?: string;
  customer_id?: string;
  customer_name: string;
  phone: string;
  address: string;
  items: ServerOrderItem[];
  payment_method: ServerPaymentMethod;
  payment_status: ServerPaymentStatus;
  status: ServerOrderStatus;
  notes?: string;
  payment_screenshot?: string;
  payment_verified_at?: string;
  payment_verified_by?: string;
  payment_rejection_reason?: string;
  payment_confirmation_source?: PaymentConfirmationSource;
  payment_provider?: string;
  payment_provider_transaction_ref?: string;
  payment_provider_last_event_id?: string;
  payment_reconciliation_status?: PaymentReconciliationStatus;
  payment_conflict_code?: string;
  payment_conflict_at?: string;
  payment_conflict_resolved_at?: string;
  payment_conflict_resolved_by?: string;
  payment_conflict_resolution_note?: string;
  last_payment_decision?: PaymentDecisionAudit;
  source_channel: string;
  total_price: number;
  created_at: string;
  updated_at: string;
  version: number;
};

type RuntimeOrder = Record<string, unknown>;
type RuntimeDatabase = { ordersByMerchant?: unknown };

type OrderOperation = {
  version: number;
  status: ServerOrderStatus;
  payment_status: ServerPaymentStatus;
  payment_verified_at?: string;
  payment_verified_by?: string;
  payment_rejection_reason?: string;
  last_payment_decision_id?: string;
  updated_at: string;
};

type OrderOperationsDatabaseV1 = {
  version: 1;
  orders: Record<string, Record<string, OrderOperation>>;
};

type OrderOperationsDatabase = {
  version: 2;
  orders: Record<string, Record<string, OrderOperation>>;
  payment_decisions: PaymentDecisionAudit[];
};

type OrderMutation = {
  order: Partial<OrderOperation>;
  paymentDecision?: Omit<
    PaymentDecisionAudit,
    | "id"
    | "merchant_id"
    | "order_id"
    | "expected_version"
    | "resulting_version"
    | "decided_at"
  >;
};

export class OrderOperationError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrderOperationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const STORE_VERSION = 2 as const;
const LOCK_STALE_MS = 30_000;
const MAX_PAYMENT_DECISIONS = 100_000;
const ORDER_STATUSES = new Set<ServerOrderStatus>([
  "pending_confirmation",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "out_of_stock",
  "waiting_customer_approval",
]);
const PAYMENT_METHODS = new Set<ServerPaymentMethod>([
  "cash_on_delivery",
  "superqi",
  "fastpay",
  "zaincash",
  "other",
]);
const PAYMENT_STATUSES = new Set<ServerPaymentStatus>([
  "cash_on_delivery",
  "electronic_pending",
  "paid",
  "failed",
  "manual_review",
]);

const ORDER_TRANSITIONS: Record<ServerOrderStatus, Set<ServerOrderStatus>> = {
  pending_confirmation: new Set([
    "pending_confirmation",
    "confirmed",
    "cancelled",
    "out_of_stock",
    "waiting_customer_approval",
  ]),
  confirmed: new Set(["confirmed", "preparing", "cancelled"]),
  preparing: new Set(["preparing", "shipped", "cancelled"]),
  shipped: new Set(["shipped", "delivered"]),
  delivered: new Set(["delivered"]),
  cancelled: new Set(["cancelled"]),
  out_of_stock: new Set([
    "out_of_stock",
    "pending_confirmation",
    "waiting_customer_approval",
    "cancelled",
  ]),
  waiting_customer_approval: new Set([
    "waiting_customer_approval",
    "pending_confirmation",
    "confirmed",
    "out_of_stock",
    "cancelled",
  ]),
};

const NON_TERMINAL_PAYMENT_TRANSITIONS: Record<
  ServerPaymentStatus,
  Set<ServerPaymentStatus>
> = {
  cash_on_delivery: new Set(["cash_on_delivery"]),
  electronic_pending: new Set(["electronic_pending", "manual_review"]),
  manual_review: new Set(["manual_review", "electronic_pending"]),
  paid: new Set(["paid"]),
  failed: new Set(["failed", "electronic_pending", "manual_review"]),
};

function runtimePath(): string {
  return getFawriDataFilePath("fawri-runtime-db.json");
}

function operationsPath(): string {
  return getFawriDataFilePath("order-operations.json");
}

function lockPath(): string {
  return `${operationsPath()}.lock`;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function requireIdentifier(value: unknown, code: string, label: string): string {
  const normalized = text(value);
  if (!normalized || normalized.length > 200) {
    throw new OrderOperationError(code, `${label} is required`, 400);
  }
  return normalized;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function timestamp(value: unknown, fallback?: string): string {
  const parsed = new Date(String(value || ""));
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return fallback || new Date().toISOString();
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function readRuntimeDatabase(): RuntimeDatabase {
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimePath(), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("order runtime has an unsupported shape");
    }
    return parsed as RuntimeDatabase;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new OrderOperationError(
        "ORDER_RUNTIME_UNAVAILABLE",
        "order runtime is unavailable",
        503,
      );
    }
    throw error;
  }
}

function normalizePaymentDecision(value: unknown): PaymentDecisionAudit | null {
  const record = objectRecord(value);
  const operation = text(record.operation);
  const outcome = text(record.outcome);
  const paymentChannel = text(record.payment_channel);
  const previousPayment = text(record.previous_payment_status);
  const resultingPayment = text(record.resulting_payment_status);
  const previousOrder = text(record.previous_order_status);
  const resultingOrder = text(record.resulting_order_status);
  const expectedVersion = Number(record.expected_version);
  const resultingVersion = Number(record.resulting_version);
  if (
    !text(record.id) ||
    !text(record.merchant_id) ||
    !text(record.order_id) ||
    (operation !== "confirm" && operation !== "reject") ||
    (outcome !== "paid" && outcome !== "failed") ||
    (paymentChannel !== "cash_on_delivery" && paymentChannel !== "electronic") ||
    !PAYMENT_STATUSES.has(previousPayment as ServerPaymentStatus) ||
    !PAYMENT_STATUSES.has(resultingPayment as ServerPaymentStatus) ||
    !ORDER_STATUSES.has(previousOrder as ServerOrderStatus) ||
    !ORDER_STATUSES.has(resultingOrder as ServerOrderStatus) ||
    text(record.actor_type) !== "merchant" ||
    !text(record.actor_id) ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion <= 0 ||
    !Number.isInteger(resultingVersion) ||
    resultingVersion <= expectedVersion ||
    !Number.isFinite(new Date(text(record.decided_at)).getTime())
  ) {
    return null;
  }
  return {
    id: text(record.id),
    merchant_id: text(record.merchant_id),
    order_id: text(record.order_id),
    operation,
    payment_channel: paymentChannel,
    outcome,
    previous_payment_status: previousPayment as ServerPaymentStatus,
    resulting_payment_status: resultingPayment as ServerPaymentStatus,
    previous_order_status: previousOrder as ServerOrderStatus,
    resulting_order_status: resultingOrder as ServerOrderStatus,
    actor_type: "merchant",
    actor_id: text(record.actor_id),
    ...(text(record.request_id) ? { request_id: text(record.request_id) } : {}),
    ...(text(record.reason) ? { reason: text(record.reason) } : {}),
    expected_version: expectedVersion,
    resulting_version: resultingVersion,
    decided_at: timestamp(record.decided_at),
  };
}

function readOperationsDatabase(): OrderOperationsDatabase {
  try {
    const parsed = JSON.parse(fs.readFileSync(operationsPath(), "utf8")) as
      | Partial<OrderOperationsDatabase>
      | Partial<OrderOperationsDatabaseV1>;
    if (
      !parsed.orders ||
      typeof parsed.orders !== "object" ||
      Array.isArray(parsed.orders)
    ) {
      throw new Error("order operations store has an unsupported shape");
    }
    if (parsed.version === 1) {
      return {
        version: STORE_VERSION,
        orders: parsed.orders as Record<string, Record<string, OrderOperation>>,
        payment_decisions: [],
      };
    }
    if (
      parsed.version !== STORE_VERSION ||
      !Array.isArray(parsed.payment_decisions)
    ) {
      throw new Error("order operations store has an unsupported version");
    }
    const decisions = parsed.payment_decisions.map(normalizePaymentDecision);
    if (decisions.some((decision) => decision === null)) {
      throw new Error("order operations payment audit is invalid");
    }
    return {
      version: STORE_VERSION,
      orders: parsed.orders as Record<string, Record<string, OrderOperation>>,
      payment_decisions: decisions as PaymentDecisionAudit[],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: STORE_VERSION, orders: {}, payment_decisions: [] };
    }
    throw error;
  }
}

function acquireLock(): number {
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath(), "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
      );
      return descriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const statistics = fs.statSync(lockPath());
        if (Date.now() - statistics.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath());
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw new OrderOperationError(
        "ORDER_OPERATIONS_BUSY",
        "order operations are busy",
        503,
      );
    }
  }
  throw new OrderOperationError(
    "ORDER_OPERATIONS_BUSY",
    "order operations are busy",
    503,
  );
}

function withOperationsLock<T>(
  callback: (database: OrderOperationsDatabase) => T,
): T {
  const descriptor = acquireLock();
  try {
    const database = readOperationsDatabase();
    const result = callback(database);
    writeJsonAtomically(operationsPath(), database);
    return result;
  } finally {
    try {
      fs.closeSync(descriptor);
    } finally {
      try {
        fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function runtimeOrders(runtime: RuntimeDatabase, merchantId: string): RuntimeOrder[] {
  const byMerchant = objectRecord(runtime.ordersByMerchant);
  const values = byMerchant[merchantId];
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new OrderOperationError(
      "ORDER_RUNTIME_TENANT_DATA_INVALID",
      "merchant order runtime is invalid",
      503,
    );
  }
  const seen = new Set<string>();
  return values.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new OrderOperationError(
        "ORDER_RUNTIME_RECORD_INVALID",
        "order runtime record is invalid",
        503,
      );
    }
    const order = value as RuntimeOrder;
    const orderId = text(order.id);
    if (!orderId || seen.has(orderId)) {
      throw new OrderOperationError(
        "ORDER_RUNTIME_ID_INVALID",
        "order runtime identifier is missing or duplicated",
        503,
      );
    }
    seen.add(orderId);
    if (text(order.merchant_id) !== merchantId) {
      throw new OrderOperationError(
        "ORDER_RUNTIME_TENANT_MISMATCH",
        "order runtime tenant boundary is invalid",
        503,
      );
    }
    return order;
  });
}

function merchantOperations(
  database: OrderOperationsDatabase,
  merchantId: string,
  create = false,
): Record<string, OrderOperation> {
  const existing = database.orders[merchantId];
  if (existing) return existing;
  if (!create) return {};
  database.orders[merchantId] = {};
  return database.orders[merchantId];
}

function normalizeOrderStatus(value: unknown): ServerOrderStatus {
  const normalized = text(value);
  if (normalized === "new") return "pending_confirmation";
  return ORDER_STATUSES.has(normalized as ServerOrderStatus)
    ? (normalized as ServerOrderStatus)
    : "pending_confirmation";
}

function normalizePaymentMethod(value: unknown): ServerPaymentMethod {
  const normalized = text(value);
  return PAYMENT_METHODS.has(normalized as ServerPaymentMethod)
    ? (normalized as ServerPaymentMethod)
    : "cash_on_delivery";
}

function normalizePaymentStatus(
  value: unknown,
  method: ServerPaymentMethod,
): ServerPaymentStatus {
  const normalized = text(value);
  if (PAYMENT_STATUSES.has(normalized as ServerPaymentStatus)) {
    return normalized as ServerPaymentStatus;
  }
  return method === "cash_on_delivery"
    ? "cash_on_delivery"
    : "electronic_pending";
}

function normalizeItems(order: RuntimeOrder): ServerOrderItem[] {
  if (Array.isArray(order.items)) {
    return order.items
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => ({
        product_id: text(item.product_id),
        product_name: text(item.product_name) || "Unknown product",
        quantity: positiveInteger(item.quantity),
        price: Math.max(0, finiteNumber(item.price ?? item.unit_price)),
      }));
  }
  const productName = text(order.product_name);
  if (!productName) return [];
  return [
    {
      product_id: text(order.product_id),
      product_name: productName,
      quantity: positiveInteger(order.quantity),
      price: Math.max(
        0,
        finiteNumber(order.unit_price ?? order.price ?? order.total_price),
      ),
    },
  ];
}

function currentOperation(
  database: OrderOperationsDatabase,
  merchantId: string,
  orderId: string,
): OrderOperation | undefined {
  return merchantOperations(database, merchantId)[orderId];
}

function requireRuntimeOrder(
  runtime: RuntimeDatabase,
  merchantId: string,
  orderId: string,
): RuntimeOrder {
  const order = runtimeOrders(runtime, merchantId).find(
    (item) => text(item.id) === orderId,
  );
  if (!order) {
    throw new OrderOperationError("ORDER_NOT_FOUND", "order was not found", 404);
  }
  return order;
}

function decisionById(
  database: OrderOperationsDatabase,
  decisionId: string | undefined,
): PaymentDecisionAudit | undefined {
  if (!decisionId) return undefined;
  return database.payment_decisions.find((decision) => decision.id === decisionId);
}

function mergeOrder(
  merchantId: string,
  base: RuntimeOrder,
  operation?: OrderOperation,
  decision?: PaymentDecisionAudit,
): ServerOrder {
  const paymentMethod = normalizePaymentMethod(base.payment_method);
  const basePaymentStatus = normalizePaymentStatus(base.payment_status, paymentMethod);
  const baseStatus = normalizeOrderStatus(base.status);
  const createdAt = timestamp(base.created_at);
  const updatedAt = operation?.updated_at
    ? timestamp(operation.updated_at, createdAt)
    : timestamp(base.updated_at, createdAt);
  const items = normalizeItems(base);
  const itemTotal = items.reduce(
    (total, item) => total + item.quantity * item.price,
    0,
  );
  return {
    id: text(base.id),
    merchant_id: merchantId,
    conversation_id: text(base.conversation_id) || undefined,
    customer_id: text(base.customer_id || base.customer_external_id) || undefined,
    customer_name: text(base.customer_name) || "Messenger Customer",
    phone: text(base.customer_phone || base.phone),
    address: text(base.customer_address || base.customer_area || base.address),
    items,
    payment_method: paymentMethod,
    payment_status: operation?.payment_status || basePaymentStatus,
    status: operation?.status || baseStatus,
    notes: text(base.notes) || undefined,
    payment_screenshot: text(base.payment_screenshot) || undefined,
    payment_verified_at:
      operation?.payment_verified_at || text(base.payment_verified_at) || undefined,
    payment_verified_by:
      operation?.payment_verified_by || text(base.payment_verified_by) || undefined,
    payment_rejection_reason:
      operation?.payment_rejection_reason ||
      text(base.payment_rejection_reason) ||
      undefined,
    ...(decision ? { last_payment_decision: structuredClone(decision) } : {}),
    source_channel: text(base.source_channel) || "messenger",
    total_price: Math.max(
      0,
      finiteNumber(base.total_price ?? base.total_iqd, itemTotal),
    ),
    created_at: createdAt,
    updated_at: updatedAt,
    version: operation?.version || 1,
  };
}

function requireExpectedVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new OrderOperationError(
      "ORDER_VERSION_REQUIRED",
      "a positive expected_version is required",
      400,
    );
  }
  return parsed;
}

function assertVersion(order: ServerOrder, expectedVersion: number): void {
  if (order.version !== expectedVersion) {
    throw new OrderOperationError(
      "ORDER_VERSION_CONFLICT",
      "order was changed by another request",
      409,
      {
        expected_version: expectedVersion,
        current_version: order.version,
        current_order: order,
      },
    );
  }
}

function assertOrderTransition(
  current: ServerOrderStatus,
  next: ServerOrderStatus,
): void {
  if (!ORDER_TRANSITIONS[current].has(next)) {
    throw new OrderOperationError(
      "ORDER_STATUS_TRANSITION_INVALID",
      `order status cannot change from ${current} to ${next}`,
    );
  }
}

function assertNonTerminalPaymentTransition(
  method: ServerPaymentMethod,
  current: ServerPaymentStatus,
  next: ServerPaymentStatus,
): void {
  if (next === "paid" || next === "failed") {
    throw new OrderOperationError(
      "ORDER_PAYMENT_TERMINAL_OPERATION_REQUIRED",
      "paid and failed require the dedicated payment confirmation or rejection operation",
    );
  }
  if (method === "cash_on_delivery" && next !== "cash_on_delivery") {
    throw new OrderOperationError(
      "ORDER_PAYMENT_METHOD_MISMATCH",
      "cash on delivery orders cannot use an electronic payment state",
    );
  }
  if (method !== "cash_on_delivery" && next === "cash_on_delivery") {
    throw new OrderOperationError(
      "ORDER_PAYMENT_METHOD_MISMATCH",
      "electronic payment orders cannot use cash on delivery state",
    );
  }
  if (!NON_TERMINAL_PAYMENT_TRANSITIONS[current].has(next)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_TRANSITION_INVALID",
      `payment status cannot change from ${current} to ${next}`,
    );
  }
}

function operationFromOrder(
  order: ServerOrder,
  decisionId?: string,
): OrderOperation {
  return {
    version: order.version,
    status: order.status,
    payment_status: order.payment_status,
    ...(order.payment_verified_at
      ? { payment_verified_at: order.payment_verified_at }
      : {}),
    ...(order.payment_verified_by
      ? { payment_verified_by: order.payment_verified_by }
      : {}),
    ...(order.payment_rejection_reason
      ? { payment_rejection_reason: order.payment_rejection_reason }
      : {}),
    ...(decisionId ? { last_payment_decision_id: decisionId } : {}),
    updated_at: order.updated_at,
  };
}

function mutateOrder(
  merchantIdValue: string,
  orderIdValue: string,
  expectedVersionValue: unknown,
  mutation: (current: ServerOrder) => OrderMutation,
): ServerOrder {
  const merchantId = requireIdentifier(
    merchantIdValue,
    "ORDER_MERCHANT_ID_INVALID",
    "merchant identifier",
  );
  const orderId = requireIdentifier(
    orderIdValue,
    "ORDER_ID_INVALID",
    "order identifier",
  );
  const expectedVersion = requireExpectedVersion(expectedVersionValue);
  return withOperationsLock((database) => {
    const runtime = readRuntimeDatabase();
    const base = requireRuntimeOrder(runtime, merchantId, orderId);
    const existingOperation = currentOperation(database, merchantId, orderId);
    const current = mergeOrder(
      merchantId,
      base,
      existingOperation,
      decisionById(database, existingOperation?.last_payment_decision_id),
    );
    assertVersion(current, expectedVersion);
    const mutationResult = mutation(current);
    const candidate: ServerOrder = {
      ...current,
      ...mutationResult.order,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    };
    const unchanged =
      candidate.status === current.status &&
      candidate.payment_status === current.payment_status &&
      candidate.payment_verified_at === current.payment_verified_at &&
      candidate.payment_verified_by === current.payment_verified_by &&
      candidate.payment_rejection_reason === current.payment_rejection_reason;
    if (unchanged) return current;

    let decision: PaymentDecisionAudit | undefined;
    if (mutationResult.paymentDecision) {
      decision = {
        id: crypto.randomUUID(),
        merchant_id: merchantId,
        order_id: orderId,
        ...mutationResult.paymentDecision,
        expected_version: expectedVersion,
        resulting_version: candidate.version,
        decided_at: candidate.updated_at,
      };
      database.payment_decisions.push(decision);
      if (database.payment_decisions.length > MAX_PAYMENT_DECISIONS) {
        database.payment_decisions.splice(
          0,
          database.payment_decisions.length - MAX_PAYMENT_DECISIONS,
        );
      }
    }
    const operations = merchantOperations(database, merchantId, true);
    operations[orderId] = operationFromOrder(candidate, decision?.id);
    return mergeOrder(merchantId, base, operations[orderId], decision);
  });
}

export function listServerOrders(merchantIdValue: string): ServerOrder[] {
  const merchantId = requireIdentifier(
    merchantIdValue,
    "ORDER_MERCHANT_ID_INVALID",
    "merchant identifier",
  );
  const runtime = readRuntimeDatabase();
  const database = readOperationsDatabase();
  const operations = merchantOperations(database, merchantId);
  return runtimeOrders(runtime, merchantId).map((order) => {
    const operation = operations[text(order.id)];
    return mergeOrder(
      merchantId,
      order,
      operation,
      decisionById(database, operation?.last_payment_decision_id),
    );
  });
}

export function getServerOrder(
  merchantIdValue: string,
  orderIdValue: string,
): ServerOrder {
  const merchantId = requireIdentifier(
    merchantIdValue,
    "ORDER_MERCHANT_ID_INVALID",
    "merchant identifier",
  );
  const orderId = requireIdentifier(
    orderIdValue,
    "ORDER_ID_INVALID",
    "order identifier",
  );
  const runtime = readRuntimeDatabase();
  const base = requireRuntimeOrder(runtime, merchantId, orderId);
  const database = readOperationsDatabase();
  const operation = currentOperation(database, merchantId, orderId);
  return mergeOrder(
    merchantId,
    base,
    operation,
    decisionById(database, operation?.last_payment_decision_id),
  );
}

export function updateServerOrderStatus(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  status: unknown;
}): ServerOrder {
  const nextStatus = text(input.status) as ServerOrderStatus;
  if (!ORDER_STATUSES.has(nextStatus)) {
    throw new OrderOperationError(
      "ORDER_STATUS_INVALID",
      "order status is invalid",
      400,
    );
  }
  return mutateOrder(
    input.merchantId,
    input.orderId,
    input.expectedVersion,
    (current) => {
      assertOrderTransition(current.status, nextStatus);
      return { order: { status: nextStatus } };
    },
  );
}

export function updateServerPaymentStatus(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  paymentStatus: unknown;
}): ServerOrder {
  const nextStatus = text(input.paymentStatus) as ServerPaymentStatus;
  if (!PAYMENT_STATUSES.has(nextStatus)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_STATUS_INVALID",
      "payment status is invalid",
      400,
    );
  }
  return mutateOrder(
    input.merchantId,
    input.orderId,
    input.expectedVersion,
    (current) => {
      assertNonTerminalPaymentTransition(
        current.payment_method,
        current.payment_status,
        nextStatus,
      );
      return {
        order: {
          payment_status: nextStatus,
          payment_verified_at: undefined,
          payment_verified_by: undefined,
          payment_rejection_reason: undefined,
        },
      };
    },
  );
}

export function confirmServerPayment(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  actorId?: unknown;
  requestId?: unknown;
}): ServerOrder {
  const actorId = requireIdentifier(
    input.actorId || input.merchantId,
    "ORDER_PAYMENT_ACTOR_INVALID",
    "payment actor",
  );
  const requestId = text(input.requestId).slice(0, 200);
  return mutateOrder(
    input.merchantId,
    input.orderId,
    input.expectedVersion,
    (current) => {
      const decidedAt = new Date().toISOString();
      if (current.payment_method === "cash_on_delivery") {
        if (current.payment_status !== "cash_on_delivery") {
          throw new OrderOperationError(
            "ORDER_PAYMENT_REVIEW_REQUIRED",
            "cash on delivery payment is not awaiting confirmation",
          );
        }
        if (current.status !== "delivered") {
          throw new OrderOperationError(
            "ORDER_CASH_PAYMENT_DELIVERY_REQUIRED",
            "cash on delivery payment can be confirmed only after delivery",
          );
        }
        return {
          order: {
            payment_status: "paid",
            payment_verified_at: decidedAt,
            payment_verified_by: actorId,
            payment_rejection_reason: undefined,
          },
          paymentDecision: {
            operation: "confirm",
            payment_channel: "cash_on_delivery",
            outcome: "paid",
            previous_payment_status: current.payment_status,
            resulting_payment_status: "paid",
            previous_order_status: current.status,
            resulting_order_status: current.status,
            actor_type: "merchant",
            actor_id: actorId,
            ...(requestId ? { request_id: requestId } : {}),
          },
        };
      }
      if (
        current.payment_status !== "electronic_pending" &&
        current.payment_status !== "manual_review"
      ) {
        throw new OrderOperationError(
          "ORDER_PAYMENT_REVIEW_REQUIRED",
          "only a pending electronic payment can be confirmed",
        );
      }
      assertOrderTransition(current.status, "confirmed");
      return {
        order: {
          status: "confirmed",
          payment_status: "paid",
          payment_verified_at: decidedAt,
          payment_verified_by: actorId,
          payment_rejection_reason: undefined,
        },
        paymentDecision: {
          operation: "confirm",
          payment_channel: "electronic",
          outcome: "paid",
          previous_payment_status: current.payment_status,
          resulting_payment_status: "paid",
          previous_order_status: current.status,
          resulting_order_status: "confirmed",
          actor_type: "merchant",
          actor_id: actorId,
          ...(requestId ? { request_id: requestId } : {}),
        },
      };
    },
  );
}

export function rejectServerPayment(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  reason: unknown;
  actorId?: unknown;
  requestId?: unknown;
}): ServerOrder {
  const reason = text(input.reason);
  if (!reason || reason.length > 500) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_REJECTION_REASON_INVALID",
      "payment rejection reason must contain 1 to 500 characters",
      400,
    );
  }
  const actorId = requireIdentifier(
    input.actorId || input.merchantId,
    "ORDER_PAYMENT_ACTOR_INVALID",
    "payment actor",
  );
  const requestId = text(input.requestId).slice(0, 200);
  return mutateOrder(
    input.merchantId,
    input.orderId,
    input.expectedVersion,
    (current) => {
      if (current.payment_method === "cash_on_delivery") {
        throw new OrderOperationError(
          "ORDER_PAYMENT_METHOD_MISMATCH",
          "cash on delivery does not use electronic payment rejection",
        );
      }
      if (
        current.payment_status !== "electronic_pending" &&
        current.payment_status !== "manual_review"
      ) {
        throw new OrderOperationError(
          "ORDER_PAYMENT_REVIEW_REQUIRED",
          "only a pending electronic payment can be rejected",
        );
      }
      if (
        current.status !== "pending_confirmation" &&
        current.status !== "waiting_customer_approval"
      ) {
        throw new OrderOperationError(
          "ORDER_STATUS_TRANSITION_INVALID",
          "payment cannot be rejected after order processing has started",
        );
      }
      return {
        order: {
          status: "pending_confirmation",
          payment_status: "failed",
          payment_verified_at: undefined,
          payment_verified_by: undefined,
          payment_rejection_reason: reason,
        },
        paymentDecision: {
          operation: "reject",
          payment_channel: "electronic",
          outcome: "failed",
          previous_payment_status: current.payment_status,
          resulting_payment_status: "failed",
          previous_order_status: current.status,
          resulting_order_status: "pending_confirmation",
          actor_type: "merchant",
          actor_id: actorId,
          ...(requestId ? { request_id: requestId } : {}),
          reason,
        },
      };
    },
  );
}

registerMerchantRuntimeDeletion((merchantId) => {
  const filePath = operationsPath();
  if (!fs.existsSync(filePath)) {
    return { orderOperations: 0, orderPaymentDecisions: 0 };
  }
  const descriptor = acquireLock();
  try {
    const database = readOperationsDatabase();
    const count = Object.keys(merchantOperations(database, merchantId)).length;
    const decisionCount = database.payment_decisions.filter(
      (decision) => decision.merchant_id === merchantId,
    ).length;
    delete database.orders[merchantId];
    database.payment_decisions = database.payment_decisions.filter(
      (decision) => decision.merchant_id !== merchantId,
    );
    writeJsonAtomically(filePath, database);
    return {
      orderOperations: count,
      orderPaymentDecisions: decisionCount,
    };
  } finally {
    try {
      fs.closeSync(descriptor);
    } finally {
      try {
        fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
});
