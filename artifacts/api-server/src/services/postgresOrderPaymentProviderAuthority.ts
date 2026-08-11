import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import {
  getServerOrderAuthoritative,
} from "./postgresOrderOperationsAuthority";
import {
  notifyMerchantPaymentConflictPostgres,
} from "./postgresOperationalNotificationAuthority";
import {
  OrderOperationError,
  type ServerOrder,
  type ServerOrderStatus,
  type ServerPaymentStatus,
} from "./orderOperationsRuntime";

export type VerifiedProviderPaymentOutcome = "paid" | "failed" | "cancelled";

export type VerifiedProviderPaymentEvidence = {
  merchantId: string;
  orderId: string;
  provider: string;
  providerEventId: string;
  providerTransactionRef?: string;
  outcome: VerifiedProviderPaymentOutcome;
  amountIqd: number;
  currency: "IQD";
  payloadSha256: string;
  authenticityVerified: true;
  sanitizedMetadata?: Record<string, string | number | boolean | null>;
  receivedAt?: Date;
};

export type ProviderPaymentEvidenceResult = {
  order: ServerOrder;
  deduplicated: boolean;
  action:
    | "provider_paid_confirmed"
    | "provider_failure_recorded"
    | "payment_conflict"
    | "provider_evidence_recorded";
};

type OrderPaymentRow = {
  id: string;
  merchant_id: string;
  conversation_id: string | null;
  status: ServerOrderStatus;
  payment_method: string;
  payment_status: ServerPaymentStatus;
  total_iqd: number;
  version: number;
  payment_confirmation_source: "merchant_confirmed" | "provider_verified" | null;
  payment_provider: string | null;
  payment_provider_transaction_ref: string | null;
  payment_provider_last_event_id: string | null;
  payment_reconciliation_status:
    | "clear"
    | "reconciliation_required"
    | "resolved";
};

type ProviderEventRow = {
  id: string;
  outcome: VerifiedProviderPaymentOutcome;
  resulting_action: string;
};

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9._-]{1,39}$/;
const EVENT_PATTERN = /^[A-Za-z0-9._:-]{6,200}$/;
const TRANSACTION_PATTERN = /^[A-Za-z0-9._:/+-]{1,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const FORBIDDEN_METADATA_KEY =
  /(authorization|access[_-]?token|secret|password|pin|cvv|cvc|pan|card[_-]?number|cookie)/i;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function providerCode(value: unknown): string {
  const normalized = text(value).toLowerCase();
  if (!PROVIDER_PATTERN.test(normalized)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_INVALID",
      "payment provider identifier is invalid",
      400,
    );
  }
  return normalized;
}

function providerEventId(value: unknown): string {
  const normalized = text(value);
  if (!EVENT_PATTERN.test(normalized)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_EVENT_INVALID",
      "provider payment event identifier is invalid",
      400,
    );
  }
  return normalized;
}

function providerTransactionRef(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  if (!TRANSACTION_PATTERN.test(normalized)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_TRANSACTION_INVALID",
      "provider transaction reference is invalid",
      400,
    );
  }
  return normalized;
}

function amountIqd(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_AMOUNT_INVALID",
      "provider payment amount is invalid",
      400,
    );
  }
  return parsed;
}

function payloadHash(value: unknown): string {
  const normalized = text(value).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_PAYLOAD_HASH_INVALID",
      "provider payload hash is invalid",
      400,
    );
  }
  return normalized;
}

