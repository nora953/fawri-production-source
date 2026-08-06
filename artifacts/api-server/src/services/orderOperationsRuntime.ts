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

export type ServerOrderItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
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
  updated_at: string;
};

type OrderOperationsDatabase = {
  version: 1;
  orders: Record<string, Record<string, OrderOperation>>;
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

const STORE_VERSION = 1 as const;
const LOCK_STALE_MS = 30_000;
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

const PAYMENT_TRANSITIONS: Record<
  ServerPaymentStatus,
  Set<ServerPaymentStatus>
> = {
  cash_on_delivery: new Set(["cash_on_delivery", "paid"]),
  electronic_pending: new Set([
    "electronic_pending",
    "manual_review",
    "paid",
    "failed",
  ]),
  manual_review: new Set([
    "manual_review",
    "electronic_pending",
    "paid",
    "failed",
  ]),
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
    return JSON.parse(fs.readFileSync(runtimePath(), "utf8")) as RuntimeDatabase;
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

function readOperationsDatabase(): OrderOperationsDatabase {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(operationsPath(), "utf8"),
    ) as Partial<OrderOperationsDatabase>;
    if (
      parsed.version !== STORE_VERSION ||
      !parsed.orders ||
      typeof parsed.orders !== "object" ||
      Array.isArray(parsed.orders)
    ) {
      throw new Error("order operations store has an unsupported shape");
    }
    return parsed as OrderOperationsDatabase;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: STORE_VERSION, orders: {} };
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
        JSON.stringify({
          pid: process.pid,
          acquired_at: new Date().toISOString(),
        }),
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

function runtimeOrders(
  runtime: RuntimeDatabase,
  merchantId: string,
): RuntimeOrder[] {
  const byMerchant = objectRecord(runtime.ordersByMerchant);
  const values = byMerchant[merchantId];
  return Array.isArray(values)
    ? values.filter(
        (item): item is RuntimeOrder =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
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
    throw new OrderOperationError(
      "ORDER_NOT_FOUND",
      "order was not found",
      404,
    );
  }
  return order;
}

function mergeOrder(
  base: RuntimeOrder,
  operation?: OrderOperation,
): ServerOrder {
  const paymentMethod = normalizePaymentMethod(base.payment_method);
  const basePaymentStatus = normalizePaymentStatus(
    base.payment_status,
    paymentMethod,
  );
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
    merchant_id: text(base.merchant_id),
    conversation_id: text(base.conversation_id) || undefined,
    customer_id: text(base.customer_id || base.customer_external_id) || undefined,
    customer_name: text(base.customer_name) || "Messenger Customer",
    phone: text(base.customer_phone || base.phone),
    address: text(
      base.customer_address || base.customer_area || base.address,
    ),
    items,
    payment_method: paymentMethod,
    payment_status: operation?.payment_status || basePaymentStatus,
    status: operation?.status || baseStatus,
    notes: text(base.notes) || undefined,
    payment_screenshot: text(base.payment_screenshot) || undefined,
    payment_verified_at:
      operation?.payment_verified_at ||
      (text(base.payment_verified_at) || undefined),
    payment_verified_by:
      operation?.payment_verified_by ||
      (text(base.payment_verified_by) || undefined),
    payment_rejection_reason:
      operation?.payment_rejection_reason ||
      (text(base.payment_rejection_reason) || undefined),
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

function assertPaymentTransition(
  method: ServerPaymentMethod,
  current: ServerPaymentStatus,
  next: ServerPaymentStatus,
): void {
  if (
    method === "cash_on_delivery" &&
    next !== "cash_on_delivery" &&
    next !== "paid"
  ) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_METHOD_MISMATCH",
      "cash on delivery orders cannot use an electronic payment state",
    );
  }
  if (
    method !== "cash_on_delivery" &&
    next === "cash_on_delivery"
  ) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_METHOD_MISMATCH",
      "electronic payment orders cannot use cash on delivery state",
    );
  }
  if (!PAYMENT_TRANSITIONS[current].has(next)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_TRANSITION_INVALID",
      `payment status cannot change from ${current} to ${next}`,
    );
  }
}

function operationFromOrder(order: ServerOrder): OrderOperation {
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
    updated_at: order.updated_at,
  };
}

