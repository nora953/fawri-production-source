import crypto from "node:crypto";
import {
  assertWhatsAppSendResponseInputStructure,
  assertWhatsAppTextSendBuildInputStructure,
} from "./whatsappOfflineContractInputGuards";
import type {
  NormalizedWhatsAppMessageEvent,
} from "./whatsappWebhookContract";

export type WhatsAppChannelIdentity = {
  merchant_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number?: string;
};

export type WhatsAppInboundMessageJob = {
  job_type: "whatsapp_inbound_message";
  event_id: string;
  merchant_id: string;
  channel: "whatsapp";
  waba_id: string;
  phone_number_id: string;
  external_message_id: string;
  customer_id: string;
  customer_name?: string;
  message_kind: NormalizedWhatsAppMessageEvent["message_kind"];
  text?: string;
  provider_reference?: NormalizedWhatsAppMessageEvent["provider_reference"];
  reply_to_message_id?: string;
  provider_timestamp?: string;
};

export type WhatsAppTextSendPlan = {
  method: "POST";
  graph_version: string;
  path: string;
  body: {
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    type: "text";
    text: {
      preview_url: false;
      body: string;
    };
  };
};

export type WhatsAppSendOutcome =
  | {
      status: "sent";
      provider_message_id: string;
    }
  | {
      status: "confirmed_failed";
      code: string;
      http_status: number;
    }
  | {
      status: "uncertain";
      code: string;
      http_status?: number;
    };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function contractError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function merchantId(value: unknown): string {
  const result = text(value);
  if (!result || result.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(result)) {
    throw contractError(
      "WHATSAPP_MERCHANT_ID_INVALID",
      "WhatsApp merchant identity is invalid",
    );
  }
  return result;
}