function safeMetadata(
  value: unknown,
): Record<string, string | number | boolean | null> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_METADATA_INVALID",
      "provider metadata must be a sanitized object",
      400,
    );
  }
  const output: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = text(rawKey);
    if (!key || key.length > 80 || FORBIDDEN_METADATA_KEY.test(key)) {
      throw new OrderOperationError(
        "ORDER_PAYMENT_PROVIDER_METADATA_UNSAFE",
        "provider metadata contains a forbidden field",
        400,
      );
    }
    if (
      rawValue !== null &&
      typeof rawValue !== "string" &&
      typeof rawValue !== "number" &&
      typeof rawValue !== "boolean"
    ) {
      throw new OrderOperationError(
        "ORDER_PAYMENT_PROVIDER_METADATA_INVALID",
        "provider metadata values must be scalar",
        400,
      );
    }
    if (typeof rawValue === "string" && rawValue.length > 500) {
      throw new OrderOperationError(
        "ORDER_PAYMENT_PROVIDER_METADATA_INVALID",
        "provider metadata value is too long",
        400,
      );
    }
    output[key] = rawValue;
  }
  if (JSON.stringify(output).length > 4_000) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_METADATA_INVALID",
      "provider metadata is too large",
      400,
    );
  }
  return output;
}

function receivedAt(value: unknown): Date {
  if (value === undefined) return new Date();
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_RECEIVED_AT_INVALID",
      "provider event timestamp is invalid",
      400,
    );
  }
  return parsed;
}

function providerFailureReason(
  provider: string,
  outcome: Exclude<VerifiedProviderPaymentOutcome, "paid">,
): string {
  return `${provider} provider verified payment ${outcome}`.slice(0, 500);
}

function conflictCode(
  source: OrderPaymentRow["payment_confirmation_source"],
  providerOutcome: VerifiedProviderPaymentOutcome,
): string {
  if (source === "merchant_confirmed") {
    return providerOutcome === "paid"
      ? "MERCHANT_AND_PROVIDER_PAYMENT_AGREE"
      : `MERCHANT_PAID_PROVIDER_${providerOutcome.toUpperCase()}`;
  }
  return `PROVIDER_PAYMENT_${providerOutcome.toUpperCase()}_ORDER_STATE_CONFLICT`;
}

async function lockOrder(
  client: OperationalSqlClient,
  merchantId: string,
  orderId: string,
): Promise<OrderPaymentRow> {
  const result = await client.query<OrderPaymentRow>(
    `SELECT id, merchant_id, conversation_id,
            status::text AS status,
            payment_method::text AS payment_method,
            payment_status::text AS payment_status,
            total_iqd, version,
            payment_confirmation_source::text AS payment_confirmation_source,
            payment_provider,
            payment_provider_transaction_ref,
            payment_provider_last_event_id,
            payment_reconciliation_status::text AS payment_reconciliation_status
       FROM orders
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, orderId],
  );
  if (!result.rows[0]) {
    throw new OrderOperationError("ORDER_NOT_FOUND", "order was not found", 404);
  }
  return result.rows[0];
}

async function findExistingEvent(
  client: OperationalSqlClient,
  merchantId: string,
  provider: string,
  eventId: string,
): Promise<ProviderEventRow | null> {
  const result = await client.query<ProviderEventRow>(
    `SELECT id, outcome::text AS outcome, resulting_action
       FROM order_payment_provider_events
      WHERE merchant_id = $1 AND provider = $2 AND provider_event_id = $3
      LIMIT 1`,
    [merchantId, provider, eventId],
  );
  return result.rows[0] || null;
}

async function forceConversationManual(
  client: OperationalSqlClient,
  merchantId: string,
  conversationId: string | null,
): Promise<void> {
  if (!conversationId) return;
  await client.query(
    `UPDATE conversations
        SET status = 'manual', assigned_to_human = TRUE, updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, conversationId],
  );
}

async function insertProviderEvent(input: {
  client: OperationalSqlClient;
  merchantId: string;
  orderId: string;
  provider: string;
  eventId: string;
  transactionRef: string | null;
  outcome: VerifiedProviderPaymentOutcome;
  amountIqd: number;
  payloadSha256: string;
  metadata: Record<string, string | number | boolean | null>;
  receivedAt: Date;
  resultingAction: ProviderPaymentEvidenceResult["action"];
}): Promise<void> {
  await input.client.query(
    `INSERT INTO order_payment_provider_events
      (id, merchant_id, order_id, provider, provider_event_id,
       provider_transaction_ref, outcome, amount_iqd, currency,
       authenticity_verified, payload_sha256, sanitized_metadata,
       resulting_action, received_at, processed_at)
     VALUES
      ($1, $2, $3, $4, $5, $6,
       $7::provider_payment_outcome, $8, 'IQD', TRUE, $9, $10::jsonb,
       $11, $12::timestamptz, now())`,
    [
      `provider-event-${crypto.randomUUID()}`,
      input.merchantId,
      input.orderId,
      input.provider,
      input.eventId,
      input.transactionRef,
      input.outcome,
      input.amountIqd,
      input.payloadSha256,
      JSON.stringify(input.metadata),
      input.resultingAction,
      input.receivedAt.toISOString(),
    ],
  );
}