function mutateOrder(
  merchantId: string,
  orderId: string,
  expectedVersionValue: unknown,
  mutation: (current: ServerOrder) => Partial<OrderOperation>,
): ServerOrder {
  const expectedVersion = requireExpectedVersion(expectedVersionValue);
  return withOperationsLock((database) => {
    const runtime = readRuntimeDatabase();
    const base = requireRuntimeOrder(runtime, merchantId, orderId);
    const current = mergeOrder(
      base,
      currentOperation(database, merchantId, orderId),
    );
    assertVersion(current, expectedVersion);
    const patch = mutation(current);
    const candidate: ServerOrder = {
      ...current,
      ...patch,
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

    const operations = merchantOperations(database, merchantId, true);
    operations[orderId] = operationFromOrder(candidate);
    return mergeOrder(base, operations[orderId]);
  });
}

export function listServerOrders(merchantId: string): ServerOrder[] {
  const runtime = readRuntimeDatabase();
  const database = readOperationsDatabase();
  const operations = merchantOperations(database, merchantId);
  return runtimeOrders(runtime, merchantId).map((order) =>
    mergeOrder(order, operations[text(order.id)]),
  );
}

export function getServerOrder(
  merchantId: string,
  orderId: string,
): ServerOrder {
  const runtime = readRuntimeDatabase();
  const base = requireRuntimeOrder(runtime, merchantId, orderId);
  return mergeOrder(
    base,
    currentOperation(readOperationsDatabase(), merchantId, orderId),
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
      return { status: nextStatus };
    },
  );
}

export function updateServerPaymentStatus(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  paymentStatus: unknown;
  rejectionReason?: unknown;
}): ServerOrder {
  const nextStatus = text(input.paymentStatus) as ServerPaymentStatus;
  if (!PAYMENT_STATUSES.has(nextStatus)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_STATUS_INVALID",
      "payment status is invalid",
      400,
    );
  }
  const rejectionReason = text(input.rejectionReason);
  if (nextStatus === "failed" && !rejectionReason) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_REJECTION_REASON_REQUIRED",
      "a payment rejection reason is required",
      400,
    );
  }

  return mutateOrder(
    input.merchantId,
    input.orderId,
    input.expectedVersion,
    (current) => {
      assertPaymentTransition(
        current.payment_method,
        current.payment_status,
        nextStatus,
      );
      if (nextStatus === "paid") {
        return {
          payment_status: nextStatus,
          payment_verified_at: new Date().toISOString(),
          payment_verified_by: input.merchantId,
          payment_rejection_reason: undefined,
        };
      }
      if (nextStatus === "failed") {
        return {
          payment_status: nextStatus,
          payment_verified_at: undefined,
          payment_verified_by: undefined,
          payment_rejection_reason: rejectionReason,
        };
      }
      return {
        payment_status: nextStatus,
        payment_verified_at: undefined,
        payment_verified_by: undefined,
        payment_rejection_reason: undefined,
      };
    },
  );
}

export function confirmServerPayment(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
}): ServerOrder {
  return mutateOrder(
    input.merchantId,
    input.orderId,
    input.expectedVersion,
    (current) => {
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
        status: "confirmed",
        payment_status: "paid",
        payment_verified_at: new Date().toISOString(),
        payment_verified_by: input.merchantId,
        payment_rejection_reason: undefined,
      };
    },
  );
}

export function rejectServerPayment(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  reason: unknown;
}): ServerOrder {
  const reason = text(input.reason);
  if (!reason || reason.length > 500) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_REJECTION_REASON_INVALID",
      "payment rejection reason must contain 1 to 500 characters",
      400,
    );
  }
  return mutateOrder(
    input.merchantId,
    input.orderId,
    input.expectedVersion,
    (current) => {
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
        status: "pending_confirmation",
        payment_status: "failed",
        payment_verified_at: undefined,
        payment_verified_by: undefined,
        payment_rejection_reason: reason,
      };
    },
  );
}

registerMerchantRuntimeDeletion((merchantId) => {
  const filePath = operationsPath();
  if (!fs.existsSync(filePath)) return { orderOperations: 0 };
  const descriptor = acquireLock();
  try {
    const database = readOperationsDatabase();
    const count = Object.keys(merchantOperations(database, merchantId)).length;
    delete database.orders[merchantId];
    writeJsonAtomically(filePath, database);
    return { orderOperations: count };
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
