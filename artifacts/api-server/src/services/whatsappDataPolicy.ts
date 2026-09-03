import crypto from "node:crypto";
import { types as utilTypes } from "node:util";

export type WhatsAppDataHandlingPolicy = {
  raw_webhook_persistence_allowed: false;
  raw_webhook_logging_allowed: false;
  normalized_conversation_payload_allowed: true;
  provider_reference_persistence_allowed: true;
  provider_media_binary_persistence_allowed: false;
  provider_media_fetch_allowed_dormant: false;
  encrypted_queue_payload_required: true;
  diagnostic_customer_payload_allowed: false;
  diagnostic_raw_identifier_allowed: false;
  dormant_credential_storage_allowed: false;
  retention_class: "operational_transient";
};

export const WHATSAPP_DATA_HANDLING_POLICY: WhatsAppDataHandlingPolicy = {
  raw_webhook_persistence_allowed: false,
  raw_webhook_logging_allowed: false,
  normalized_conversation_payload_allowed: true,
  provider_reference_persistence_allowed: true,
  provider_media_binary_persistence_allowed: false,
  provider_media_fetch_allowed_dormant: false,
  encrypted_queue_payload_required: true,
  diagnostic_customer_payload_allowed: false,
  diagnostic_raw_identifier_allowed: false,
  dormant_credential_storage_allowed: false,
  retention_class: "operational_transient",
};

export type SafeWhatsAppFailureMetadata = {
  job_type: string;
  reason_code: string;
  attempt_number: number;
  event_hash?: string;
  merchant_hash?: string;
  channel_hash?: string;
  external_message_hash?: string;
};

function digest(namespace: string, value: string): string {
  return crypto
    .createHash("sha256")
    .update(`fawri:whatsapp:${namespace}:${value}`)
    .digest("hex")
    .slice(0, 24);
}

function safeCode(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,160}$/.test(normalized) ? normalized : fallback;
}

function safeIdentifier(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > max ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    return "";
  }
  return normalized;
}

function safePayloadRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeDataProperty(
  record: Record<string, unknown> | null,
  key: string,
  max = 512,
): string {
  if (!record) return "";
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      return "";
    }
    return safeIdentifier(descriptor.value, max);
  } catch {
    return "";
  }
}

/**
 * Produces dead-letter/worker failure metadata that is safe for operational
 * inspection. Customer text, names, phone numbers, provider payloads, and raw
 * channel identifiers are intentionally not copied. Diagnostic extraction is
 * coercion-free and reads only bounded plain-object data properties, so failure
 * handling cannot execute user-controlled getters/value coercion or hash an
 * unbounded identifier.
 */
export function buildSafeWhatsAppFailureMetadata(input: {
  jobType: unknown;
  reasonCode: unknown;
  attemptNumber: unknown;
  payload?: Record<string, unknown> | null;
}): SafeWhatsAppFailureMetadata {
  const attemptNumber = input.attemptNumber;
  if (
    typeof attemptNumber !== "number" ||
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1
  ) {
    throw Object.assign(new Error("WhatsApp failure attempt is invalid"), {
      code: "WHATSAPP_FAILURE_METADATA_INVALID",
    });
  }

  const payload = safePayloadRecord(input.payload);
  const eventId = safeDataProperty(payload, "event_id");
  const merchantId = safeDataProperty(payload, "merchant_id", 200);
  const channelId = safeDataProperty(payload, "channel_id", 200);
  const externalMessageId = safeDataProperty(payload, "external_message_id");
  const wabaId = safeDataProperty(payload, "waba_id", 40);
  const phoneNumberId = safeDataProperty(payload, "phone_number_id", 40);

  return {
    job_type: safeCode(input.jobType, "whatsapp_unknown_job"),
    reason_code: safeCode(input.reasonCode, "WHATSAPP_FAILURE_REDACTED"),
    attempt_number: attemptNumber,
    ...(eventId ? { event_hash: digest("event", eventId) } : {}),
    ...(merchantId ? { merchant_hash: digest("merchant", merchantId) } : {}),
    ...(channelId || wabaId || phoneNumberId
      ? {
          channel_hash: digest(
            "channel",
            channelId || `${wabaId}:${phoneNumberId}`,
          ),
        }
      : {}),
    ...(externalMessageId
      ? { external_message_hash: digest("message", externalMessageId) }
      : {}),
  };
}
