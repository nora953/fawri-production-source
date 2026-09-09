import { types as utilTypes } from "node:util";
import type { WhatsAppMessageKind, WhatsAppMessageProviderReference, NormalizedWhatsAppWebhookEvent } from "./whatsappWebhookContract";
import type { WhatsAppWebhookProcessingPlan } from "./whatsappWebhookPlanner";

const MAX_PLANNED_EVENTS = 2_000;
const MAX_PLAN_CHANGES = 1_000;
const MAX_STATUS_ERROR_CODES = 100;
const MAX_RECORD_KEYS = 32;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MESSAGE_KINDS = new Set<WhatsAppMessageKind>([
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

function guardError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function fail(message: string): never {
  throw guardError("WHATSAPP_RUNTIME_SHAPE_INVALID", message);
}

function failBudget(message: string): never {
  throw guardError("WHATSAPP_RUNTIME_SHAPE_BUDGET_EXCEEDED", message);
}

function plainDataRecord(value: unknown, label: string, maxKeys = MAX_RECORD_KEYS): Record<string, unknown> {
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
      fail(`${label} cannot contain symbol keys`);
    }
    const names = Object.getOwnPropertyNames(value);
    const keys = Object.keys(value);
    if (names.length !== keys.length || keys.length > maxKeys) {
      fail(`${label} contains hidden or excessive properties`);
    }
    for (const key of keys) {
      if (
        !key ||
        key.length > 200 ||
        /[\u0000-\u001F\u007F]/.test(key) ||
        DANGEROUS_KEYS.has(key)
      ) {
        fail(`${label} contains an unsafe property name`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(`${label} must contain enumerable data properties only`);
      }
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if ((error as { code?: string })?.code === "WHATSAPP_RUNTIME_SHAPE_INVALID") throw error;
    fail(`${label} could not be inspected safely`);
  }
}

function ownData(record: Record<string, unknown>, key: string, required = true): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    if (required) fail(`required property ${key} is missing`);
    return undefined;
  }
  if (!("value" in descriptor) || !descriptor.enumerable) {
    fail(`property ${key} must be an enumerable data property`);
  }
  return descriptor.value;
}

function onlyKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) fail(`${label} contains unsupported property ${key}`);
  }
}

function denseArray(value: unknown, label: string, max: number): unknown[] {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) fail(`${label} must be an array`);
    if (value.length > max) failBudget(`${label} exceeds its internal item budget`);
    if (Object.getOwnPropertySymbols(value).length > 0) fail(`${label} cannot contain symbol properties`);
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || !names.includes("length")) {
      fail(`${label} must be dense and cannot contain extra properties`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(`${label} must contain enumerable data items only`);
      }
    }
    return value;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "WHATSAPP_RUNTIME_SHAPE_INVALID" || code === "WHATSAPP_RUNTIME_SHAPE_BUDGET_EXCEEDED") throw error;
    fail(`${label} could not be inspected safely`);
  }
}

function arrayItem(values: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
  if (!descriptor || !("value" in descriptor)) fail("array item could not be read safely");
  return descriptor.value;
}

function requiredString(value: unknown, label: string, max: number, options: { singleLine?: boolean; pattern?: RegExp } = {}): string {
  if (typeof value !== "string") fail(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) fail(`${label} is invalid`);
  const unsafe = options.singleLine
    ? /[\u0000-\u001F\u007F]/
    : /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  if (unsafe.test(normalized)) fail(`${label} contains unsafe control bytes`);
  if (options.pattern && !options.pattern.test(normalized)) fail(`${label} has an invalid format`);
  return normalized;
}

function optionalString(value: unknown, label: string, max: number, options: { singleLine?: boolean; pattern?: RegExp } = {}): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, label, max, options);
}

function localIdentity(value: unknown, label: string): string {
  return requiredString(value, label, 200, { singleLine: true, pattern: /^[A-Za-z0-9._:-]+$/ });
}

function providerIdentity(value: unknown, label: string, max = 512): string {
  return requiredString(value, label, max, { singleLine: true });
}

function numericIdentity(value: unknown, label: string, min = 1, max = 40): string {
  return requiredString(value, label, max, { singleLine: true, pattern: new RegExp(`^\\d{${min},${max}}$`) });
}

function timestamp(value: unknown, label: string): string | undefined {
  return optionalString(value, label, 20, { singleLine: true, pattern: /^\d{1,20}$/ });
}

