import crypto from "node:crypto";
import {
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";

function text(value: unknown): string {
  return String(value || "").trim();
}

function createdAt(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
}

function deterministicId(type: string, merchantId: string, sourceId: string): string {
  return `notification-${crypto
    .createHash("sha256")
    .update(`${type}:${merchantId}:${sourceId}`)
    .digest("hex")}`;
}

async function insertOperationalNotification(input: {
  merchantId: string;
  type:
    | "operational_new_order"
    | "operational_customer_message"
    | "operational_payment_conflict";
  sourceEntityType: "order" | "conversation_event" | "order_payment_conflict";
  sourceEntityId: string;
  titleKey: string;
  bodyKey: string;
  variables: Record<string, string | number | boolean | null>;
  createdAt?: unknown;
}): Promise<{ notification_id: string; deduplicated: boolean }> {
  const merchantId = text(input.merchantId);
  const sourceEntityId = text(input.sourceEntityId);
  if (!merchantId || !sourceEntityId) {
    throw Object.assign(new Error("operational notification identity is invalid"), {
      code: "OPERATIONAL_NOTIFICATION_IDENTITY_INVALID",
    });
  }
  const id = deterministicId(input.type, merchantId, sourceEntityId);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM notifications
        WHERE merchant_id = $1 AND id = $2
        LIMIT 1`,
      [merchantId, id],
    );
    if (existing.rows[0]) {
      return { notification_id: id, deduplicated: true };
    }
    await client.query(
      `INSERT INTO notifications
        (id, audience, merchant_id, account_id, type,
         title_key, body_key, variables,
         source_entity_type, source_entity_id, created_at)
       VALUES
        ($1, 'merchant', $2, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        merchantId,
        input.type,
        input.titleKey,
        input.bodyKey,
        JSON.stringify(input.variables),
        input.sourceEntityType,
        sourceEntityId,
        createdAt(input.createdAt),
      ],
    );
    return { notification_id: id, deduplicated: false };
  });
}

export async function notifyMerchantNewOrderPostgres(input: {
  merchantId: string;
  orderId: string;
  conversationId?: string;
  createdAt?: unknown;
}) {
  const orderId = text(input.orderId);
  return insertOperationalNotification({
    merchantId: input.merchantId,
    type: "operational_new_order",
    sourceEntityType: "order",
    sourceEntityId: orderId,
    titleKey: "notifications.new_order.title",
    bodyKey: "notifications.new_order.body",
    variables: {
      order_id: orderId,
      ...(text(input.conversationId)
        ? { conversation_id: text(input.conversationId) }
        : {}),
      action_url: `/dashboard/orders?order=${encodeURIComponent(orderId)}`,
    },
    createdAt: input.createdAt,
  });
}

export async function notifyMerchantPaymentConflictPostgres(input: {
  merchantId: string;
  orderId: string;
  conversationId?: string;
  provider?: string;
  sourceEventId: string;
  createdAt?: unknown;
}) {
  const orderId = text(input.orderId);
  const conversationId = text(input.conversationId);
  const sourceEventId = text(input.sourceEventId);
  return insertOperationalNotification({
    merchantId: input.merchantId,
    type: "operational_payment_conflict",
    sourceEntityType: "order_payment_conflict",
    sourceEntityId: sourceEventId || orderId,
    titleKey: "notifications.payment_conflict.title",
    bodyKey: "notifications.payment_conflict.body",
    variables: {
      order_id: orderId,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(text(input.provider) ? { provider: text(input.provider) } : {}),
      action_url: conversationId
        ? `/dashboard/conversations?conversation=${encodeURIComponent(conversationId)}`
        : `/dashboard/orders?order=${encodeURIComponent(orderId)}`,
    },
    createdAt: input.createdAt,
  });
}

export async function notifyMerchantNewCustomerMessagePostgres(input: {
  merchantId: string;
  conversationId: string;
  sourceEventId: string;
  createdAt?: unknown;
}) {
  const conversationId = text(input.conversationId);
  return insertOperationalNotification({
    merchantId: input.merchantId,
    type: "operational_customer_message",
    sourceEntityType: "conversation_event",
    sourceEntityId: text(input.sourceEventId),
    titleKey: "notifications.customer_message.title",
    bodyKey: "notifications.customer_message.body",
    variables: {
      conversation_id: conversationId,
      action_url: `/dashboard/conversations?conversation=${encodeURIComponent(conversationId)}`,
    },
    createdAt: input.createdAt,
  });
}
