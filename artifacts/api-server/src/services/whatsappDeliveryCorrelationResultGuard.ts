import { types as utilTypes } from "node:util";
import type { OperationalQueryResult } from "./operationalPostgresAuthority";

export type GuardedWhatsAppDeliveryCorrelationRow = {
  id: string;
  merchant_id: string;
  inbound_event_id: string;
  reservation_id: string | null;
  reply_intent_id: string;
  outcome: string;
  provider_message_id: string | null;
  failure_code: string | null;
  channel_id: string;
  waba_id: string | null;
  phone_number_id: string | null;
};

function resultError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_DELIVERY_CORRELATION_RESULT_INVALID",
  });
}

function fail(message: string): never {
  throw resultError(message);
}

function ownData(
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

function plainRow(value: unknown): GuardedWhatsAppDeliveryCorrelationRow {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      fail("delivery correlation row must be a plain object");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail("delivery correlation row cannot contain symbol properties");
    }
    const record = value as Record<string, unknown>;
    const allowed = new Set([
      "id",
      "merchant_id",
      "inbound_event_id",
      "reservation_id",
      "reply_intent_id",
      "outcome",
      "provider_message_id",
      "failure_code",
      "channel_id",
      "waba_id",
      "phone_number_id",
    ]);
    const names = Object.getOwnPropertyNames(record);
    const keys = Object.keys(record);
    if (names.length !== keys.length) {
      fail("delivery correlation row cannot contain hidden properties");
    }
    for (const key of keys) {
      if (!allowed.has(key)) fail(`delivery correlation row contains unsupported property ${key}`);
      ownData(record, key);
    }

    const requiredStrings = [
      "id",
      "merchant_id",
      "inbound_event_id",
      "reply_intent_id",
      "outcome",
      "channel_id",
    ] as const;
    for (const key of requiredStrings) {
      const item = ownData(record, key);
      if (typeof item !== "string" || item.length > 512) {
        fail(`delivery correlation ${key} is invalid`);
      }
    }
    for (const key of [
      "reservation_id",
      "provider_message_id",
      "failure_code",
      "waba_id",
      "phone_number_id",
    ] as const) {
      const item = ownData(record, key);
      if (item !== null && (typeof item !== "string" || item.length > 512)) {
        fail(`delivery correlation ${key} is invalid`);
      }
    }
    return record as GuardedWhatsAppDeliveryCorrelationRow;
  } catch (error) {
    if (
      (error as { code?: string })?.code ===
      "WHATSAPP_DELIVERY_CORRELATION_RESULT_INVALID"
    ) {
      throw error;
    }
    fail("delivery correlation row could not be inspected safely");
  }
}

/**
 * Inspects only the query-result fields used by delivery correlation. Extra
 * PostgreSQL result metadata is tolerated, but all root properties must remain
 * ordinary data properties so a forged adapter cannot hide accessors alongside
 * `rows`. The SQL itself is LIMIT 2, therefore larger result arrays fail closed.
 */
export function assertWhatsAppDeliveryCorrelationResultStructure(
  value: unknown,
): asserts value is OperationalQueryResult<GuardedWhatsAppDeliveryCorrelationRow> {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      fail("delivery correlation query result must be a plain object");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail("delivery correlation query result cannot contain symbol properties");
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(record)) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail("delivery correlation query result must contain data properties only");
      }
    }
    const rows = ownData(record, "rows");
    if (!Array.isArray(rows) || utilTypes.isProxy(rows) || rows.length > 2) {
      fail("delivery correlation rows are invalid");
    }
    if (Object.getOwnPropertySymbols(rows).length > 0) {
      fail("delivery correlation rows cannot contain symbol properties");
    }
    const names = Object.getOwnPropertyNames(rows);
    if (names.length !== rows.length + 1 || !names.includes("length")) {
      fail("delivery correlation rows must be a dense array");
    }
    for (let index = 0; index < rows.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(rows, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail("delivery correlation row entry is invalid");
      }
      plainRow(descriptor.value);
    }
  } catch (error) {
    if (
      (error as { code?: string })?.code ===
      "WHATSAPP_DELIVERY_CORRELATION_RESULT_INVALID"
    ) {
      throw error;
    }
    fail("delivery correlation query result could not be inspected safely");
  }
}