async function markConflict(input: {
  client: OperationalSqlClient;
  order: OrderPaymentRow;
  provider: string;
  eventId: string;
  transactionRef: string | null;
  code: string;
}): Promise<void> {
  await input.client.query(
    `UPDATE orders
        SET payment_provider = $3,
            payment_provider_transaction_ref = COALESCE($4, payment_provider_transaction_ref),
            payment_provider_last_event_id = $5,
            payment_reconciliation_status = 'reconciliation_required',
            payment_conflict_code = $6,
            payment_conflict_at = COALESCE(payment_conflict_at, now()),
            payment_conflict_resolved_at = NULL,
            payment_conflict_resolved_by_account_id = NULL,
            payment_conflict_resolution_note = NULL,
            version = version + 1,
            updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [
      input.order.merchant_id,
      input.order.id,
      input.provider,
      input.transactionRef,
      input.eventId,
      input.code,
    ],
  );
  await forceConversationManual(
    input.client,
    input.order.merchant_id,
    input.order.conversation_id,
  );
}

async function applyProviderPaid(input: {
  client: OperationalSqlClient;
  order: OrderPaymentRow;
  provider: string;
  eventId: string;
  transactionRef: string | null;
}): Promise<ProviderPaymentEvidenceResult["action"]> {
  const order = input.order;
  if (order.payment_status === "paid") {
    await input.client.query(
      `UPDATE orders
          SET payment_provider = $3,
              payment_provider_transaction_ref = COALESCE($4, payment_provider_transaction_ref),
              payment_provider_last_event_id = $5,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [order.merchant_id, order.id, input.provider, input.transactionRef, input.eventId],
    );
    return "provider_evidence_recorded";
  }

  if (order.payment_method === "cash_on_delivery") {
    await markConflict({
      client: input.client,
      order,
      provider: input.provider,
      eventId: input.eventId,
      transactionRef: input.transactionRef,
      code: "PROVIDER_PAYMENT_ON_CASH_ORDER",
    });
    return "payment_conflict";
  }

  if (order.status === "cancelled" || order.status === "delivered") {
    await markConflict({
      client: input.client,
      order,
      provider: input.provider,
      eventId: input.eventId,
      transactionRef: input.transactionRef,
      code: "PROVIDER_PAID_ORDER_STATE_CONFLICT",
    });
    return "payment_conflict";
  }

  const resultingStatus: ServerOrderStatus =
    order.status === "pending_confirmation" || order.status === "waiting_customer_approval"
      ? "confirmed"
      : order.status;

  await input.client.query(
    `UPDATE orders
        SET status = $3::order_status,
            payment_status = 'paid',
            payment_verified_at = now(),
            payment_verified_by_account_id = NULL,
            payment_rejection_reason = NULL,
            payment_confirmation_source = 'provider_verified',
            payment_provider = $4,
            payment_provider_transaction_ref = $5,
            payment_provider_last_event_id = $6,
            payment_reconciliation_status = 'clear',
            payment_conflict_code = NULL,
            payment_conflict_at = NULL,
            payment_conflict_resolved_at = NULL,
            payment_conflict_resolved_by_account_id = NULL,
            payment_conflict_resolution_note = NULL,
            confirmed_at = CASE WHEN $3 = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
            version = version + 1,
            updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [
      order.merchant_id,
      order.id,
      resultingStatus,
      input.provider,
      input.transactionRef,
      input.eventId,
    ],
  );
  return "provider_paid_confirmed";
}

async function applyProviderFailure(input: {
  client: OperationalSqlClient;
  order: OrderPaymentRow;
  provider: string;
  eventId: string;
  transactionRef: string | null;
  outcome: Exclude<VerifiedProviderPaymentOutcome, "paid">;
}): Promise<ProviderPaymentEvidenceResult["action"]> {
  const order = input.order;
  if (order.payment_status === "paid") {
    await markConflict({
      client: input.client,
      order,
      provider: input.provider,
      eventId: input.eventId,
      transactionRef: input.transactionRef,
      code: conflictCode(order.payment_confirmation_source, input.outcome),
    });
    return "payment_conflict";
  }

  if (order.payment_method === "cash_on_delivery") {
    return "provider_evidence_recorded";
  }

  await input.client.query(
    `UPDATE orders
        SET payment_status = 'failed',
            payment_verified_at = NULL,
            payment_verified_by_account_id = NULL,
            payment_rejection_reason = $3,
            payment_confirmation_source = NULL,
            payment_provider = $4,
            payment_provider_transaction_ref = COALESCE($5, payment_provider_transaction_ref),
            payment_provider_last_event_id = $6,
            version = version + 1,
            updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [
      order.merchant_id,
      order.id,
      providerFailureReason(input.provider, input.outcome),
      input.provider,
      input.transactionRef,
      input.eventId,
    ],
  );
  return "provider_failure_recorded";
}

