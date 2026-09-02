import crypto from "node:crypto";
import type { WhatsAppInboundMessageJob } from "./whatsappOfflineContracts";

export type WhatsAppInboundBridgeInput = WhatsAppInboundMessageJob & {
  channel_id: string;
};

export type ChannelInboundMessage = {
  event_id: string;
  merchant_id: string;
  channel_id: string;
  channel: "whatsapp";
  external_channel_id: string;
  external_message_id: string;
  customer_external_id: string;
  customer_name?: string;
  message_kind: WhatsAppInboundMessageJob["message_kind"];
  text?: string;
  reply_to_message_id?: string;
  provider_timestamp?: string;
  routing: {
    waba_id: string;
    phone_number_id: string;
  };
  conversation_key: string;
  inbound_event_key: string;
};

export type WhatsAppInboundDisposition =
  | {
      action: "eligible_for_reply_engine";
      reason: "text_ready";
    }
  | {
      action: "manual_or_future_media";
      reason: "unsupported_media_or_nontext";
    }
  | {
      action: "manual_or_future_media";
      reason: "missing_normalized_text";
    }
  | {
      action: "manual_or_future_media";
      reason: "reply_engine_text_limit_exceeded";
    };

export type WhatsAppInboundBridgeResult = {
  message: ChannelInboundMessage;
  disposition: WhatsAppInboundDisposition;
};

function bridgeError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function required(value: unknown, label: string, max = 512): string {
  const normalized = text(value);
  if (!normalized || normalized.length > max || /[\r\n]/.test(normalized)) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function numeric(value: unknown, label: string): string {
  const normalized = text(value);
  if (!/^\d{1,40}$/.test(normalized)) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function hash(parts: string[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 40);
}

function disposition(
  kind: WhatsAppInboundMessageJob["message_kind"],
  normalizedText: string,
): WhatsAppInboundDisposition {
  if (kind !== "text" && kind !== "button" && kind !== "interactive") {
    return {
      action: "manual_or_future_media",
      reason: "unsupported_media_or_nontext",
    };
  }
  if (!normalizedText) {
    return {
      action: "manual_or_future_media",
      reason: "missing_normalized_text",
    };
  }
  if (normalizedText.length > 2_000) {
    return {
      action: "manual_or_future_media",
      reason: "reply_engine_text_limit_exceeded",
    };
  }
  return { action: "eligible_for_reply_engine", reason: "text_ready" };
}

/**
 * Converts a WhatsApp-specific queue contract into a channel-neutral inbound
 * message that future conversation/reply code can consume. This bridge is pure:
 * it does not create conversations, call AI, fetch media, enqueue work, or talk
 * to Meta. Non-text/media messages remain explicitly ineligible for automatic
 * reply processing until a separate verified media pipeline exists.
 */
export function bridgeWhatsAppInboundMessage(
  job: WhatsAppInboundBridgeInput,
): WhatsAppInboundBridgeResult {
  if (job.job_type !== "whatsapp_inbound_message" || job.channel !== "whatsapp") {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_JOB_INVALID",
      "WhatsApp inbound job type is invalid",
    );
  }

  const eventId = required(job.event_id, "WhatsApp event id");
  const merchantId = required(job.merchant_id, "merchant id", 200);
  const channelId = required(job.channel_id, "channel id", 200);
  const wabaId = numeric(job.waba_id, "WhatsApp business account id");
  const phoneNumberId = numeric(job.phone_number_id, "WhatsApp phone number id");
  const externalMessageId = required(
    job.external_message_id,
    "WhatsApp message id",
  );
  const customerId = required(job.customer_id, "WhatsApp customer id", 200);
  const normalizedText = text(job.text);
  if (job.text !== undefined && normalizedText.length > 4_000) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_TEXT_INVALID",
      "WhatsApp normalized message text is invalid",
    );
  }

  const message: ChannelInboundMessage = {
    event_id: eventId,
    merchant_id: merchantId,
    channel_id: channelId,
    channel: "whatsapp",
    external_channel_id: phoneNumberId,
    external_message_id: externalMessageId,
    customer_external_id: customerId,
    ...(text(job.customer_name)
      ? { customer_name: text(job.customer_name).slice(0, 300) }
      : {}),
    message_kind: job.message_kind,
    ...(normalizedText ? { text: normalizedText } : {}),
    ...(text(job.reply_to_message_id)
      ? { reply_to_message_id: required(job.reply_to_message_id, "reply message id") }
      : {}),
    ...(text(job.provider_timestamp)
      ? { provider_timestamp: text(job.provider_timestamp) }
      : {}),
    routing: {
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
    },
    conversation_key: `whatsapp-conversation-${hash([
      merchantId,
      channelId,
      customerId,
    ])}`,
    inbound_event_key: `whatsapp-inbound-${hash([
      merchantId,
      channelId,
      eventId,
      externalMessageId,
    ])}`,
  };

  return {
    message,
    disposition: disposition(job.message_kind, normalizedText),
  };
}
