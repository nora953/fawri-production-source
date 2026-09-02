import type { OperationalSqlClient } from "./operationalPostgresAuthority";
import type { WhatsAppDeliveryState } from "./whatsappDeliveryLifecycle";
import type { WhatsAppDeliveryStatusPlan } from "./whatsappWebhookPlanner";

export type CorrelatedWhatsAppDelivery = {
  merchant_id: string;
  channel_id: string;
  inbound_event_id: string;
  reply_intent_id: string;
  reservation_id?: string;
  state: WhatsAppDeliveryState;
};

type DeliveryRow = {
  id: string;
  merchant_id: string;
  inbound_event_id: string;
  reservation_id: string | null;
  reply_intent_id: string;
  outcome: string;
  provider_message_id: string | null;
  failure_code: string | null;
  channel_id: string;
};

function correlationError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function identity(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 512 || /[\r\n]/.test(normalized)) {
    throw correlationError(
      "WHATSAPP_DELIVERY_CORRELATION_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

/**
 * Correlates a provider status only to a previously confirmed-send row owned by
 * the same merchant and inbound channel. It never searches globally by provider
 * message id alone, preventing a cross-tenant status from attaching to another
 * merchant. Failed/uncertain/pending rows intentionally cannot correlate because
 * the dormant send model stores no invented provider message id for them.
 */
export async function correlateWhatsAppDeliveryWithClient(
  client: OperationalSqlClient,
  observation: WhatsAppDeliveryStatusPlan,
): Promise<CorrelatedWhatsAppDelivery> {
  const merchantId = identity(observation.merchant_id, "merchant id");
  const channelId = identity(observation.channel_id, "channel id");
  const providerMessageId = identity(
    observation.external_message_id,
    "provider message id",
  );

  const result = await client.query<DeliveryRow>(
    `SELECT d.id, d.merchant_id, d.inbound_event_id, d.reservation_id,
            d.reply_intent_id, d.outcome::text AS outcome,
            d.provider_message_id, d.failure_code,
            i.channel_id
       FROM outbound_deliveries d
       JOIN channel_inbound_events i
         ON i.id = d.inbound_event_id
        AND i.merchant_id = d.merchant_id
      WHERE d.merchant_id = $1
        AND i.channel_id = $2
        AND i.provider = 'whatsapp'::channel_platform
        AND d.provider_message_id = $3
      ORDER BY d.id
      LIMIT 2`,
    [merchantId, channelId, providerMessageId],
  );

  if (result.rows.length === 0) {
    throw correlationError(
      "WHATSAPP_DELIVERY_NOT_CORRELATED",
      "WhatsApp provider status does not match a known delivery",
    );
  }
  if (result.rows.length !== 1) {
    throw correlationError(
      "WHATSAPP_DELIVERY_CORRELATION_AMBIGUOUS",
      "WhatsApp provider status matches more than one delivery",
    );
  }

  const row = result.rows[0];
  if (
    row.merchant_id !== merchantId ||
    row.channel_id !== channelId ||
    row.outcome !== "sent" ||
    row.provider_message_id !== providerMessageId
  ) {
    throw correlationError(
      "WHATSAPP_DELIVERY_CORRELATION_STATE_INVALID",
      "WhatsApp correlated delivery is not a confirmed send",
    );
  }

  return {
    merchant_id: merchantId,
    channel_id: channelId,
    inbound_event_id: row.inbound_event_id,
    reply_intent_id: row.reply_intent_id,
    ...(row.reservation_id ? { reservation_id: row.reservation_id } : {}),
    state: {
      local_attempt_id: row.id,
      waba_id: observation.waba_id,
      phone_number_id: observation.phone_number_id,
      external_message_id: providerMessageId,
      phase: "sent",
      ...(observation.recipient_id
        ? { recipient_id: observation.recipient_id }
        : {}),
      error_codes: [],
    },
  };
}
