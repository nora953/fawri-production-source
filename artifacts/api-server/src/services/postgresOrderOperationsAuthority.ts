import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import {
  ensureOnlineOrderFulfillmentCommittedWithTarget,
  OnlineOrderFulfillmentCommitError,
} from "./postgresOnlineOrderFulfillmentCommit";
import {
  confirmServerPayment,
  getServerOrder,
  listServerOrders,
  OrderOperationError,
  rejectServerPayment,
  updateServerOrderStatus,
  updateServerPaymentStatus,
  type PaymentDecisionAudit,
  type ServerOrder,
  type ServerOrderItem,
  type ServerOrderStatus,
  type ServerPaymentMethod,
  type ServerPaymentStatus,
} from "./orderOperationsRuntime";

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

function text(value: unknown): string {
  return String(value || "").trim();
}

function identifier(value: unknown, code: string, label: string): string {
  const normalized = text(value);
  if (!normalized || normalized.length > 200) {
    throw new OrderOperationError(code, `${label} is required`, 400);
  }
  return normalized;
}

function expectedVersion(value: unknown): number {
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

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

type OrderRow = {
  id: string;
  merchant_id: string;
  conversation_id: string | null;
  customer_external_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_area: string | null;
  fulfillment_location_id: string | null;
  status: ServerOrderStatus;
  payment_method: ServerPaymentMethod;
  payment_status: ServerPaymentStatus;
  subtotal_iqd: number;
  delivery_fee_iqd: number;
  total_iqd: number;
  source_channel: string;
  version: number;
  notes: string | null;
  payment_verified_at: Date | string | null;
  payment_verified_by_account_id: string | null;
  payment_rejection_reason: string | null;
  payment_confirmation_source: "merchant_confirmed" | "provider_verified" | null;
  payment_provider: string | null;
  payment_provider_transaction_ref: string | null;
  payment_provider_last_event_id: string | null;
  payment_reconciliation_status: "clear" | "reconciliation_required" | "resolved";
  payment_conflict_code: string | null;
  payment_conflict_at: Date | string | null;
  payment_conflict_resolved_at: Date | string | null;
  payment_conflict_resolved_by_account_id: string | null;
  payment_conflict_resolution_note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ItemRow = {
  product_id: string | null;
  product_name_snapshot: string;
  quantity: number;
  unit_price_iqd: number;
};

type DecisionRow = {
  id: string;
  merchant_id: string;
  order_id: string;
  operation: "confirm" | "reject" | "legacy_import";
  payment_channel: "cash_on_delivery" | "electronic";
  outcome: "paid" | "failed";
  confirmation_source: "merchant_confirmed" | "provider_verified" | null;
  previous_order_status: ServerOrderStatus;
  resulting_order_status: ServerOrderStatus;
  previous_payment_status: ServerPaymentStatus;
  resulting_payment_status: ServerPaymentStatus;
  actor_type: "merchant" | "admin" | "system";
  actor_account_id: string | null;
  request_id: string | null;
  reason: string | null;
  expected_version: number;
  resulting_version: number;
  decided_at: Date | string;
};

const ORDER_SELECT = `
SELECT id, merchant_id, conversation_id, customer_external_id, customer_name,
       customer_phone, customer_address, customer_area, fulfillment_location_id,
       status::text AS status, payment_method::text AS payment_method,
       payment_status::text AS payment_status,
       subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version,
       notes, payment_verified_at, payment_verified_by_account_id,
       payment_rejection_reason, payment_confirmation_source::text AS payment_confirmation_source,
       payment_provider, payment_provider_transaction_ref, payment_provider_last_event_id,
       payment_reconciliation_status::text AS payment_reconciliation_status,
       payment_conflict_code, payment_conflict_at, payment_conflict_resolved_at,
       payment_conflict_resolved_by_account_id, payment_conflict_resolution_note,
       metadata, created_at, updated_at
FROM orders`;

async function loadItems(
  client: OperationalSqlClient,
  merchantId: string,
  orderId: string,
): Promise<ServerOrderItem[]> {
  const result = await client.query<ItemRow>(
    `SELECT product_id, product_name_snapshot, quantity, unit_price_iqd
       FROM order_items
      WHERE merchant_id = $1 AND order_id = $2
      ORDER BY created_at, id`,
    [merchantId, orderId],
  );
  return result.rows.map((row) => ({
    product_id: row.product_id || "",
    product_name: row.product_name_snapshot,
    quantity: row.quantity,
    price: row.unit_price_iqd,
  }));
}

function mapDecision(row: DecisionRow | undefined): PaymentDecisionAudit | undefined {
  if (!row || row.operation === "legacy_import" || row.actor_type !== "merchant") {
    return undefined;
  }
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    order_id: row.order_id,
    operation: row.operation,
    payment_channel: row.payment_channel,
    outcome: row.outcome,
    ...(row.confirmation_source ? { confirmation_source: row.confirmation_source } : {}),
    previous_payment_status: row.previous_payment_status,
    resulting_payment_status: row.resulting_payment_status,
    previous_order_status: row.previous_order_status,
    resulting_order_status: row.resulting_order_status,
    actor_type: "merchant",
    actor_id: row.actor_account_id || row.merchant_id,
    ...(row.request_id ? { request_id: row.request_id } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    expected_version: row.expected_version,
    resulting_version: row.resulting_version,
    decided_at: iso(row.decided_at) || new Date(0).toISOString(),
  };
}

async function latestDecision(
  client: OperationalSqlClient,
  merchantId: string,
  orderId: string,
): Promise<PaymentDecisionAudit | undefined> {
  const result = await client.query<DecisionRow>(
    `SELECT d.id, d.merchant_id, d.order_id, d.operation::text AS operation,
            d.payment_channel::text AS payment_channel, d.outcome::text AS outcome,
            d.confirmation_source::text AS confirmation_source,
            d.previous_order_status::text AS previous_order_status,
            d.resulting_order_status::text AS resulting_order_status,
            d.previous_payment_status::text AS previous_payment_status,
            d.resulting_payment_status::text AS resulting_payment_status,
            d.actor_type::text AS actor_type, d.actor_account_id,
            d.request_id, d.reason, d.expected_version, d.resulting_version,
            d.decided_at
       FROM order_terminal_decision_links l
       JOIN order_payment_decisions d
         ON d.id = l.decision_id
        AND d.order_id = l.order_id
        AND d.merchant_id = l.merchant_id
      WHERE l.merchant_id = $1 AND l.order_id = $2
      LIMIT 1`,
    [merchantId, orderId],
  );
  return mapDecision(result.rows[0]);
}

async function mapOrder(
  client: OperationalSqlClient,
  row: OrderRow,
): Promise<ServerOrder> {
  const items = await loadItems(client, row.merchant_id, row.id);
  const decision = await latestDecision(client, row.merchant_id, row.id);
  const metadata = row.metadata || {};
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    ...(row.conversation_id ? { conversation_id: row.conversation_id } : {}),
    ...(row.customer_external_id ? { customer_id: row.customer_external_id } : {}),
    customer_name: row.customer_name,
    phone: row.customer_phone || "",
    address: row.customer_address || row.customer_area || "",
    items,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    status: row.status === ("new" as ServerOrderStatus) ? "pending_confirmation" : row.status,
    notes: row.notes || undefined,
    ...(text(metadata.payment_screenshot)
      ? { payment_screenshot: text(metadata.payment_screenshot) }
      : {}),
    ...(iso(row.payment_verified_at)
      ? { payment_verified_at: iso(row.payment_verified_at)! }
      : {}),
    ...(row.payment_verified_by_account_id
      ? { payment_verified_by: row.payment_verified_by_account_id }
      : {}),
    ...(row.payment_rejection_reason
      ? { payment_rejection_reason: row.payment_rejection_reason }
      : {}),
    ...(row.payment_confirmation_source
      ? { payment_confirmation_source: row.payment_confirmation_source }
      : {}),
    ...(row.payment_provider ? { payment_provider: row.payment_provider } : {}),
    ...(row.payment_provider_transaction_ref
      ? { payment_provider_transaction_ref: row.payment_provider_transaction_ref }
      : {}),
    ...(row.payment_provider_last_event_id
      ? { payment_provider_last_event_id: row.payment_provider_last_event_id }
      : {}),
    payment_reconciliation_status: row.payment_reconciliation_status,
    ...(row.payment_conflict_code
      ? { payment_conflict_code: row.payment_conflict_code }
      : {}),
    ...(iso(row.payment_conflict_at)
      ? { payment_conflict_at: iso(row.payment_conflict_at)! }
      : {}),
    ...(iso(row.payment_conflict_resolved_at)
      ? { payment_conflict_resolved_at: iso(row.payment_conflict_resolved_at)! }
      : {}),
    ...(row.payment_conflict_resolved_by_account_id
      ? { payment_conflict_resolved_by: row.payment_conflict_resolved_by_account_id }
      : {}),
    ...(row.payment_conflict_resolution_note
      ? { payment_conflict_resolution_note: row.payment_conflict_resolution_note }
      : {}),
    ...(decision ? { last_payment_decision: decision } : {}),
    source_channel: row.source_channel,
    total_price: row.total_iqd,
    created_at: iso(row.created_at) || new Date(0).toISOString(),
    updated_at: iso(row.updated_at) || new Date(0).toISOString(),
    version: row.version,
  };
}

async function loadOrderRow(
  client: OperationalSqlClient,
  merchantId: string,
  orderId: string,
  lock = false,
): Promise<OrderRow> {
  const result = await client.query<OrderRow>(
    `${ORDER_SELECT}
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [merchantId, orderId],
  );
  if (!result.rows[0]) {
    throw new OrderOperationError("ORDER_NOT_FOUND", "order was not found", 404);
  }
  return result.rows[0];
}

function assertVersion(row: OrderRow, version: number): void {
  if (row.version !== version) {
    throw new OrderOperationError(
      "ORDER_VERSION_CONFLICT",
      "order was changed by another request",
      409,
      { expected_version: version, current_version: row.version },
    );
  }
}

function assertOrderTransition(current: ServerOrderStatus, next: ServerOrderStatus): void {
  if (!ORDER_TRANSITIONS[current].has(next)) {
    throw new OrderOperationError(
      "ORDER_STATUS_TRANSITION_INVALID",
      `order status cannot change from ${current} to ${next}`,
    );
  }
}

async function ensureOnlineFulfillmentForConfirmation(
  client: OperationalSqlClient,
  current: OrderRow,
): Promise<void> {
  try {
    await ensureOnlineOrderFulfillmentCommittedWithTarget(client, {
      merchantId: current.merchant_id,
      orderId: current.id,
      customerArea: current.customer_area || current.customer_address || "",
      sourceChannel: current.source_channel,
      fulfillmentLocationId: current.fulfillment_location_id,
      metadata: current.metadata,
    });
  } catch (error) {
    if (error instanceof OnlineOrderFulfillmentCommitError) {
      throw new OrderOperationError(
        error.code,
        error.message,
        error.status,
        error.details,
      );
    }
    throw error;
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

export async function listServerOrdersAuthoritative(
  merchantIdValue: string,
): Promise<ServerOrder[]> {
  if (!operationalPostgresAuthorityRequired()) return listServerOrders(merchantIdValue);
  const merchantId = identifier(
    merchantIdValue,
    "ORDER_MERCHANT_ID_INVALID",
    "merchant identifier",
  );
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<OrderRow>(
      `${ORDER_SELECT} WHERE merchant_id = $1 ORDER BY created_at DESC, id`,
      [merchantId],
    );
    return Promise.all(result.rows.map((row) => mapOrder(client, row)));
  });
}

export async function getServerOrderAuthoritative(
  merchantIdValue: string,
  orderIdValue: string,
): Promise<ServerOrder> {
  if (!operationalPostgresAuthorityRequired()) {
    return getServerOrder(merchantIdValue, orderIdValue);
  }
  const merchantId = identifier(
    merchantIdValue,
    "ORDER_MERCHANT_ID_INVALID",
    "merchant identifier",
  );
  const orderId = identifier(orderIdValue, "ORDER_ID_INVALID", "order identifier");
  return withMerchantOperationalTransaction(merchantId, async (client) =>
    mapOrder(client, await loadOrderRow(client, merchantId, orderId)),
  );
}

export async function updateServerOrderStatusAuthoritative(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  status: unknown;
}): Promise<ServerOrder> {
  if (!operationalPostgresAuthorityRequired()) return updateServerOrderStatus(input);
  const merchantId = identifier(input.merchantId, "ORDER_MERCHANT_ID_INVALID", "merchant identifier");
  const orderId = identifier(input.orderId, "ORDER_ID_INVALID", "order identifier");
  const version = expectedVersion(input.expectedVersion);
  const next = text(input.status) as ServerOrderStatus;
  if (!ORDER_STATUSES.has(next)) {
    throw new OrderOperationError("ORDER_STATUS_INVALID", "order status is invalid", 400);
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const current = await loadOrderRow(client, merchantId, orderId, true);
    assertVersion(current, version);
    assertOrderTransition(current.status, next);
    if (current.status === next) return mapOrder(client, current);
    if (next === "confirmed") {
      await ensureOnlineFulfillmentForConfirmation(client, current);
    }
    await client.query(
      `UPDATE orders
          SET status = $3::order_status,
              version = version + 1,
              confirmed_at = CASE WHEN $3 = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
              cancelled_at = CASE WHEN $3 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
              delivered_at = CASE WHEN $3 = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, orderId, next],
    );
    return mapOrder(client, await loadOrderRow(client, merchantId, orderId));
  });
}

