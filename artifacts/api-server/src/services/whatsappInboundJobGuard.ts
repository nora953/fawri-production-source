import { types as utilTypes } from "node:util";
import type { WhatsAppInboundBridgeInput } from "./whatsappInboundBridge";

function guardError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_INBOUND_JOB_SHAPE_INVALID",
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
    if ((error as { code?: string })?.code === "WHATSAPP_INBOUND_JOB_SHAPE_INVALID") {
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
    if (required) fail(`required property ${key} is missing`);
    return undefined;
  }
  if (!("value" in descriptor) || !descriptor.enumerable) {
    fail(`${key} must be an enumerable data property`);
  }
  return descriptor.value;
}

function stringType(value: unknown, label: string, required = true): void {
  if (value === undefined && !required) return;
  if (typeof value !== "string") fail(`${label} must be a string`);
}

function booleanType(value: unknown, label: string, required = false): void {
  if (value === undefined && !required) return;
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
}

function numberType(value: unknown, label: string): void {
  if (typeof value !== "number") fail(`${label} must be a number`);
}

function inspectProviderReference(value: unknown): void {
  if (value === undefined) return;
  const reference = plainRecord(value, "WhatsApp inbound provider reference", [
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
  const kind = data(reference, "kind");
  stringType(kind, "provider reference kind");

  if (kind === "media") {
    stringType(data(reference, "media_kind"), "media kind");
    stringType(data(reference, "id"), "media id");
    stringType(data(reference, "mime_type", false), "media mime type", false);
    stringType(data(reference, "sha256", false), "media sha256", false);
    stringType(data(reference, "caption", false), "media caption", false);
    stringType(data(reference, "filename", false), "media filename", false);
    booleanType(data(reference, "voice", false), "media voice flag");
    booleanType(data(reference, "animated", false), "media animated flag");
    return;
  }

  if (kind === "location") {
    numberType(data(reference, "latitude"), "location latitude");
    numberType(data(reference, "longitude"), "location longitude");
    stringType(data(reference, "name", false), "location name", false);
    stringType(data(reference, "address", false), "location address", false);
    return;
  }

  if (kind === "reaction") {
    stringType(data(reference, "message_id"), "reaction message id");
    stringType(data(reference, "emoji", false), "reaction emoji", false);
    return;
  }

  if (kind === "contacts") {
    numberType(data(reference, "count"), "contacts count");
    return;
  }

  // Unknown reference kinds remain semantic errors owned by the bridge itself.
}

/**
 * Coercion-free structural guard for direct queue-job callers of the inbound
 * bridge. It rejects proxies/accessors/hidden data and requires primitive field
 * types before the bridge performs String/Number normalization. It intentionally
 * does not duplicate semantic identity/reference validation, preserving the
 * bridge's established fail-closed error codes for malformed but structurally
 * safe values.
 */
export function assertWhatsAppInboundBridgeInputStructure(
  value: unknown,
): asserts value is WhatsAppInboundBridgeInput {
  const job = plainRecord(value, "WhatsApp inbound bridge job", [
    "job_type",
    "event_id",
    "merchant_id",
    "channel_id",
    "channel",
    "waba_id",
    "phone_number_id",
    "display_phone_number",
    "external_message_id",
    "customer_id",
    "customer_name",
    "message_kind",
    "text",
    "provider_reference",
    "reply_to_message_id",
    "provider_timestamp",
  ]);

  stringType(data(job, "job_type"), "job type");
  stringType(data(job, "event_id"), "event id");
  stringType(data(job, "merchant_id"), "merchant id");
  stringType(data(job, "channel_id"), "channel id");
  stringType(data(job, "channel"), "channel");
  stringType(data(job, "waba_id"), "WABA id");
  stringType(data(job, "phone_number_id"), "phone-number id");
  stringType(data(job, "display_phone_number", false), "display phone number", false);
  stringType(data(job, "external_message_id"), "external message id");
  stringType(data(job, "customer_id"), "customer id");
  stringType(data(job, "customer_name", false), "customer name", false);
  stringType(data(job, "message_kind"), "message kind");
  stringType(data(job, "text", false), "message text", false);
  stringType(data(job, "reply_to_message_id", false), "reply-to message id", false);
  stringType(data(job, "provider_timestamp", false), "provider timestamp", false);
  inspectProviderReference(data(job, "provider_reference", false));
}
