import { types as utilTypes } from "node:util";
import type { WhatsAppSendOutcome } from "./whatsappOfflineContracts";
import type {
  WhatsAppDeliveryState,
} from "./whatsappDeliveryLifecycle";
import type { WhatsAppDeliveryStatusPlan } from "./whatsappWebhookPlanner";
import type { NormalizedWhatsAppStatusEvent } from "./whatsappWebhookContract";

const MAX_ERROR_CODES = 100;
const DELIVERY_PHASES = new Set([
  "sent",
  "delivered",
  "read",
  "failed",
  "uncertain",
]);

function shapeError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_DELIVERY_SHAPE_INVALID",
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
      if (!allowedSet.has(key)) {
        fail(`${label} contains unsupported property ${key}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(`${label} must contain enumerable data properties only`);
      }
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if ((error as { code?: string })?.code === "WHATSAPP_DELIVERY_SHAPE_INVALID") {
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

function primitiveForSemanticValidation(
  value: unknown,
  label: string,
  optional = false,
): void {
  if ((value === undefined || value === null) && optional) return;
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    typeof value !== "bigint"
  ) {
    fail(`${label} must be a primitive value`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    fail(`${label} must be finite`);
  }
}

function boundedString(
  value: unknown,
  label: string,
  max: number,
  optional = false,
): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.length > max) {
    fail(`${label} must be a bounded string`);
  }
  return value;
}

function denseStringArray(value: unknown, label: string): string[] {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) {
      fail(`${label} must be an array`);
    }
    if (value.length > MAX_ERROR_CODES) {
      fail(`${label} exceeds its item budget`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail(`${label} cannot contain symbol properties`);
    }
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || !names.includes("length")) {
      fail(`${label} must be dense and cannot contain extra properties`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable ||
        typeof descriptor.value !== "string" ||
        descriptor.value.length > 160
      ) {
        fail(`${label} contains an invalid item`);
      }
    }
    return value;
  } catch (error) {
    if ((error as { code?: string })?.code === "WHATSAPP_DELIVERY_SHAPE_INVALID") {
      throw error;
    }
    fail(`${label} could not be inspected safely`);
  }
}

function assertSendOutcomeStructure(value: unknown): asserts value is WhatsAppSendOutcome {
  const outcome = plainRecord(value, "WhatsApp send outcome", [
    "status",
    "provider_message_id",
    "code",
    "http_status",
  ]);
  const status = boundedString(data(outcome, "status"), "send outcome status", 32)!;
  if (status === "sent") {
    boundedString(data(outcome, "provider_message_id"), "provider message id", 512);
    if (data(outcome, "code", false) !== undefined || data(outcome, "http_status", false) !== undefined) {
      fail("sent outcome cannot contain failure fields");
    }
    return;
  }
  if (status === "confirmed_failed") {
    boundedString(data(outcome, "code"), "send failure code", 160);
    const httpStatus = data(outcome, "http_status");
    if (typeof httpStatus !== "number" || !Number.isFinite(httpStatus)) {
      fail("confirmed failure HTTP status must be a finite number");
    }
    if (data(outcome, "provider_message_id", false) !== undefined) {
      fail("confirmed failure cannot contain a provider message id");
    }
    return;
  }
  if (status === "uncertain") {
    boundedString(data(outcome, "code"), "uncertain send code", 160);
    const httpStatus = data(outcome, "http_status", false);
    if (
      httpStatus !== undefined &&
      (typeof httpStatus !== "number" || !Number.isFinite(httpStatus))
    ) {
      fail("uncertain HTTP status must be a finite number");
    }
    if (data(outcome, "provider_message_id", false) !== undefined) {
      fail("uncertain outcome cannot contain a provider message id");
    }
    return;
  }
  fail("send outcome status is invalid");
}

export function assertWhatsAppDeliveryStatusPlanStructure(
  value: unknown,
): asserts value is WhatsAppDeliveryStatusPlan {
  const observation = plainRecord(value, "WhatsApp delivery status plan", [
    "event_id",
    "merchant_id",
    "channel_id",
    "waba_id",
    "phone_number_id",
    "external_message_id",
    "status",
    "recipient_id",
    "provider_timestamp",
    "error_codes",
  ]);
  for (const [key, label] of [
    ["event_id", "event id"],
    ["merchant_id", "merchant id"],
    ["channel_id", "channel id"],
    ["waba_id", "WABA id"],
    ["phone_number_id", "phone-number id"],
    ["external_message_id", "provider message id"],
    ["status", "delivery status"],
  ] as const) {
    primitiveForSemanticValidation(data(observation, key), label);
  }
  primitiveForSemanticValidation(
    data(observation, "recipient_id", false),
    "recipient id",
    true,
  );
  primitiveForSemanticValidation(
    data(observation, "provider_timestamp", false),
    "provider timestamp",
    true,
  );
  denseStringArray(data(observation, "error_codes"), "delivery error codes");
}

export function assertExpectedWhatsAppRecipientStructure(value: unknown): void {
  primitiveForSemanticValidation(value, "expected recipient id");
}

export function assertWhatsAppNormalizedStatusEventStructure(
  value: unknown,
): asserts value is NormalizedWhatsAppStatusEvent {
  const event = plainRecord(value, "normalized WhatsApp status event", [
    "event_id",
    "event_kind",
    "waba_id",
    "phone_number_id",
    "external_message_id",
    "recipient_id",
    "status",
    "timestamp",
    "error_codes",
  ]);
  if (data(event, "event_kind") !== "status") {
    fail("normalized delivery event kind must be status");
  }
  for (const [key, label, max] of [
    ["event_id", "event id", 512],
    ["waba_id", "WABA id", 64],
    ["phone_number_id", "phone-number id", 64],
    ["external_message_id", "provider message id", 512],
    ["status", "delivery status", 80],
  ] as const) {
    boundedString(data(event, key), label, max);
  }
  boundedString(data(event, "recipient_id", false), "recipient id", 64, true);
  boundedString(data(event, "timestamp", false), "provider timestamp", 32, true);
  denseStringArray(data(event, "error_codes"), "delivery error codes");
}

export function assertWhatsAppDeliveryStateStructure(
  value: unknown,
): asserts value is WhatsAppDeliveryState {
  const state = plainRecord(value, "WhatsApp delivery state", [
    "local_attempt_id",
    "waba_id",
    "phone_number_id",
    "external_message_id",
    "phase",
    "recipient_id",
    "provider_timestamp",
    "error_codes",
    "last_status_event_id",
    "conflict_code",
  ]);
  boundedString(data(state, "local_attempt_id"), "local attempt id", 200);
  boundedString(data(state, "waba_id"), "WABA id", 64);
  boundedString(data(state, "phone_number_id"), "phone-number id", 64);
  boundedString(
    data(state, "external_message_id", false),
    "provider message id",
    512,
    true,
  );
  const phase = boundedString(data(state, "phase"), "delivery phase", 32)!;
  if (!DELIVERY_PHASES.has(phase)) fail("delivery phase is invalid");
  boundedString(data(state, "recipient_id", false), "recipient id", 64, true);
  boundedString(
    data(state, "provider_timestamp", false),
    "provider timestamp",
    32,
    true,
  );
  denseStringArray(data(state, "error_codes"), "delivery state error codes");
  boundedString(
    data(state, "last_status_event_id", false),
    "last status event id",
    512,
    true,
  );
  const conflict = data(state, "conflict_code", false);
  if (
    conflict !== undefined &&
    conflict !== "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS"
  ) {
    fail("delivery conflict code is invalid");
  }
}

export function assertWhatsAppDeliveryCreateInputStructure(value: unknown): void {
  const input = plainRecord(value, "WhatsApp delivery creation input", [
    "attemptId",
    "wabaId",
    "phoneNumberId",
    "outcome",
    "recipientId",
  ]);
  primitiveForSemanticValidation(data(input, "attemptId"), "attempt id");
  primitiveForSemanticValidation(data(input, "wabaId"), "WABA id");
  primitiveForSemanticValidation(data(input, "phoneNumberId"), "phone-number id");
  primitiveForSemanticValidation(
    data(input, "recipientId", false),
    "recipient id",
    true,
  );
  assertSendOutcomeStructure(data(input, "outcome"));
}

export function assertWhatsAppDeliveryReconciliationInputStructure(
  value: unknown,
): void {
  const input = plainRecord(value, "WhatsApp delivery reconciliation input", [
    "merchantId",
    "channelId",
    "state",
    "observation",
  ]);
  primitiveForSemanticValidation(data(input, "merchantId"), "merchant id");
  primitiveForSemanticValidation(data(input, "channelId"), "channel id");
  assertWhatsAppDeliveryStateStructure(data(input, "state"));
  assertWhatsAppDeliveryStatusPlanStructure(data(input, "observation"));
}