export async function updateServerPaymentStatusAuthoritative(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  paymentStatus: unknown;
}): Promise<ServerOrder> {
  if (!operationalPostgresAuthorityRequired()) return updateServerPaymentStatus(input);
  const merchantId = identifier(input.merchantId, "ORDER_MERCHANT_ID_INVALID", "merchant identifier");
  const orderId = identifier(input.orderId, "ORDER_ID_INVALID", "order identifier");
  const version = expectedVersion(input.expectedVersion);
  const next = text(input.paymentStatus) as ServerPaymentStatus;
  if (!PAYMENT_STATUSES.has(next)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_STATUS_INVALID",
      "payment status is invalid",
      400,
    );
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const current = await loadOrderRow(client, merchantId, orderId, true);
    assertVersion(current, version);
    assertNonTerminalPaymentTransition(current.payment_method, current.payment_status, next);
    if (current.payment_status === next) return mapOrder(client, current);
    await client.query(
      `UPDATE orders
          SET payment_status = $3::payment_status,
              payment_verified_at = NULL,
              payment_verified_by_account_id = NULL,
              payment_rejection_reason = NULL,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, orderId, next],
    );
    return mapOrder(client, await loadOrderRow(client, merchantId, orderId));
  });
}

async function saveTerminalDecision(input: {
  client: OperationalSqlClient;
  current: OrderRow;
  merchantId: string;
  orderId: string;
  actorId: string;
  requestId: string;
  operation: "confirm" | "reject";
  channel: "cash_on_delivery" | "electronic";
  outcome: "paid" | "failed";
  confirmationSource?: "merchant_confirmed" | "provider_verified";
  resultingStatus: ServerOrderStatus;
  resultingPaymentStatus: ServerPaymentStatus;
  reason?: string;
}): Promise<string> {
  if (input.requestId) {
    const replay = await input.client.query<{ order_id: string }>(
      `SELECT order_id
         FROM order_payment_decisions
        WHERE merchant_id = $1 AND request_id = $2
        LIMIT 1`,
      [input.merchantId, input.requestId],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].order_id !== input.orderId) {
        throw new OrderOperationError(
          "ORDER_PAYMENT_REQUEST_CONFLICT",
          "payment request identifier was already used for another order",
        );
      }
      return "replayed";
    }
  }
  const decisionId = crypto.randomUUID();
  await input.client.query(
    `INSERT INTO order_payment_decisions
      (id, merchant_id, order_id, operation, payment_channel, outcome, confirmation_source,
       previous_order_status, resulting_order_status,
       previous_payment_status, resulting_payment_status,
       actor_type, actor_account_id, request_id, reason,
       expected_version, resulting_version, decided_at)
     VALUES
      ($1, $2, $3, $4::payment_decision_operation,
       $5::payment_decision_channel, $6::payment_decision_outcome,
       $7::payment_confirmation_source,
       $8::order_status, $9::order_status,
       $10::payment_status, $11::payment_status,
       'merchant', $12, $13, $14, $15, $16, now())`,
    [
      decisionId,
      input.merchantId,
      input.orderId,
      input.operation,
      input.channel,
      input.outcome,
      input.confirmationSource || null,
      input.current.status,
      input.resultingStatus,
      input.current.payment_status,
      input.resultingPaymentStatus,
      input.actorId,
      input.requestId || null,
      input.reason || null,
      input.current.version,
      input.current.version + 1,
    ],
  );
  await input.client.query(
    `INSERT INTO order_terminal_decision_links
      (merchant_id, order_id, decision_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (merchant_id, order_id)
     DO UPDATE SET decision_id = EXCLUDED.decision_id, linked_at = now()`,
    [input.merchantId, input.orderId, decisionId],
  );
  return decisionId;
}

export async function confirmServerPaymentAuthoritative(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  actorId?: unknown;
  requestId?: unknown;
}): Promise<ServerOrder> {
  if (!operationalPostgresAuthorityRequired()) return confirmServerPayment(input);
  const merchantId = identifier(input.merchantId, "ORDER_MERCHANT_ID_INVALID", "merchant identifier");
  const orderId = identifier(input.orderId, "ORDER_ID_INVALID", "order identifier");
  const actorId = identifier(input.actorId || merchantId, "ORDER_PAYMENT_ACTOR_INVALID", "payment actor");
  const requestId = text(input.requestId).slice(0, 200);
  const version = expectedVersion(input.expectedVersion);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const current = await loadOrderRow(client, merchantId, orderId, true);
    if (requestId) {
      const replay = await client.query<{ order_id: string }>(
        `SELECT order_id FROM order_payment_decisions
          WHERE merchant_id = $1 AND request_id = $2 LIMIT 1`,
        [merchantId, requestId],
      );
      if (replay.rows[0]?.order_id === orderId) return mapOrder(client, current);
    }
    assertVersion(current, version);
    let resultingStatus = current.status;
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
    } else {
      if (
        current.payment_status !== "electronic_pending" &&
        current.payment_status !== "manual_review" &&
        current.payment_status !== "failed"
      ) {
        throw new OrderOperationError(
          "ORDER_PAYMENT_REVIEW_REQUIRED",
          "only a pending electronic payment can be confirmed",
        );
      }
      assertOrderTransition(current.status, "confirmed");
      await ensureOnlineFulfillmentForConfirmation(client, current);
      resultingStatus = "confirmed";
    }
    const providerEvidence =
      current.payment_method === "cash_on_delivery"
        ? { rows: [] as Array<{ provider: string; provider_event_id: string; provider_transaction_ref: string | null; outcome: string }> }
        : await client.query<{
            provider: string;
            provider_event_id: string;
            provider_transaction_ref: string | null;
            outcome: string;
          }>(
            `SELECT provider, provider_event_id, provider_transaction_ref, outcome::text AS outcome
               FROM order_payment_provider_events
              WHERE merchant_id = $1 AND order_id = $2
              ORDER BY received_at DESC, processed_at DESC, id DESC
              LIMIT 1`,
            [merchantId, orderId],
          );
    const latestProvider = providerEvidence.rows[0];
    const providerConflict = Boolean(latestProvider && latestProvider.outcome !== "paid");
    const providerConflictCode = providerConflict
      ? `MERCHANT_PAID_PROVIDER_${String(latestProvider!.outcome).toUpperCase()}`
      : null;

    await saveTerminalDecision({
      client,
      current,
      merchantId,
      orderId,
      actorId,
      requestId,
      operation: "confirm",
      channel: current.payment_method === "cash_on_delivery" ? "cash_on_delivery" : "electronic",
      outcome: "paid",
      confirmationSource: "merchant_confirmed",
      resultingStatus,
      resultingPaymentStatus: "paid",
    });
    await client.query(
      `UPDATE orders
          SET status = $3::order_status,
              payment_status = 'paid',
              payment_verified_at = now(),
              payment_verified_by_account_id = $4,
              payment_rejection_reason = NULL,
              payment_confirmation_source = 'merchant_confirmed',
              payment_provider = COALESCE($5, payment_provider),
              payment_provider_transaction_ref = COALESCE($6, payment_provider_transaction_ref),
              payment_provider_last_event_id = COALESCE($7, payment_provider_last_event_id),
              payment_reconciliation_status = (CASE WHEN $8::boolean THEN 'reconciliation_required' ELSE 'clear' END)::payment_reconciliation_status,
              payment_conflict_code = CASE WHEN $8::boolean THEN $9 ELSE NULL END,
              payment_conflict_at = CASE WHEN $8::boolean THEN COALESCE(payment_conflict_at, now()) ELSE NULL END,
              payment_conflict_resolved_at = NULL,
              payment_conflict_resolved_by_account_id = NULL,
              payment_conflict_resolution_note = NULL,
              confirmed_at = CASE WHEN $3 = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [
        merchantId,
        orderId,
        resultingStatus,
        actorId,
        latestProvider?.provider || null,
        latestProvider?.provider_transaction_ref || null,
        latestProvider?.provider_event_id || null,
        providerConflict,
        providerConflictCode,
      ],
    );
    if (providerConflict && current.conversation_id) {
      await client.query(
        `UPDATE conversations
            SET status = 'manual', assigned_to_human = TRUE, updated_at = now()
          WHERE merchant_id = $1 AND id = $2`,
        [merchantId, current.conversation_id],
      );
    }
    return mapOrder(client, await loadOrderRow(client, merchantId, orderId));
  });
}

