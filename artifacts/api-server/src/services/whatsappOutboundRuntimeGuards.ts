import { types as utilTypes } from "node:util";
import type { WhatsAppOutboundAttemptPlan } from "./whatsappOutboundAttempt";
import type { WhatsAppTextSendPlan } from "./whatsappOfflineContracts";
import type { ResolvedDormantWhatsAppChannel } from "./whatsappDormantChannelResolver";

function shapeError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_OUTBOUND_SHAPE_INVALID",
  });
}

function fail(message: string): never {
  throw shapeError(message);
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
    if ((error as { code?: string })?.code === "WHATSAPP_OUTBOUND_SHAPE_INVALID") {
      throw error;
    }
    fail(`${label} could not be inspected safely`);
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

function stringType(
  value: unknown,
  label: string,
  max: number,
  required = true,
): void {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || value.length > max) {
    fail(`${label} must be a bounded string`);
  }
}

function numberType(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
}

function booleanType(value: unknown, label: string): void {
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
}

/**
 * Structural-only request guard. Semantic request/channel validation remains in
 * whatsappOutboundAttempt.ts so existing mismatch/error codes remain stable.
 * The guard exists to stop proxies/accessors/non-scalar values before stable
 * hashing, cloning, or direct nested access.
 */
export function assertWhatsAppTextSendPlanStructure(
  value: unknown,
): asserts value is WhatsAppTextSendPlan {
  const request = plainRecord(value, "WhatsApp text send plan", [
    "method",
    "graph_version",
    "path",
    "body",
  ]);
  stringType(data(request, "method"), "request method", 16);
  stringType(data(request, "graph_version"), "Graph API version", 32);
  stringType(data(request, "path"), "request path", 512);

  const body = plainRecord(data(request, "body"), "WhatsApp text request body", [
    "messaging_product",
    "recipient_type",
    "to",
    "type",
    "text",
  ]);
  stringType(data(body, "messaging_product"), "messaging product", 32);
  stringType(data(body, "recipient_type"), "recipient type", 32);
  stringType(data(body, "to"), "recipient", 64);
  stringType(data(body, "type"), "message type", 32);

  const text = plainRecord(data(body, "text"), "WhatsApp text body", [
    "preview_url",
    "body",
  ]);
  booleanType(data(text, "preview_url"), "preview URL flag");
  // Bound above the semantic 4,000-character contract so ordinary invalid
  // lengths still reach the established request-mismatch authority.
  stringType(data(text, "body"), "message text", 8_192);
}

function assertDormantChannelStructure(
  value: unknown,
): asserts value is ResolvedDormantWhatsAppChannel {
  const channel = plainRecord(value, "resolved dormant WhatsApp channel", [
    "id",
    "merchant_id",
    "platform",
    "status",
    "version",
    "waba_id",
    "phone_number_id",
    "display_phone_number",
    "integration_mode",
  ]);
  stringType(data(channel, "id"), "channel id", 512);
  stringType(data(channel, "merchant_id"), "merchant id", 512);
  stringType(data(channel, "platform"), "channel platform", 32);
  stringType(data(channel, "status"), "channel status", 32);
  numberType(data(channel, "version"), "channel version");
  stringType(data(channel, "waba_id"), "WABA id", 64);
  stringType(data(channel, "phone_number_id"), "phone-number id", 64);
  stringType(
    data(channel, "display_phone_number", false),
    "display phone number",
    80,
    false,
  );
  stringType(data(channel, "integration_mode"), "integration mode", 64);
}

export function assertWhatsAppOutboundAttemptCreateInputStructure(value: unknown): void {
  const input = plainRecord(value, "WhatsApp outbound attempt input", [
    "merchantId",
    "replyIntentId",
    "attemptNumber",
    "channel",
    "request",
  ]);
  stringType(data(input, "merchantId"), "merchant id", 512);
  stringType(data(input, "replyIntentId"), "reply intent id", 512);
  numberType(data(input, "attemptNumber"), "attempt number");
  assertDormantChannelStructure(data(input, "channel"));
  assertWhatsAppTextSendPlanStructure(data(input, "request"));
}

export function assertWhatsAppOutboundAttemptPlanStructure(
  value: unknown,
): asserts value is WhatsAppOutboundAttemptPlan {
  const attempt = plainRecord(value, "WhatsApp outbound attempt plan", [
    "boundary",
    "logical_send_id",
    "attempt_id",
    "dedupe_key",
    "attempt_number",
    "merchant_id",
    "channel_id",
    "phone_number_id",
    "reply_intent_id",
    "request_sha256",
    "recipient_hash",
    "request",
    "transport_authorized",
  ]);
  stringType(data(attempt, "boundary"), "attempt boundary", 32);
  stringType(data(attempt, "logical_send_id"), "logical send id", 200);
  stringType(data(attempt, "attempt_id"), "attempt id", 200);
  stringType(data(attempt, "dedupe_key"), "attempt dedupe key", 256);
  numberType(data(attempt, "attempt_number"), "attempt number");
  stringType(data(attempt, "merchant_id"), "merchant id", 512);
  stringType(data(attempt, "channel_id"), "channel id", 512);
  stringType(data(attempt, "phone_number_id"), "phone-number id", 64);
  stringType(data(attempt, "reply_intent_id"), "reply intent id", 512);
  stringType(data(attempt, "request_sha256"), "request hash", 128);
  stringType(data(attempt, "recipient_hash"), "recipient hash", 128);
  assertWhatsAppTextSendPlanStructure(data(attempt, "request"));
  booleanType(data(attempt, "transport_authorized"), "transport authorization flag");
}