function safeToken(value: unknown, label: string, max: number): string {
  return requiredString(value, label, max, { singleLine: true, pattern: /^[A-Za-z0-9_.:-]+$/ });
}

function nonNegativeCount(value: unknown, label: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
    fail(`${label} is invalid`);
  }
  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
  return value;
}

function providerReference(value: unknown, messageKind: WhatsAppMessageKind): WhatsAppMessageProviderReference | undefined {
  if (value === undefined) return undefined;
  const record = plainDataRecord(value, "WhatsApp provider reference", 10);
  const kind = requiredString(ownData(record, "kind"), "provider reference kind", 32, { singleLine: true });

  if (kind === "media") {
    onlyKeys(record, ["kind", "media_kind", "id", "mime_type", "sha256", "caption", "filename", "voice", "animated"], "media reference");
    const mediaKind = requiredString(ownData(record, "media_kind"), "media kind", 32, { singleLine: true });
    if (!MEDIA_KINDS.has(mediaKind) || mediaKind !== messageKind) fail("media reference does not match message kind");
    providerIdentity(ownData(record, "id"), "media id", 160);
    optionalString(ownData(record, "mime_type", false), "media mime type", 160, { singleLine: true });
    optionalString(ownData(record, "sha256", false), "media sha256", 256, { singleLine: true });
    optionalString(ownData(record, "caption", false), "media caption", 1_024);
    optionalString(ownData(record, "filename", false), "media filename", 512, { singleLine: true });
    optionalBoolean(ownData(record, "voice", false), "media voice flag");
    optionalBoolean(ownData(record, "animated", false), "media animated flag");
    return value as WhatsAppMessageProviderReference;
  }

  if (kind === "location") {
    onlyKeys(record, ["kind", "latitude", "longitude", "name", "address"], "location reference");
    if (messageKind !== "location") fail("location reference does not match message kind");
    const latitude = ownData(record, "latitude");
    const longitude = ownData(record, "longitude");
    if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) fail("location latitude is invalid");
    if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) fail("location longitude is invalid");
    optionalString(ownData(record, "name", false), "location name", 300, { singleLine: true });
    optionalString(ownData(record, "address", false), "location address", 1_000);
    return value as WhatsAppMessageProviderReference;
  }

  if (kind === "reaction") {
    onlyKeys(record, ["kind", "message_id", "emoji"], "reaction reference");
    if (messageKind !== "reaction") fail("reaction reference does not match message kind");
    providerIdentity(ownData(record, "message_id"), "reaction message id");
    optionalString(ownData(record, "emoji", false), "reaction emoji", 32, { singleLine: true });
    return value as WhatsAppMessageProviderReference;
  }

  if (kind === "contacts") {
    onlyKeys(record, ["kind", "count"], "contacts reference");
    if (messageKind !== "contacts") fail("contacts reference does not match message kind");
    const count = ownData(record, "count");
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > 1_000) fail("contacts reference count is invalid");
    return value as WhatsAppMessageProviderReference;
  }

  fail("provider reference kind is invalid");
}

function messageKind(value: unknown): WhatsAppMessageKind {
  if (typeof value !== "string" || !MESSAGE_KINDS.has(value as WhatsAppMessageKind)) {
    fail("WhatsApp message kind is invalid");
  }
  return value as WhatsAppMessageKind;
}

function validateInboundMessage(value: unknown): void {
  const record = plainDataRecord(value, "WhatsApp inbound plan item");
  onlyKeys(record, [
    "job_type", "event_id", "merchant_id", "channel_id", "channel", "waba_id", "phone_number_id",
    "display_phone_number", "external_message_id", "customer_id", "customer_name", "message_kind", "text",
    "provider_reference", "reply_to_message_id", "provider_timestamp",
  ], "WhatsApp inbound plan item");
  if (ownData(record, "job_type") !== "whatsapp_inbound_message") fail("inbound job type is invalid");
  if (ownData(record, "channel") !== "whatsapp") fail("inbound channel is invalid");
  providerIdentity(ownData(record, "event_id"), "inbound event id");
  localIdentity(ownData(record, "merchant_id"), "merchant id");
  localIdentity(ownData(record, "channel_id"), "channel id");
  numericIdentity(ownData(record, "waba_id"), "WABA id");
  numericIdentity(ownData(record, "phone_number_id"), "phone-number id");
  optionalString(ownData(record, "display_phone_number", false), "display phone number", 40, { singleLine: true, pattern: /^[+0-9 ()-]+$/ });
  providerIdentity(ownData(record, "external_message_id"), "external message id");
  numericIdentity(ownData(record, "customer_id"), "customer id", 6, 20);
  optionalString(ownData(record, "customer_name", false), "customer name", 300, { singleLine: true });
  const kind = messageKind(ownData(record, "message_kind"));
  optionalString(ownData(record, "text", false), "normalized message text", 4_000);
  providerReference(ownData(record, "provider_reference", false), kind);
  optionalString(ownData(record, "reply_to_message_id", false), "reply-to message id", 512, { singleLine: true });
  timestamp(ownData(record, "provider_timestamp", false), "provider timestamp");
}