export async function rejectServerPaymentAuthoritative(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  reason: unknown;
  actorId?: unknown;
  requestId?: unknown;
}): Promise<ServerOrder> {
  if (!operationalPostgresAuthorityRequired()) return rejectServerPayment(input);
  const reason = text(input.reason);
  if (!reason || reason.length > 500) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_REJECTION_REASON_INVALID",
      "payment rejection reason must contain 1 to 500 characters",
      400,
    );
  }
  const merchantId = identifier(input.merchantId, "ORDER_MERCHANT_ID_INVALID", "merchant identifier");
  const orderId = identifier(input.orderId, "ORDER_ID_INVALID", "order identifier");
  const actorId = identifier(input.actorId || merchantId, "ORDER_PAYMENT_ACTOR_INVALID", "payment actor");
  const requestId = text(input.requestId).slice(0, 200);
  const version = expectedVersion(input.expectedVersion);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const current = await loadOrderRow(client, merchantId, orderId, true);
    if (requestId) {
      const replay = await client.query<{ order_id: string }>(
        `SELECT order_id FROM order_payment_decisions
          WHERE merchant_id = $1 AND request_id = $2 LIMIT 1`,
        [merchantId, requestId],
      );
      if (replay.rows[0]?.order_id === orderId) return mapOrder(client, current);
    }
    assertVersion(current, version);
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
    await saveTerminalDecision({
      client,
      current,
      merchantId,
      orderId,
      actorId,
      requestId,
      operation: "reject",
      channel: "electronic",
      outcome: "failed",
      resultingStatus: "pending_confirmation",
      resultingPaymentStatus: "failed",
      reason,
    });
    await client.query(
      `UPDATE orders
          SET status = 'pending_confirmation',
              payment_status = 'failed',
              payment_verified_at = NULL,
              payment_verified_by_account_id = NULL,
              payment_rejection_reason = $3,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, orderId, reason],
    );
    return mapOrder(client, await loadOrderRow(client, merchantId, orderId));
  });
}