export async function recordVerifiedProviderPaymentEvidenceAuthoritative(
  input: VerifiedProviderPaymentEvidence,
): Promise<ProviderPaymentEvidenceResult> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_POSTGRES_REQUIRED",
      "provider payment confirmation requires PostgreSQL authority",
      503,
    );
  }
  if (input.authenticityVerified !== true) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_AUTHENTICITY_REQUIRED",
      "provider payment evidence must be authenticated before ingestion",
      403,
    );
  }

  const merchantId = text(input.merchantId);
  const orderId = text(input.orderId);
  if (!merchantId || merchantId.length > 200 || !orderId || orderId.length > 200) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_IDENTITY_INVALID",
      "merchant and order identifiers are required",
      400,
    );
  }
  const provider = providerCode(input.provider);
  const eventId = providerEventId(input.providerEventId);
  const transactionRef = providerTransactionRef(input.providerTransactionRef);
  const amount = amountIqd(input.amountIqd);
  if (input.currency !== "IQD") {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_CURRENCY_INVALID",
      "provider payment currency must match the IQD order currency",
      409,
    );
  }
  if (input.outcome !== "paid" && input.outcome !== "failed" && input.outcome !== "cancelled") {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_OUTCOME_INVALID",
      "provider payment outcome is invalid",
      400,
    );
  }
  const hash = payloadHash(input.payloadSha256);
  const metadata = safeMetadata(input.sanitizedMetadata);
  const eventReceivedAt = receivedAt(input.receivedAt);

  const applied = await withMerchantOperationalTransaction(merchantId, async (client) => {
    const existing = await findExistingEvent(client, merchantId, provider, eventId);
    if (existing) {
      const order = await lockOrder(client, merchantId, orderId);
      return {
        deduplicated: true,
        action: existing.resulting_action as ProviderPaymentEvidenceResult["action"],
        conflict: order.payment_reconciliation_status === "reconciliation_required",
        conversationId: order.conversation_id,
      };
    }

    const order = await lockOrder(client, merchantId, orderId);
    if (amount !== order.total_iqd) {
      throw new OrderOperationError(
        "ORDER_PAYMENT_PROVIDER_AMOUNT_MISMATCH",
        "provider payment amount does not match the server-authoritative order total",
        409,
        { expected_amount_iqd: order.total_iqd, received_amount_iqd: amount },
      );
    }

    const action =
      input.outcome === "paid"
        ? await applyProviderPaid({
            client,
            order,
            provider,
            eventId,
            transactionRef,
          })
        : await applyProviderFailure({
            client,
            order,
            provider,
            eventId,
            transactionRef,
            outcome: input.outcome,
          });

    await insertProviderEvent({
      client,
      merchantId,
      orderId,
      provider,
      eventId,
      transactionRef,
      outcome: input.outcome,
      amountIqd: amount,
      payloadSha256: hash,
      metadata,
      receivedAt: eventReceivedAt,
      resultingAction: action,
    });

    const refreshed = await lockOrder(client, merchantId, orderId);
    return {
      deduplicated: false,
      action,
      conflict: refreshed.payment_reconciliation_status === "reconciliation_required",
      conversationId: refreshed.conversation_id,
    };
  });

  if (applied.conflict) {
    await notifyMerchantPaymentConflictPostgres({
      merchantId,
      orderId,
      conversationId: applied.conversationId || undefined,
      provider,
      sourceEventId: `${provider}:${eventId}`,
    });
  }

  return {
    order: await getServerOrderAuthoritative(merchantId, orderId),
    deduplicated: applied.deduplicated,
    action: applied.action,
  };
}

