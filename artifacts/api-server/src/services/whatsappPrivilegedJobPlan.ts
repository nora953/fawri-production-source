import crypto from "node:crypto";

export type WhatsAppPrivilegedJobType =
  | "whatsapp_inbound_message"
  | "whatsapp_delivery_status"
  | "whatsapp_provider_error";

export type PlannedWhatsAppBackgroundJobRow = {
  id: string;
  type: WhatsAppPrivilegedJobType;
  dedupe_key: string;
  merchant_id: string;
  payload_hash: string;
  priority: number;
  status: "queued";
  max_attempts: number;
};

export type PlannedWhatsAppEncryptedPayloadRecord = {
  job_id: string;
  merchant_id: string;
  payload_sha256: string;
  payload_for_encryption: Record<string, unknown>;
  ciphertext_required: true;
  plaintext_persistence_forbidden: true;
};

export type WhatsAppPrivilegedJobPlan = {
  boundary: "not_persisted_not_enqueued";
  storage_authority: "postgres_background_jobs_encrypted_payload";
  channel_id: string;
  external_event_id: string;
  job_row: PlannedWhatsAppBackgroundJobRow;
  encrypted_payload: PlannedWhatsAppEncryptedPayloadRecord;
};

function planError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function localIdentity(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (
    !normalized ||
    normalized.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    throw planError(
      "WHATSAPP_PRIVILEGED_JOB_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function providerEventIdentity(value: unknown): string {
  const normalized = String(value ?? "").trim();
  // Normalized webhook event ids can include a bounded 512-character provider
  // message id plus WABA/phone/status context. Keep the downstream boundary
  // bounded without rejecting a webhook that already passed normalization.
  if (
    !normalized ||
    normalized.length > 1_024 ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw planError(
      "WHATSAPP_PRIVILEGED_JOB_IDENTITY_INVALID",
      "external event id is invalid",
    );
  }
  return normalized;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jobType(value: unknown): WhatsAppPrivilegedJobType {
  if (
    value === "whatsapp_inbound_message" ||
    value === "whatsapp_delivery_status" ||
    value === "whatsapp_provider_error"
  ) {
    return value;
  }
  throw planError(
    "WHATSAPP_PRIVILEGED_JOB_TYPE_INVALID",
    "WhatsApp privileged job type is invalid",
  );
}

function positiveInteger(value: unknown, label: string, max: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw planError(
      "WHATSAPP_PRIVILEGED_JOB_RETRY_INVALID",
      `${label} is invalid`,
    );
  }
  return number;
}

function priority(value: unknown): number {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < -100 || number > 100) {
    throw planError(
      "WHATSAPP_PRIVILEGED_JOB_PRIORITY_INVALID",
      "WhatsApp privileged job priority is invalid",
    );
  }
  return number;
}

function assertPayloadOwnership(input: {
  payload: Record<string, unknown>;
  merchantId: string;
  channelId: string;
  eventId: string;
}): void {
  const payloadMerchantId = String(input.payload.merchant_id ?? "").trim();
  const payloadChannelId = String(input.payload.channel_id ?? "").trim();
  const payloadEventId = String(input.payload.event_id ?? "").trim();
  if (
    payloadMerchantId !== input.merchantId ||
    payloadChannelId !== input.channelId ||
    payloadEventId !== input.eventId
  ) {
    throw planError(
      "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_OWNERSHIP_MISMATCH",
      "WhatsApp privileged payload does not match its merchant/channel/event envelope",
    );
  }
}

/**
 * Produces the exact in-memory shape a future PostgreSQL adapter must persist as
 * an administrative `background_jobs` row plus an encrypted
 * `background_job_payloads` record. The normalized payload is carried only as
 * plaintext input for a future encryption boundary and is explicitly forbidden
 * from plaintext persistence.
 *
 * This module deliberately imports no queue implementation, performs no SQL,
 * performs no encryption/decryption, and cannot enqueue or start a worker.
 */
export function buildWhatsAppPrivilegedJobPlan(input: {
  type: WhatsAppPrivilegedJobType;
  eventId: unknown;
  merchantId: unknown;
  channelId: unknown;
  payload: Record<string, unknown>;
  maxAttempts: unknown;
  priority?: unknown;
}): WhatsAppPrivilegedJobPlan {
  const type = jobType(input.type);
  const eventId = providerEventIdentity(input.eventId);
  const merchantId = localIdentity(input.merchantId, "merchant id");
  const channelId = localIdentity(input.channelId, "channel id");
  const maxAttempts = positiveInteger(input.maxAttempts, "max attempts", 25);
  const normalizedPriority = priority(input.priority);
  assertPayloadOwnership({
    payload: input.payload,
    merchantId,
    channelId,
    eventId,
  });

  const payload = structuredClone(input.payload);
  const payloadSha256 = sha256(canonical(payload));
  const jobDigest = sha256(
    `fawri:whatsapp:job:${type}:${merchantId}:${channelId}:${eventId}`,
  );
  const jobId = `whatsapp-job-${jobDigest.slice(0, 40)}`;
  const dedupeKey = `whatsapp:${type}:${sha256(eventId)}`;

  return {
    boundary: "not_persisted_not_enqueued",
    storage_authority: "postgres_background_jobs_encrypted_payload",
    channel_id: channelId,
    external_event_id: eventId,
    job_row: {
      id: jobId,
      type,
      dedupe_key: dedupeKey,
      merchant_id: merchantId,
      payload_hash: payloadSha256,
      priority: normalizedPriority,
      status: "queued",
      max_attempts: maxAttempts,
    },
    encrypted_payload: {
      job_id: jobId,
      merchant_id: merchantId,
      payload_sha256: payloadSha256,
      payload_for_encryption: payload,
      ciphertext_required: true,
      plaintext_persistence_forbidden: true,
    },
  };
}
