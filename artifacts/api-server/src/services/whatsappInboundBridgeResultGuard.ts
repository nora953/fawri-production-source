import crypto from "node:crypto";
import { types as utilTypes } from "node:util";
import type {
  WhatsAppInboundBridgeResult,
  WhatsAppInboundDisposition,
} from "./whatsappInboundBridge";

const MESSAGE_KINDS = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
  "reaction",
  "button",
  "interactive",
  "unknown",
]);
const MEDIA_KINDS = new Set(["image", "audio", "video", "document", "sticker"]);

function guardError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_INBOUND_BRIDGE_RESULT_SHAPE_INVALID",
  });
}

function fail(message: string): never {
  throw guardError(message);
}

function plainRecord(
  value: unknown,
  label: string,
  allowed: readonly string[],
): Record<string, unknown> {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      fail(`${label} must be a plain object`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail(`${label} cannot contain symbol properties`);
    }
    const names = Object.getOwnPropertyNames(value);
    const keys = Object.keys(value);
    if (names.length !== keys.length) {
      fail(`${label} cannot contain hidden properties`);
    }
    const allowedSet = new Set(allowed);
    for (const key of keys) {
      if (!allowedSet.has(key)) fail(`${label} contains unsupported property ${key}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(`${label} must contain enumerable data properties only`);
      }
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (
      (error as { code?: string })?.code ===
      "WHATSAPP_INBOUND_BRIDGE_RESULT_SHAPE_INVALID"
    ) {
      throw error;
    }
    fail(`${label} could not be inspected safely`);
  }
}

function onlyKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) fail(`${label} contains unsupported property ${key}`);
  }
}

function data(
  record: Record<string, unknown>,
  key: string,
  required = true,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    if (required) fail(`required ${key} property is missing`);
    return undefined;
  }
  if (!("value" in descriptor) || !descriptor.enumerable) {
    fail(`${key} must be an enumerable data property`);
  }
  return descriptor.value;
}

function stringValue(
  value: unknown,
  label: string,
  max: number,
  required = true,
): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.length > max) {
    fail(`${label} must be a bounded string`);
  }
  if (required && value.length === 0) fail(`${label} cannot be empty`);
  return value;
}

function singleLineString(
  value: unknown,
  label: string,
  max: number,
  pattern?: RegExp,
  required = true,
): string | undefined {
  const result = stringValue(value, label, max, required);
  if (result === undefined) return undefined;
  if (/[\u0000-\u001F\u007F]/.test(result)) {
    fail(`${label} contains unsafe control bytes`);
  }
  if (pattern && !pattern.test(result)) fail(`${label} has an invalid format`);
  return result;
}

function humanString(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string | undefined {
  const result = stringValue(value, label, max, required);
  if (result === undefined) return undefined;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)) {
    fail(`${label} contains unsafe control bytes`);
  }
  return result;
}

function booleanValue(value: unknown, label: string, required = false): void {
  if (value === undefined && !required) return;
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function hash(parts: string[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 40);
}

function inspectProviderReference(value: unknown, messageKind: string): void {
  if (value === undefined) return;
  const base = plainRecord(value, "WhatsApp bridge provider reference", [
    "kind",
    "media_kind",
    "id",
    "mime_type",
    "sha256",
    "caption",
    "filename",
    "voice",
    "animated",
    "latitude",
    "longitude",
    "name",
    "address",
    "message_id",
    "emoji",
    "count",
  ]);
  const kind = singleLineString(
    data(base, "kind"),
    "provider reference kind",
    32,
  )!;

  if (kind === "media") {
    onlyKeys(
      base,
      [
        "kind",
        "media_kind",
        "id",
        "mime_type",
        "sha256",
        "caption",
        "filename",
        "voice",
        "animated",
      ],
      "media reference",
    );
    const mediaKind = singleLineString(
      data(base, "media_kind"),
      "media kind",
      32,
    )!;
    if (!MEDIA_KINDS.has(mediaKind) || mediaKind !== messageKind) {
      fail("media reference does not match the bridge message kind");
    }
    singleLineString(data(base, "id"), "media id", 160);
    singleLineString(
      data(base, "mime_type", false),
      "media mime type",
      160,
      undefined,
      false,
    );
    singleLineString(
      data(base, "sha256", false),
      "media sha256",
      256,
      undefined,
      false,
    );
    humanString(data(base, "caption", false), "media caption", 1_024);
    singleLineString(
      data(base, "filename", false),
      "media filename",
      512,
      undefined,
      false,
    );
    booleanValue(data(base, "voice", false), "media voice flag");
    booleanValue(data(base, "animated", false), "media animated flag");
    return;
  }

  if (kind === "location") {
    onlyKeys(base, ["kind", "latitude", "longitude", "name", "address"], "location reference");
    if (messageKind !== "location") fail("location reference does not match message kind");
    const latitude = numberValue(data(base, "latitude"), "location latitude");
    const longitude = numberValue(data(base, "longitude"), "location longitude");
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      fail("location coordinates are outside their valid range");
    }
    singleLineString(
      data(base, "name", false),
      "location name",
      300,
      undefined,
      false,
    );
    humanString(data(base, "address", false), "location address", 1_000);
    return;
  }

  if (kind === "reaction") {
    onlyKeys(base, ["kind", "message_id", "emoji"], "reaction reference");
    if (messageKind !== "reaction") fail("reaction reference does not match message kind");
    singleLineString(data(base, "message_id"), "reaction message id", 512);
    singleLineString(
      data(base, "emoji", false),
      "reaction emoji",
      32,
      undefined,
      false,
    );
    return;
  }

  if (kind === "contacts") {
    onlyKeys(base, ["kind", "count"], "contacts reference");
    if (messageKind !== "contacts") fail("contacts reference does not match message kind");
    const count = data(base, "count");
    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 1_000
    ) {
      fail("contacts reference count is invalid");
    }
    return;
  }

  fail("WhatsApp bridge provider reference kind is invalid");
}

function expectedDisposition(
  messageKind: string,
  messageText: string | undefined,
): WhatsAppInboundDisposition {
  if (
    messageKind !== "text" &&
    messageKind !== "button" &&
    messageKind !== "interactive"
  ) {
    return {
      action: "manual_or_future_media",
      reason: "unsupported_media_or_nontext",
    };
  }
  const normalized = messageText?.trim() || "";
  if (!normalized) {
    return {
      action: "manual_or_future_media",
      reason: "missing_normalized_text",
    };
  }
  if (normalized.length > 2_000) {
    return {
      action: "manual_or_future_media",
      reason: "reply_engine_text_limit_exceeded",
    };
  }
  return { action: "eligible_for_reply_engine", reason: "text_ready" };
}

/**
 * Validates a bridge result before direct persistence/decision consumers touch
 * it. Proxies, getters, hidden/symbol properties, unexpected fields, malformed
 * nested provider references, and forged deterministic identities fail before
 * downstream String/clone operations. Provider/local/customer identities are
 * revalidated here because the reply-decision consumer otherwise has no later
 * identity boundary. Human message-text control semantics remain owned by the
 * persistence/decision functions so their established text error codes remain
 * authoritative.
 */
export function assertWhatsAppInboundBridgeResultRuntime(
  value: unknown,
): asserts value is WhatsAppInboundBridgeResult {
  const root = plainRecord(value, "WhatsApp inbound bridge result", [
    "message",
    "disposition",
  ]);
  const message = plainRecord(data(root, "message"), "WhatsApp bridge message", [
    "event_id",
    "merchant_id",
    "channel_id",
    "channel",
    "external_channel_id",
    "external_message_id",
    "customer_external_id",
    "customer_name",
    "message_kind",
    "text",
    "provider_reference",
    "reply_to_message_id",
    "provider_timestamp",
    "routing",
    "conversation_key",
    "inbound_event_key",
  ]);
  const disposition = plainRecord(
    data(root, "disposition"),
    "WhatsApp bridge disposition",
    ["action", "reason"],
  );
  const routing = plainRecord(data(message, "routing"), "WhatsApp bridge routing", [
    "waba_id",
    "phone_number_id",
  ]);

  const eventId = singleLineString(data(message, "event_id"), "event id", 512)!;
  const merchantId = singleLineString(
    data(message, "merchant_id"),
    "merchant id",
    200,
    /^[A-Za-z0-9._:-]+$/,
  )!;
  const channelId = singleLineString(
    data(message, "channel_id"),
    "channel id",
    200,
    /^[A-Za-z0-9._:-]+$/,
  )!;
  const channel = singleLineString(data(message, "channel"), "channel", 32)!;
  if (channel !== "whatsapp") fail("bridge channel must be whatsapp");
  const externalChannelId = singleLineString(
    data(message, "external_channel_id"),
    "external channel id",
    40,
    /^\d{1,40}$/,
  )!;
  const externalMessageId = singleLineString(
    data(message, "external_message_id"),
    "external message id",
    512,
  )!;
  const customerExternalId = singleLineString(
    data(message, "customer_external_id"),
    "customer external id",
    20,
    /^\d{6,20}$/,
  )!;
  singleLineString(
    data(message, "customer_name", false),
    "customer name",
    300,
    undefined,
    false,
  );
  const messageKind = singleLineString(
    data(message, "message_kind"),
    "message kind",
    32,
  )!;
  if (!MESSAGE_KINDS.has(messageKind)) fail("bridge message kind is invalid");

  // Message text is type/length checked here but control semantics remain the
  // responsibility of the persistence/decision boundary to preserve its error.
  const messageText = stringValue(
    data(message, "text", false),
    "message text",
    4_000,
    false,
  );
  singleLineString(
    data(message, "reply_to_message_id", false),
    "reply message id",
    512,
    undefined,
    false,
  );
  singleLineString(
    data(message, "provider_timestamp", false),
    "provider timestamp",
    20,
    /^\d{1,20}$/,
    false,
  );
  inspectProviderReference(data(message, "provider_reference", false), messageKind);

  const wabaId = singleLineString(
    data(routing, "waba_id"),
    "WABA id",
    40,
    /^\d{1,40}$/,
  )!;
  const phoneNumberId = singleLineString(
    data(routing, "phone_number_id"),
    "phone-number id",
    40,
    /^\d{1,40}$/,
  )!;
  if (externalChannelId !== phoneNumberId) {
    fail("bridge external channel does not match routing phone-number id");
  }

  const conversationKey = singleLineString(
    data(message, "conversation_key"),
    "conversation key",
    200,
    /^whatsapp-conversation-[a-f0-9]{40}$/,
  )!;
  const inboundEventKey = singleLineString(
    data(message, "inbound_event_key"),
    "inbound event key",
    200,
    /^whatsapp-inbound-[a-f0-9]{40}$/,
  )!;
  const expectedConversationKey = `whatsapp-conversation-${hash([
    merchantId,
    channelId,
    customerExternalId,
  ])}`;
  const expectedInboundEventKey = `whatsapp-inbound-${hash([
    merchantId,
    channelId,
    eventId,
    externalMessageId,
  ])}`;
  if (
    conversationKey !== expectedConversationKey ||
    inboundEventKey !== expectedInboundEventKey
  ) {
    fail("bridge deterministic identity keys do not match their source identities");
  }

  const action = singleLineString(
    data(disposition, "action"),
    "disposition action",
    64,
  )!;
  const reason = singleLineString(
    data(disposition, "reason"),
    "disposition reason",
    80,
  )!;
  const expected = expectedDisposition(messageKind, messageText);
  if (action !== expected.action || reason !== expected.reason) {
    fail("bridge disposition is inconsistent with the normalized message");
  }

  // Keep WABA identity included in integrity inspection even though the
  // deterministic local conversation key intentionally uses channel/customer.
  if (!wabaId) fail("bridge WABA identity is missing");
}
