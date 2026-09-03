import { types as utilTypes } from "node:util";
import type { WhatsAppActivationReadiness } from "./whatsappActivationReadiness";
import type { ResolvedDormantWhatsAppChannel } from "./whatsappDormantChannelResolver";
import type { WhatsAppFakeTransportObservation } from "./whatsappOfflineOutboundRehearsal";

function guardError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_OUTBOUND_POLICY_SHAPE_INVALID",
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
      "WHATSAPP_OUTBOUND_POLICY_SHAPE_INVALID"
    ) {
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

function primitive(value: unknown, label: string, optional = false): void {
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

function boundedString(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.length > max) {
    fail(`${label} must be a bounded string`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): void {
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
}

function numberValue(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
}

function assertDormantChannelStructure(
  value: unknown,
): asserts value is ResolvedDormantWhatsAppChannel {
  const channel = plainRecord(value, "dormant WhatsApp channel", [
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
  boundedString(data(channel, "id"), "channel id", 512);
  boundedString(data(channel, "merchant_id"), "merchant id", 512);
  boundedString(data(channel, "platform"), "channel platform", 32);
  boundedString(data(channel, "status"), "channel status", 32);
  numberValue(data(channel, "version"), "channel version");
  boundedString(data(channel, "waba_id"), "WABA id", 64);
  boundedString(data(channel, "phone_number_id"), "phone-number id", 64);
  const display = data(channel, "display_phone_number", false);
  if (display !== undefined) boundedString(display, "display phone number", 80);
  boundedString(data(channel, "integration_mode"), "integration mode", 64);
}

function assertReadinessStructure(
  value: unknown,
): asserts value is WhatsAppActivationReadiness {
  const readiness = plainRecord(value, "WhatsApp activation readiness", [
    "mode",
    "environment",
    "offline_foundation_enabled",
    "live_cutover_requested",
    "ready_for_external_activation",
    "blockers",
  ]);
  boundedString(data(readiness, "mode"), "readiness mode", 32);
  boundedString(data(readiness, "environment"), "readiness environment", 32);
  booleanValue(
    data(readiness, "offline_foundation_enabled"),
    "offline foundation flag",
  );
  booleanValue(data(readiness, "live_cutover_requested"), "live cutover flag");
  booleanValue(
    data(readiness, "ready_for_external_activation"),
    "external activation readiness flag",
  );
  const blockers = data(readiness, "blockers");
  if (!Array.isArray(blockers) || utilTypes.isProxy(blockers) || blockers.length > 64) {
    fail("readiness blockers must be a bounded array");
  }
  const names = Object.getOwnPropertyNames(blockers);
  if (
    Object.getOwnPropertySymbols(blockers).length > 0 ||
    names.length !== blockers.length + 1 ||
    !names.includes("length")
  ) {
    fail("readiness blockers must be a dense data array");
  }
  for (let index = 0; index < blockers.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(blockers, String(index));
    if (
      !descriptor ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      typeof descriptor.value !== "string" ||
      descriptor.value.length > 160
    ) {
      fail("readiness blocker is invalid");
    }
  }
}

export function assertDormantWhatsAppOutboundPreviewInputStructure(
  value: unknown,
): void {
  const input = plainRecord(value, "dormant WhatsApp outbound preview input", [
    "merchantId",
    "channel",
    "to",
    "messageText",
    "graphVersion",
    "readiness",
  ]);
  primitive(data(input, "merchantId"), "merchant id");
  assertDormantChannelStructure(data(input, "channel"));
  primitive(data(input, "to"), "recipient");
  primitive(data(input, "messageText"), "message text");
  primitive(data(input, "graphVersion"), "Graph API version");
  const readiness = data(input, "readiness", false);
  if (readiness !== undefined) assertReadinessStructure(readiness);
}

function assertFakeObservationStructure(
  value: unknown,
): asserts value is WhatsAppFakeTransportObservation {
  const observation = plainRecord(value, "WhatsApp fake transport observation", [
    "kind",
    "http_status",
    "body",
  ]);
  const kind = boundedString(data(observation, "kind"), "fake observation kind", 64);
  if (kind === "http") {
    const status = data(observation, "http_status");
    if (typeof status !== "number" || !Number.isFinite(status)) {
      fail("fake HTTP status must be a finite number");
    }
    data(observation, "body");
    return;
  }
  if (kind === "timeout" || kind === "connection_reset") {
    if (
      data(observation, "http_status", false) !== undefined ||
      data(observation, "body", false) !== undefined
    ) {
      fail("non-HTTP fake observations cannot contain HTTP fields");
    }
    return;
  }
  // Preserve the rehearsal's established semantic error for unknown primitive
  // kinds while still proving no accessor/proxy can execute first.
}

export function assertWhatsAppOfflineOutboundRehearsalInputStructure(
  value: unknown,
): void {
  const input = plainRecord(value, "WhatsApp offline outbound rehearsal input", [
    "merchantId",
    "channel",
    "to",
    "messageText",
    "graphVersion",
    "replyIntentId",
    "attemptNumber",
    "inboundEventId",
    "reservationId",
    "attemptedAt",
    "finalizedAt",
    "observation",
  ]);
  primitive(data(input, "merchantId"), "merchant id");
  assertDormantChannelStructure(data(input, "channel"));
  primitive(data(input, "to"), "recipient");
  primitive(data(input, "messageText"), "message text");
  primitive(data(input, "graphVersion"), "Graph API version");
  primitive(data(input, "replyIntentId"), "reply intent id");
  primitive(data(input, "attemptNumber"), "attempt number");
  primitive(data(input, "inboundEventId"), "inbound event id");
  primitive(data(input, "reservationId", false), "reservation id", true);
  primitive(data(input, "attemptedAt"), "attempted timestamp");
  primitive(data(input, "finalizedAt"), "finalized timestamp");
  assertFakeObservationStructure(data(input, "observation"));
}