export async function resolveMerchantPaymentConflictAuthoritative(input: {
  merchantId: string;
  orderId: string;
  expectedVersion: unknown;
  actorId: string;
  resolutionNote: unknown;
}): Promise<ServerOrder> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_PROVIDER_POSTGRES_REQUIRED",
      "payment reconciliation requires PostgreSQL authority",
      503,
    );
  }
  const merchantId = text(input.merchantId);
  const orderId = text(input.orderId);
  const actorId = text(input.actorId);
  const note = text(input.resolutionNote);
  const version = Number(input.expectedVersion);
  if (!merchantId || !orderId || !actorId) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_CONFLICT_IDENTITY_INVALID",
      "payment conflict resolution identity is invalid",
      400,
    );
  }
  if (!Number.isInteger(version) || version <= 0) {
    throw new OrderOperationError(
      "ORDER_VERSION_REQUIRED",
      "a positive expected_version is required",
      400,
    );
  }
  if (!note || note.length > 500) {
    throw new OrderOperationError(
      "ORDER_PAYMENT_CONFLICT_RESOLUTION_INVALID",
      "payment conflict resolution note must contain 1 to 500 characters",
      400,
    );
  }

  await withMerchantOperationalTransaction(merchantId, async (client) => {
    const order = await lockOrder(client, merchantId, orderId);
    if (order.version !== version) {
      throw new OrderOperationError(
        "ORDER_VERSION_CONFLICT",
        "order was changed by another request",
        409,
        { expected_version: version, current_version: order.version },
      );
    }
    if (order.payment_reconciliation_status !== "reconciliation_required") {
      throw new OrderOperationError(
        "ORDER_PAYMENT_CONFLICT_NOT_ACTIVE",
        "order does not have an unresolved payment conflict",
        409,
      );
    }

    await client.query(
      `UPDATE orders
          SET payment_reconciliation_status = 'resolved',
              payment_conflict_resolved_at = now(),
              payment_conflict_resolved_by_account_id = $3,
              payment_conflict_resolution_note = $4,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, orderId, actorId, note],
    );
    await client.query(
      `INSERT INTO audit_events
        (id, actor_kind, actor_account_id, merchant_id, action_type,
         entity_type, entity_id, reason_code, details, metadata, created_at)
       VALUES
        ($1, 'account', $2, $3, 'order_payment_conflict_resolved',
         'order', $4, 'merchant_reconciled', $5, $6::jsonb, now())`,
      [
        `audit-${crypto.randomUUID()}`,
        actorId,
        merchantId,
        orderId,
        note,
        JSON.stringify({
          payment_confirmation_source: order.payment_confirmation_source,
          payment_provider: order.payment_provider,
          payment_provider_last_event_id: order.payment_provider_last_event_id,
        }),
      ],
    );
  });

  return getServerOrderAuthoritative(merchantId, orderId);
}
