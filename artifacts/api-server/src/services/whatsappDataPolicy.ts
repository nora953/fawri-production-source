import crypto from "node:crypto";

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
  const normalized = String(value ?? "").trim();
  return /^[A-Za-z0-9_.:-]{1,160}$/.test(normalized) ? normalized : fallback;
}

function safeText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Produces dead-letter/worker failure metadata that is safe for operational
 * inspection. Customer text, names, phone numbers, provider payloads, and raw
 * channel identifiers are intentionally not copied.
 */
export function buildSafeWhatsAppFailureMetadata(input: {
  jobType: unknown;
  reasonCode: unknown;
  attemptNumber: unknown;
  payload?: Record<string, unknown> | null;
}): SafeWhatsAppFailureMetadata {
  const attemptNumber = Number(input.attemptNumber);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    throw Object.assign(new Error("WhatsApp failure attempt is invalid"), {
      code: "WHATSAPP_FAILURE_METADATA_INVALID",
    });
  }

  const payload = input.payload || {};
  const eventId = safeText(payload.event_id);
  const merchantId = safeText(payload.merchant_id);
  const channelId = safeText(payload.channel_id);
  const externalMessageId = safeText(payload.external_message_id);
  const wabaId = safeText(payload.waba_id);
  const phoneNumberId = safeText(payload.phone_number_id);

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
