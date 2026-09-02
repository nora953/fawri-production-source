import {
  reduceWhatsAppDeliveryStatus,
  type WhatsAppDeliveryReduction,
  type WhatsAppDeliveryState,
} from "./whatsappDeliveryLifecycle";
import type { WhatsAppDeliveryStatusPlan } from "./whatsappWebhookPlanner";
import type { NormalizedWhatsAppStatusEvent } from "./whatsappWebhookContract";

function reconciliationError(
  code: string,
  message: string,
): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizedStatusEvent(
  observation: WhatsAppDeliveryStatusPlan,
): NormalizedWhatsAppStatusEvent {
  const eventId = text(observation.event_id);
  const externalMessageId = text(observation.external_message_id);
  const status = text(observation.status).toLowerCase();
  if (!eventId || !externalMessageId || !status) {
    throw reconciliationError(
      "WHATSAPP_DELIVERY_OBSERVATION_INVALID",
      "WhatsApp delivery observation is incomplete",
    );
  }
  return {
    event_id: eventId,
    event_kind: "status",
    waba_id: observation.waba_id,
    phone_number_id: observation.phone_number_id,
    external_message_id: externalMessageId,
    ...(text(observation.recipient_id)
      ? { recipient_id: text(observation.recipient_id) }
      : {}),
    status,
    ...(text(observation.provider_timestamp)
      ? { timestamp: text(observation.provider_timestamp) }
      : {}),
    error_codes: [...new Set(observation.error_codes.map((code) => text(code)).filter(Boolean))],
  };
}

export type WhatsAppDeliveryReconciliationPlan = {
  boundary: "not_persisted";
  merchant_id: string;
  channel_id: string;
  delivery: WhatsAppDeliveryReduction;
};

/**
 * Reconciles a normalized webhook status observation against a local delivery
 * attempt without persisting either side. Tenant/channel ownership stays in the
 * observation and must match the caller-selected attempt before this function
 * is used; the reducer independently verifies WABA/phone/provider message id.
 */
export function planWhatsAppDeliveryReconciliation(input: {
  merchantId: unknown;
  channelId: unknown;
  state: WhatsAppDeliveryState;
  observation: WhatsAppDeliveryStatusPlan;
}): WhatsAppDeliveryReconciliationPlan {
  const merchantId = text(input.merchantId);
  const channelId = text(input.channelId);
  if (!merchantId || !channelId) {
    throw reconciliationError(
      "WHATSAPP_DELIVERY_OWNER_INVALID",
      "WhatsApp delivery owner is invalid",
    );
  }
  if (
    input.observation.merchant_id !== merchantId ||
    input.observation.channel_id !== channelId
  ) {
    throw reconciliationError(
      "WHATSAPP_DELIVERY_OWNER_MISMATCH",
      "WhatsApp delivery observation belongs to another merchant or channel",
    );
  }

  return {
    boundary: "not_persisted",
    merchant_id: merchantId,
    channel_id: channelId,
    delivery: reduceWhatsAppDeliveryStatus(
      input.state,
      normalizedStatusEvent(input.observation),
    ),
  };
}