function metaNumericId(value: unknown, label: string): string {
  const result = text(value);
  if (!/^\d{1,40}$/.test(result)) {
    throw contractError(
      "WHATSAPP_CHANNEL_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return result;
}

function displayPhoneNumber(value: unknown): string | undefined {
  const result = text(value);
  if (!result) return undefined;
  if (result.length > 40 || !/^[+0-9 ()-]+$/.test(result)) {
    throw contractError(
      "WHATSAPP_DISPLAY_NUMBER_INVALID",
      "WhatsApp display phone number is invalid",
    );
  }
  return result;
}

function recipient(value: unknown): string {
  const result = text(value).replace(/^\+/, "");
  if (!/^\d{6,20}$/.test(result)) {
    throw contractError(
      "WHATSAPP_RECIPIENT_INVALID",
      "WhatsApp recipient is invalid",
    );
  }
  return result;
}

function messageText(value: unknown): string {
  const result = text(value);
  if (
    !result ||
    result.length > 4_000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)
  ) {
    throw contractError(
      "WHATSAPP_MESSAGE_TEXT_INVALID",
      "WhatsApp message text is invalid",
    );
  }
  return result;
}

function graphVersion(value: unknown): string {
  const result = text(value);
  if (!/^v\d{1,3}\.\d{1,3}$/.test(result)) {
    throw contractError(
      "WHATSAPP_GRAPH_VERSION_INVALID",
      "WhatsApp Graph API version must be explicitly pinned",
    );
  }
  return result;
}

function providerMessageId(value: unknown): string | undefined {
  const result = text(value);
  if (!result || result.length > 512 || /[\r\n]/.test(result)) return undefined;
  return result;
}

export function normalizeWhatsAppChannelIdentity(input: {
  merchantId: unknown;
  wabaId: unknown;
  phoneNumberId: unknown;
  displayPhoneNumber?: unknown;
}): WhatsAppChannelIdentity {
  const identity: WhatsAppChannelIdentity = {
    merchant_id: merchantId(input.merchantId),
    waba_id: metaNumericId(input.wabaId, "WhatsApp business account id"),
    phone_number_id: metaNumericId(input.phoneNumberId, "WhatsApp phone number id"),
  };
  const display = displayPhoneNumber(input.displayPhoneNumber);
  if (display) identity.display_phone_number = display;
  return identity;
}

export function whatsAppChannelKey(identity: WhatsAppChannelIdentity): string {
  return crypto
    .createHash("sha256")
    .update(
      `${identity.merchant_id}:whatsapp:${identity.waba_id}:${identity.phone_number_id}`,
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * Converts a verified + normalized WhatsApp message into the shape that a
 * future durable-queue adapter can enqueue. This function does not enqueue,
 * persist, call Meta, or resolve a merchant from an external identifier.
 * Provider media/location references are retained only as bounded metadata;
 * no media download is performed here.
 */
export function buildWhatsAppInboundMessageJob(input: {
  identity: WhatsAppChannelIdentity;
  event: NormalizedWhatsAppMessageEvent;
}): WhatsAppInboundMessageJob {
  if (
    input.identity.waba_id !== input.event.waba_id ||
    input.identity.phone_number_id !== input.event.phone_number_id
  ) {
    throw contractError(
      "WHATSAPP_CHANNEL_MAPPING_MISMATCH",
      "WhatsApp event does not belong to the supplied merchant channel",
    );
  }
  return {
    job_type: "whatsapp_inbound_message",
    event_id: input.event.event_id,
    merchant_id: input.identity.merchant_id,
    channel: "whatsapp",
    waba_id: input.event.waba_id,
    phone_number_id: input.event.phone_number_id,
    external_message_id: input.event.external_message_id,
    customer_id: input.event.customer_id,
    ...(input.event.customer_name
      ? { customer_name: input.event.customer_name }
      : {}),
    message_kind: input.event.message_kind,
    ...(input.event.text ? { text: input.event.text } : {}),
    ...(input.event.provider_reference
      ? { provider_reference: structuredClone(input.event.provider_reference) }
      : {}),
    ...(input.event.reply_to_message_id
      ? { reply_to_message_id: input.event.reply_to_message_id }
      : {}),
    ...(input.event.timestamp
      ? { provider_timestamp: input.event.timestamp }
      : {}),
  };
}

/**
 * Produces an outbound Cloud API request plan without performing a network
 * request and without accepting an access token. The Graph API version is
 * deliberately mandatory so a stale implicit default cannot survive until
 * future activation. Newlines and tabs remain valid user-facing text, while
 * non-printing control bytes are rejected before the request can cross a future
 * provider boundary.
 */
export function buildWhatsAppTextSendPlan(input: {
  phoneNumberId: unknown;
  to: unknown;
  messageText: unknown;
  graphVersion: unknown;
}): WhatsAppTextSendPlan {
  assertWhatsAppTextSendBuildInputStructure(input);
  const phoneNumberId = metaNumericId(
    input.phoneNumberId,
    "WhatsApp phone number id",
  );
  const version = graphVersion(input.graphVersion);
  return {
    method: "POST",
    graph_version: version,
    path: `/${version}/${phoneNumberId}/messages`,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient(input.to),
      type: "text",
      text: {
        preview_url: false,
        body: messageText(input.messageText),
      },
    },
  };
}

function responseBody(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function providerFailureCode(body: Record<string, unknown>, status: number): string {
  const error = responseBody(body.error);
  const code = Number(error.code);
  const subcode = Number(error.error_subcode);
  const codePart = Number.isInteger(code) && code > 0 ? `_${code}` : "";
  const subcodePart =
    Number.isInteger(subcode) && subcode > 0 ? `_${subcode}` : "";
  return `WHATSAPP_GRAPH_HTTP_${status}${codePart}${subcodePart}`.slice(0, 160);
}

function confirmedFailure(status: number): boolean {
  return (
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 425 &&
    status !== 429
  );
}

/**
 * Classifies an already-observed provider response. It never performs I/O.
 * Ambiguous, throttled, timeout-like, malformed-success, and server responses
 * remain uncertain so future live code cannot blindly retry a send that may
 * have reached Meta.
 */
export function classifyWhatsAppSendResponse(input: {
  httpStatus: unknown;
  body: unknown;
}): WhatsAppSendOutcome {
  assertWhatsAppSendResponseInputStructure(input);
  const status = Number(input.httpStatus);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw contractError(
      "WHATSAPP_GRAPH_RESPONSE_INVALID",
      "WhatsApp Graph response status is invalid",
    );
  }
  const body = responseBody(input.body);
  const firstMessage = responseBody(list(body.messages)[0]);
  const messageId = providerMessageId(firstMessage.id);
  if (status >= 200 && status < 300 && messageId) {
    return { status: "sent", provider_message_id: messageId };
  }
  if (confirmedFailure(status)) {
    return {
      status: "confirmed_failed",
      code: providerFailureCode(body, status),
      http_status: status,
    };
  }
  return {
    status: "uncertain",
    code:
      status >= 200 && status < 300
        ? "WHATSAPP_GRAPH_SUCCESS_WITHOUT_MESSAGE_ID"
        : providerFailureCode(body, status),
    http_status: status,
  };
}
