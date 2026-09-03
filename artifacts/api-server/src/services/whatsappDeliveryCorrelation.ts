import type { OperationalSqlClient } from "./operationalPostgresAuthority";
import type { WhatsAppDeliveryState } from "./whatsappDeliveryLifecycle";
import {
  assertExpectedWhatsAppRecipientStructure,
  assertWhatsAppDeliveryStatusPlanStructure,
} from "./whatsappDeliveryRuntimeGuards";
import {
  assertWhatsAppDeliveryCorrelationResultStructure,
} from "./whatsappDeliveryCorrelationResultGuard";
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
  waba_id: string | null;
  phone_number_id: string | null;
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

function numericProviderIdentity(value: unknown, label: string): string {
  const normalized = identity(value, label);
  if (!/^\d{1,40}$/.test(normalized)) {
    throw correlationError(
      "WHATSAPP_DELIVERY_CORRELATION_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function recipientIdentity(value: unknown, label: string): string {
  const normalized = identity(value, label);
  if (!/^\d{6,20}$/.test(normalized)) {
    throw correlationError(
      "WHATSAPP_DELIVERY_CORRELATION_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

/**
 * Correlates a provider status only to a previously confirmed-send row owned by
 * the same merchant and the exact WhatsApp channel identity. It never searches
 * globally by provider message id alone. WABA + phone-number identity are
 * checked against `merchant_channels` as well as the already-resolved channel
 * id so a forged/cross-channel observation cannot attach to another delivery.
 *
 * A trusted expected recipient is mandatory and must come from the original
 * outbound request/encrypted attempt authority, never from the status webhook.
 * If Meta supplies `recipient_id`, it must match that trusted identity before a
 * database lookup is allowed. Failed/uncertain/pending rows intentionally cannot
 * correlate because the send model stores no invented provider message id for
 * them.
 */
export async function correlateWhatsAppDeliveryWithClient(
  client: OperationalSqlClient,
  observation: WhatsAppDeliveryStatusPlan,
  expectedRecipientId: unknown,
): Promise<CorrelatedWhatsAppDelivery> {
  assertWhatsAppDeliveryStatusPlanStructure(observation);
  assertExpectedWhatsAppRecipientStructure(expectedRecipientId);

  const merchantId = identity(observation.merchant_id, "merchant id");
  const channelId = identity(observation.channel_id, "channel id");
  const providerMessageId = identity(
    observation.external_message_id,
    "provider message id",
  );
  const wabaId = numericProviderIdentity(observation.waba_id, "WABA id");
  const phoneNumberId = numericProviderIdentity(
    observation.phone_number_id,
    "phone number id",
  );
  const expectedRecipient = recipientIdentity(
    expectedRecipientId,
    "expected recipient id",
  );
  const observedRecipient = String(observation.recipient_id ?? "").trim();
  if (
    observedRecipient &&
    recipientIdentity(observedRecipient, "observed recipient id") !== expectedRecipient
  ) {
    throw correlationError(
      "WHATSAPP_DELIVERY_RECIPIENT_MISMATCH",
      "WhatsApp provider status belongs to a different recipient",
    );
  }

  const result = await client.query<DeliveryRow>(
    `SELECT d.id, d.merchant_id, d.inbound_event_id, d.reservation_id,
            d.reply_intent_id, d.outcome::text AS outcome,
            d.provider_message_id, d.failure_code,
            i.channel_id,
            c.whatsapp_business_account_id AS waba_id,
            c.whatsapp_phone_number_id AS phone_number_id
       FROM outbound_deliveries d
       JOIN channel_inbound_events i
         ON i.id = d.inbound_event_id
        AND i.merchant_id = d.merchant_id
       JOIN merchant_channels c
         ON c.id = i.channel_id
        AND c.merchant_id = i.merchant_id
      WHERE d.merchant_id = $1
        AND i.channel_id = $2
        AND i.provider = 'whatsapp'::channel_platform
        AND c.platform = 'whatsapp'::channel_platform
        AND d.provider_message_id = $3
        AND c.whatsapp_business_account_id = $4
        AND c.whatsapp_phone_number_id = $5
      ORDER BY d.id
      LIMIT 2`,
    [merchantId, channelId, providerMessageId, wabaId, phoneNumberId],
  );
  assertWhatsAppDeliveryCorrelationResultStructure(result);

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
    row.provider_message_id !== providerMessageId ||
    row.waba_id !== wabaId ||
    row.phone_number_id !== phoneNumberId
  ) {
    throw correlationError(
      "WHATSAPP_DELIVERY_CORRELATION_STATE_INVALID",
      "WhatsApp correlated delivery is not a confirmed send for the expected channel identity",
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
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      external_message_id: providerMessageId,
      phase: "sent",
      recipient_id: expectedRecipient,
      error_codes: [],
    },
  };
}