function validateDeliveryStatus(value: unknown): void {
  const record = plainDataRecord(value, "WhatsApp delivery-status plan item", 16);
  onlyKeys(record, ["event_id", "merchant_id", "channel_id", "waba_id", "phone_number_id", "external_message_id", "status", "recipient_id", "provider_timestamp", "error_codes"], "WhatsApp delivery-status plan item");
  providerIdentity(ownData(record, "event_id"), "status event id");
  localIdentity(ownData(record, "merchant_id"), "merchant id");
  localIdentity(ownData(record, "channel_id"), "channel id");
  numericIdentity(ownData(record, "waba_id"), "WABA id");
  numericIdentity(ownData(record, "phone_number_id"), "phone-number id");
  providerIdentity(ownData(record, "external_message_id"), "status external message id");
  safeToken(ownData(record, "status"), "delivery status", 80);
  const recipient = ownData(record, "recipient_id", false);
  if (recipient !== undefined) numericIdentity(recipient, "delivery recipient id", 6, 20);
  timestamp(ownData(record, "provider_timestamp", false), "provider timestamp");
  const errorCodes = denseArray(ownData(record, "error_codes"), "status error codes", MAX_STATUS_ERROR_CODES);
  for (let index = 0; index < errorCodes.length; index += 1) {
    safeToken(arrayItem(errorCodes, index), "provider error code", 160);
  }
}

function validateProviderError(value: unknown): void {
  const record = plainDataRecord(value, "WhatsApp provider-error plan item", 10);
  onlyKeys(record, ["event_id", "merchant_id", "channel_id", "waba_id", "phone_number_id", "code"], "WhatsApp provider-error plan item");
  providerIdentity(ownData(record, "event_id"), "provider-error event id");
  localIdentity(ownData(record, "merchant_id"), "merchant id");
  localIdentity(ownData(record, "channel_id"), "channel id");
  numericIdentity(ownData(record, "waba_id"), "WABA id");
  numericIdentity(ownData(record, "phone_number_id"), "phone-number id");
  safeToken(ownData(record, "code"), "provider error code", 160);
}

/**
 * Runtime guard for any caller that receives a processing plan without going
 * directly through the webhook parser/planner in the same call stack. It makes
 * synthetic/manual callers obey the same bounded identity/data expectations
 * before queue/intake planners spread, hash, clone, or iterate their contents.
 */
export function assertWhatsAppWebhookProcessingPlanRuntime(
  value: unknown,
): asserts value is WhatsAppWebhookProcessingPlan {
  const record = plainDataRecord(value, "WhatsApp processing plan", 12);
  onlyKeys(record, ["mode", "supported", "provider_object", "inbound_messages", "delivery_statuses", "provider_errors", "ignored_changes", "malformed_changes", "duplicate_events"], "WhatsApp processing plan");
  if (ownData(record, "mode") !== "offline_replay") fail("processing plan mode is invalid");
  const supported = ownData(record, "supported");
  if (typeof supported !== "boolean") fail("processing plan supported flag is invalid");
  const providerObject = requiredString(ownData(record, "provider_object"), "provider object", 160, { singleLine: true });
  if (supported && providerObject !== "whatsapp_business_account") fail("supported processing plan provider object is invalid");
  nonNegativeCount(ownData(record, "ignored_changes"), "ignored change count", MAX_PLAN_CHANGES);
  nonNegativeCount(ownData(record, "malformed_changes"), "malformed change count", MAX_PLAN_CHANGES);
  nonNegativeCount(ownData(record, "duplicate_events"), "duplicate event count", MAX_PLANNED_EVENTS);

  const inbound = denseArray(ownData(record, "inbound_messages"), "inbound message plan", MAX_PLANNED_EVENTS);
  const statuses = denseArray(ownData(record, "delivery_statuses"), "delivery status plan", MAX_PLANNED_EVENTS);
  const errors = denseArray(ownData(record, "provider_errors"), "provider error plan", MAX_PLANNED_EVENTS);
  if (inbound.length + statuses.length + errors.length > MAX_PLANNED_EVENTS) {
    failBudget("processing plan exceeds its total event budget");
  }
  if (!supported && (inbound.length > 0 || statuses.length > 0 || errors.length > 0)) {
    fail("unsupported processing plan cannot carry WhatsApp events");
  }
  for (let index = 0; index < inbound.length; index += 1) validateInboundMessage(arrayItem(inbound, index));
  for (let index = 0; index < statuses.length; index += 1) validateDeliveryStatus(arrayItem(statuses, index));
  for (let index = 0; index < errors.length; index += 1) validateProviderError(arrayItem(errors, index));
}

