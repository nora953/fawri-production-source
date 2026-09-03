import crypto from "node:crypto";
import type { WhatsAppInboundMessageJob } from "./whatsappOfflineContracts";
import type { WhatsAppMessageProviderReference } from "./whatsappWebhookContract";

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
  provider_reference?: WhatsAppMessageProviderReference;
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

function providerId(value: unknown, label: string, max = 512): string {
  const normalized = text(value);
  if (
    !normalized ||
    normalized.length > max ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function localIdentity(value: unknown, label: string, max = 200): string {
  const normalized = text(value);
  if (
    !normalized ||
    normalized.length > max ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function optionalBounded(
  value: unknown,
  max: number,
  options: { allowNewlines?: boolean } = {},
): string | undefined {
  const normalized = text(value);
  if (!normalized) return undefined;
  if (
    normalized.length > max ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized) ||
    (!options.allowNewlines && /[\r\n]/.test(normalized))
  ) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
      "WhatsApp provider reference metadata is invalid",
    );
  }
  return normalized;
}

function numeric(value: unknown, label: string, min = 1, max = 40): string {
  const normalized = text(value);
  const expression = new RegExp(`^\\d{${min},${max}}$`);
  if (!expression.test(normalized)) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function providerTimestamp(value: unknown): string | undefined {
  const normalized = text(value);
  if (!normalized) return undefined;
  if (!/^\d{1,20}$/.test(normalized)) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_TIMESTAMP_INVALID",
      "WhatsApp provider timestamp is invalid",
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

function providerReference(
  kind: WhatsAppInboundMessageJob["message_kind"],
  value: WhatsAppInboundMessageJob["provider_reference"],
): WhatsAppMessageProviderReference | undefined {
  if (!value) return undefined;

  if (value.kind === "media") {
    if (
      kind !== value.media_kind ||
      !["image", "audio", "video", "document", "sticker"].includes(kind)
    ) {
      throw bridgeError(
        "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
        "WhatsApp media reference does not match the message kind",
      );
    }
    const id = providerId(value.id, "WhatsApp media id", 160);
    const mimeType = optionalBounded(value.mime_type, 160);
    const sha256 = optionalBounded(value.sha256, 256);
    const caption = optionalBounded(value.caption, 1_024, { allowNewlines: true });
    const filename = optionalBounded(value.filename, 512);
    return {
      kind: "media",
      media_kind: value.media_kind,
      id,
      ...(mimeType ? { mime_type: mimeType } : {}),
      ...(sha256 ? { sha256 } : {}),
      ...(caption ? { caption } : {}),
      ...(filename ? { filename } : {}),
      ...(value.media_kind === "audio" && typeof value.voice === "boolean"
        ? { voice: value.voice }
        : {}),
      ...(value.media_kind === "sticker" && typeof value.animated === "boolean"
        ? { animated: value.animated }
        : {}),
    };
  }

  if (value.kind === "location") {
    if (kind !== "location") {
      throw bridgeError(
        "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
        "WhatsApp location reference does not match the message kind",
      );
    }
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw bridgeError(
        "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
        "WhatsApp location reference is invalid",
      );
    }
    const name = optionalBounded(value.name, 300);
    const address = optionalBounded(value.address, 1_000, { allowNewlines: true });
    return {
      kind: "location",
      latitude,
      longitude,
      ...(name ? { name } : {}),
      ...(address ? { address } : {}),
    };
  }

  if (value.kind === "reaction") {
    if (kind !== "reaction") {
      throw bridgeError(
        "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
        "WhatsApp reaction reference does not match the message kind",
      );
    }
    const messageId = providerId(
      value.message_id,
      "WhatsApp reaction message id",
      512,
    );
    const emoji = optionalBounded(value.emoji, 32);
    return {
      kind: "reaction",
      message_id: messageId,
      ...(emoji ? { emoji } : {}),
    };
  }

  if (value.kind === "contacts") {
    if (
      kind !== "contacts" ||
      !Number.isSafeInteger(value.count) ||
      value.count < 1 ||
      value.count > 1_000
    ) {
      throw bridgeError(
        "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
        "WhatsApp contacts reference is invalid",
      );
    }
    return { kind: "contacts", count: value.count };
  }

  throw bridgeError(
    "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
    "WhatsApp provider reference is invalid",
  );
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

  const eventId = providerId(job.event_id, "WhatsApp event id");
  const merchantId = localIdentity(job.merchant_id, "merchant id");
  const channelId = localIdentity(job.channel_id, "channel id");
  const wabaId = numeric(job.waba_id, "WhatsApp business account id");
  const phoneNumberId = numeric(job.phone_number_id, "WhatsApp phone number id");
  const externalMessageId = providerId(
    job.external_message_id,
    "WhatsApp message id",
  );
  const customerId = numeric(job.customer_id, "WhatsApp customer id", 6, 20);
  const normalizedText = text(job.text);
  if (job.text !== undefined && normalizedText.length > 4_000) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_TEXT_INVALID",
      "WhatsApp normalized message text is invalid",
    );
  }
  const reference = providerReference(job.message_kind, job.provider_reference);
  const timestamp = providerTimestamp(job.provider_timestamp);
  const customerName = text(job.customer_name);
  if (customerName.length > 300) {
    throw bridgeError(
      "WHATSAPP_INBOUND_BRIDGE_CUSTOMER_NAME_INVALID",
      "WhatsApp customer name is too long",
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
    ...(customerName ? { customer_name: customerName } : {}),
    message_kind: job.message_kind,
    ...(normalizedText ? { text: normalizedText } : {}),
    ...(reference ? { provider_reference: reference } : {}),
    ...(text(job.reply_to_message_id)
      ? {
          reply_to_message_id: providerId(
            job.reply_to_message_id,
            "reply message id",
          ),
        }
      : {}),
    ...(timestamp ? { provider_timestamp: timestamp } : {}),
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
