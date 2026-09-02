import type {
  ChannelInboundMessage,
  WhatsAppInboundBridgeResult,
} from "./whatsappInboundBridge";
import type { WhatsAppMessageProviderReference } from "./whatsappWebhookContract";

export type PlannedWhatsAppConversationRecord = {
  id: string;
  merchant_id: string;
  channel_id: string;
  external_conversation_id: string;
  customer_external_id: string;
  customer_name?: string;
  status: "auto_replying" | "needs_reply";
  assigned_to_human: false;
  needs_training: false;
};

export type PlannedWhatsAppInboundMessageRecord = {
  id: string;
  merchant_id: string;
  conversation_id: string;
  external_message_id: string;
  external_event_id: string;
  sender: "customer";
  text: string;
  status: "received";
  counted_as_auto_reply: false;
  metadata: {
    channel: "whatsapp";
    message_kind: ChannelInboundMessage["message_kind"];
    auto_reply_eligible: boolean;
    disposition_reason: string;
    provider_timestamp?: string;
    reply_to_external_message_id?: string;
    provider_reference?: WhatsAppMessageProviderReference;
  };
};

export type WhatsAppConversationPersistencePlan = {
  boundary: "not_persisted";
  provider: "whatsapp";
  transaction_required: true;
  collision_checks_required: true;
  expected_inbound_external_event_id: string;
  conversation: PlannedWhatsAppConversationRecord;
  message: PlannedWhatsAppInboundMessageRecord;
};

function persistenceError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function bounded(value: unknown, max: number, label: string): string {
  const normalized = text(value);
  if (!normalized || normalized.length > max || /[\r\n]/.test(normalized)) {
    throw persistenceError(
      "WHATSAPP_CONVERSATION_PERSISTENCE_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function customerDisplayText(message: ChannelInboundMessage): string {
  const normalizedText = text(message.text);
  if (normalizedText) return normalizedText;

  const reference = message.provider_reference;
  if (reference?.kind === "media" && text(reference.caption)) {
    return text(reference.caption).slice(0, 4_000);
  }
  if (reference?.kind === "reaction" && text(reference.emoji)) {
    return `[WhatsApp reaction ${text(reference.emoji).slice(0, 32)}]`;
  }

  switch (message.message_kind) {
    case "image":
      return "[WhatsApp image]";
    case "audio":
      return "[WhatsApp audio]";
    case "video":
      return "[WhatsApp video]";
    case "document":
      return "[WhatsApp document]";
    case "sticker":
      return "[WhatsApp sticker]";
    case "location":
      return "[WhatsApp location]";
    case "contacts":
      return "[WhatsApp contacts]";
    case "reaction":
      return "[WhatsApp reaction]";
    case "button":
      return "[WhatsApp button]";
    case "interactive":
      return "[WhatsApp interactive message]";
    case "text":
      return "[WhatsApp empty text message]";
    default:
      return "[WhatsApp unsupported message]";
  }
}

/**
 * Produces the shared `conversations` + `messages` write shape for a verified
 * WhatsApp inbound job. It intentionally performs no SQL and requires a future
 * adapter to commit both records transactionally after verifying the matching
 * `channel_inbound_events` marker. Existing unique constraints remain the final
 * authority for idempotency/collision handling.
 */
export function buildWhatsAppConversationPersistencePlan(
  input: WhatsAppInboundBridgeResult,
): WhatsAppConversationPersistencePlan {
  const message = input.message;
  if (message.channel !== "whatsapp") {
    throw persistenceError(
      "WHATSAPP_CONVERSATION_PERSISTENCE_CHANNEL_INVALID",
      "WhatsApp conversation persistence received a non-WhatsApp message",
    );
  }

  const merchantId = bounded(message.merchant_id, 200, "merchant id");
  const channelId = bounded(message.channel_id, 200, "channel id");
  const eventId = bounded(message.event_id, 512, "event id");
  const externalMessageId = bounded(
    message.external_message_id,
    512,
    "external message id",
  );
  const customerExternalId = bounded(
    message.customer_external_id,
    200,
    "customer external id",
  );
  const conversationId = bounded(
    message.conversation_key,
    200,
    "conversation key",
  );
  const inboundMessageId = bounded(
    message.inbound_event_key,
    200,
    "inbound message key",
  );

  const eligible = input.disposition.action === "eligible_for_reply_engine";
  const customerName = text(message.customer_name).slice(0, 300);
  const providerTimestamp = text(message.provider_timestamp);
  if (providerTimestamp && !/^\d{1,20}$/.test(providerTimestamp)) {
    throw persistenceError(
      "WHATSAPP_CONVERSATION_PERSISTENCE_TIMESTAMP_INVALID",
      "WhatsApp provider timestamp is invalid",
    );
  }

  const replyToExternalMessageId = text(message.reply_to_message_id);
  if (
    replyToExternalMessageId &&
    (replyToExternalMessageId.length > 512 || /[\r\n]/.test(replyToExternalMessageId))
  ) {
    throw persistenceError(
      "WHATSAPP_CONVERSATION_PERSISTENCE_REPLY_REFERENCE_INVALID",
      "WhatsApp reply reference is invalid",
    );
  }

  const persistedText = customerDisplayText(message);
  if (!persistedText || persistedText.length > 4_000) {
    throw persistenceError(
      "WHATSAPP_CONVERSATION_PERSISTENCE_TEXT_INVALID",
      "WhatsApp customer message text is invalid for persistence",
    );
  }

  return {
    boundary: "not_persisted",
    provider: "whatsapp",
    transaction_required: true,
    collision_checks_required: true,
    expected_inbound_external_event_id: eventId,
    conversation: {
      id: conversationId,
      merchant_id: merchantId,
      channel_id: channelId,
      external_conversation_id: conversationId,
      customer_external_id: customerExternalId,
      ...(customerName ? { customer_name: customerName } : {}),
      status: eligible ? "auto_replying" : "needs_reply",
      assigned_to_human: false,
      needs_training: false,
    },
    message: {
      id: inboundMessageId,
      merchant_id: merchantId,
      conversation_id: conversationId,
      external_message_id: externalMessageId,
      external_event_id: eventId,
      sender: "customer",
      text: persistedText,
      status: "received",
      counted_as_auto_reply: false,
      metadata: {
        channel: "whatsapp",
        message_kind: message.message_kind,
        auto_reply_eligible: eligible,
        disposition_reason: input.disposition.reason,
        ...(providerTimestamp ? { provider_timestamp: providerTimestamp } : {}),
        ...(replyToExternalMessageId
          ? { reply_to_external_message_id: replyToExternalMessageId }
          : {}),
        ...(message.provider_reference
          ? { provider_reference: structuredClone(message.provider_reference) }
          : {}),
      },
    },
  };
}