function validateNormalizedMessageEvent(record: Record<string, unknown>): void {
  onlyKeys(record, ["event_id", "event_kind", "waba_id", "phone_number_id", "display_phone_number", "external_message_id", "customer_id", "customer_name", "message_kind", "text", "provider_reference", "reply_to_message_id", "timestamp"], "normalized WhatsApp message event");
  providerIdentity(ownData(record, "event_id"), "event id");
  numericIdentity(ownData(record, "waba_id"), "WABA id");
  numericIdentity(ownData(record, "phone_number_id"), "phone-number id");
  optionalString(ownData(record, "display_phone_number", false), "display phone number", 40, { singleLine: true, pattern: /^[+0-9 ()-]+$/ });
  providerIdentity(ownData(record, "external_message_id"), "external message id");
  numericIdentity(ownData(record, "customer_id"), "customer id", 6, 20);
  optionalString(ownData(record, "customer_name", false), "customer name", 300, { singleLine: true });
  const kind = messageKind(ownData(record, "message_kind"));
  optionalString(ownData(record, "text", false), "normalized message text", 4_000);
  providerReference(ownData(record, "provider_reference", false), kind);
  optionalString(ownData(record, "reply_to_message_id", false), "reply-to message id", 512, { singleLine: true });
  timestamp(ownData(record, "timestamp", false), "provider timestamp");
}

/** Coercion-free event guard used by diagnostic helpers before hashing fields. */
export function assertNormalizedWhatsAppWebhookEventRuntime(
  value: unknown,
): asserts value is NormalizedWhatsAppWebhookEvent {
  const record = plainDataRecord(value, "normalized WhatsApp event", 20);
  const kind = ownData(record, "event_kind");
  if (kind === "message") {
    validateNormalizedMessageEvent(record);
    return;
  }
  if (kind === "status") {
    onlyKeys(record, ["event_id", "event_kind", "waba_id", "phone_number_id", "external_message_id", "recipient_id", "status", "timestamp", "error_codes"], "normalized WhatsApp status event");
    providerIdentity(ownData(record, "event_id"), "event id");
    numericIdentity(ownData(record, "waba_id"), "WABA id");
    numericIdentity(ownData(record, "phone_number_id"), "phone-number id");
    providerIdentity(ownData(record, "external_message_id"), "external message id");
    const recipient = ownData(record, "recipient_id", false);
    if (recipient !== undefined) numericIdentity(recipient, "delivery recipient id", 6, 20);
    safeToken(ownData(record, "status"), "delivery status", 80);
    timestamp(ownData(record, "timestamp", false), "provider timestamp");
    const codes = denseArray(ownData(record, "error_codes"), "provider error codes", MAX_STATUS_ERROR_CODES);
    for (let index = 0; index < codes.length; index += 1) safeToken(arrayItem(codes, index), "provider error code", 160);
    return;
  }
  if (kind === "error") {
    onlyKeys(record, ["event_id", "event_kind", "waba_id", "phone_number_id", "code", "title", "message"], "normalized WhatsApp error event");
    providerIdentity(ownData(record, "event_id"), "event id");
    numericIdentity(ownData(record, "waba_id"), "WABA id");
    numericIdentity(ownData(record, "phone_number_id"), "phone-number id");
    safeToken(ownData(record, "code"), "provider error code", 160);
    optionalString(ownData(record, "title", false), "provider error title", 300, { singleLine: true });
    optionalString(ownData(record, "message", false), "provider error message", 1_000);
    return;
  }
  fail("normalized WhatsApp event kind is invalid");
}
