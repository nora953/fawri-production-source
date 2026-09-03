import { types as utilTypes } from "node:util";
import { assertNormalizedWhatsAppWebhookEventRuntime } from "./whatsappRuntimeGuards";
import type { WhatsAppWebhookParseResult } from "./whatsappWebhookContract";

const MAX_PARSED_EVENTS = 2_000;
const MAX_CHANGE_COUNT = 1_000;

function parseGuardError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function fail(message: string): never {
  throw parseGuardError("WHATSAPP_PARSED_WEBHOOK_SHAPE_INVALID", message);
}

function failBudget(message: string): never {
  throw parseGuardError("WHATSAPP_PARSED_WEBHOOK_BUDGET_EXCEEDED", message);
}

function plainRecord(value: unknown): Record<string, unknown> {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      fail("parsed WhatsApp webhook result must be a plain object");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail("parsed WhatsApp webhook result cannot contain symbol keys");
    }
    const names = Object.getOwnPropertyNames(value);
    const keys = Object.keys(value);
    if (names.length !== keys.length || keys.length > 8) {
      fail("parsed WhatsApp webhook result contains hidden or excessive properties");
    }
    const allowed = new Set([
      "supported",
      "object",
      "events",
      "ignored_changes",
      "malformed_changes",
    ]);
    for (const key of keys) {
      if (!allowed.has(key)) fail(`parsed WhatsApp webhook result contains unsupported property ${key}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(`parsed WhatsApp webhook property ${key} must be an enumerable data property`);
      }
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if ((error as { code?: string })?.code === "WHATSAPP_PARSED_WEBHOOK_SHAPE_INVALID") throw error;
    fail("parsed WhatsApp webhook result could not be inspected safely");
  }
}

function data(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    fail(`parsed WhatsApp webhook property ${key} is missing or unsafe`);
  }
  return descriptor.value;
}

function count(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_CHANGE_COUNT
  ) {
    fail(`${label} is invalid`);
  }
  return value;
}

function denseEvents(value: unknown): unknown[] {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) fail("parsed WhatsApp events must be an array");
    if (value.length > MAX_PARSED_EVENTS) failBudget("parsed WhatsApp events exceed the internal event budget");
    if (Object.getOwnPropertySymbols(value).length > 0) fail("parsed WhatsApp events cannot contain symbol properties");
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || !names.includes("length")) {
      fail("parsed WhatsApp events must be dense and cannot contain extra properties");
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail("parsed WhatsApp events must contain enumerable data items only");
      }
    }
    return value;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (
      code === "WHATSAPP_PARSED_WEBHOOK_SHAPE_INVALID" ||
      code === "WHATSAPP_PARSED_WEBHOOK_BUDGET_EXCEEDED"
    ) {
      throw error;
    }
    fail("parsed WhatsApp events could not be inspected safely");
  }
}

function eventAt(events: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(events, String(index));
  if (!descriptor || !("value" in descriptor)) fail("parsed WhatsApp event could not be read safely");
  return descriptor.value;
}

/**
 * Protects the planner when a test/manual/internal caller supplies a parsed
 * webhook result directly instead of invoking the parser in the same stack.
 * The guard is coercion-free, bounded, and validates every normalized event
 * before the planner fingerprints, resolves, or iterates it.
 */
export function assertWhatsAppWebhookParseResultRuntime(
  value: unknown,
): asserts value is WhatsAppWebhookParseResult {
  const record = plainRecord(value);
  const supported = data(record, "supported");
  if (typeof supported !== "boolean") fail("parsed WhatsApp supported flag is invalid");

  const providerObject = data(record, "object");
  if (typeof providerObject !== "string") fail("parsed WhatsApp provider object must be a string");
  const normalizedObject = providerObject.trim();
  if (
    normalizedObject.length > 160 ||
    /[\u0000-\u001F\u007F]/.test(normalizedObject)
  ) {
    fail("parsed WhatsApp provider object is invalid");
  }
  if (supported && normalizedObject !== "whatsapp_business_account") {
    fail("supported parsed WhatsApp result has the wrong provider object");
  }

  count(data(record, "ignored_changes"), "ignored change count");
  count(data(record, "malformed_changes"), "malformed change count");
  const events = denseEvents(data(record, "events"));
  if (!supported && events.length > 0) {
    fail("unsupported parsed WhatsApp result cannot contain events");
  }
  for (let index = 0; index < events.length; index += 1) {
    assertNormalizedWhatsAppWebhookEventRuntime(eventAt(events, index));
  }
}
