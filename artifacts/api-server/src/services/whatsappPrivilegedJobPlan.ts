import crypto from "node:crypto";
import { types as utilTypes } from "node:util";

export type WhatsAppPrivilegedJobType =
  | "whatsapp_inbound_message"
  | "whatsapp_delivery_status"
  | "whatsapp_provider_error"
  | "whatsapp_outbound_send";

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

const MAX_PRIVILEGED_PAYLOAD_BYTES = 512 * 1024;
const MAX_PRIVILEGED_PAYLOAD_DEPTH = 32;
const MAX_PRIVILEGED_PAYLOAD_NODES = 10_000;
const MAX_PRIVILEGED_CONTAINER_ITEMS = 2_000;
const MAX_PRIVILEGED_KEY_LENGTH = 200;
const DANGEROUS_PAYLOAD_KEYS = new Set(["__proto__", "prototype", "constructor"]);

type CanonicalPayloadState = {
  seen: Set<object>;
  nodes: number;
  bytes: number;
};

function planError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function payloadInvalid(message: string): never {
  throw planError("WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID", message);
}

function payloadTooComplex(message: string): never {
  throw planError("WHATSAPP_PRIVILEGED_JOB_PAYLOAD_TOO_COMPLEX", message);
}

function payloadTooLarge(): never {
  throw planError(
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_TOO_LARGE",
    "WhatsApp privileged payload exceeds its internal byte budget",
  );
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
  if (
    !normalized ||
    normalized.length > 512 ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw planError(
      "WHATSAPP_PRIVILEGED_JOB_IDENTITY_INVALID",
      "external event/work identity is invalid",
    );
  }
  return normalized;
}

function emitCanonical(state: CanonicalPayloadState, fragment: string): string {
  const bytes = Buffer.byteLength(fragment, "utf8");
  if (state.bytes + bytes > MAX_PRIVILEGED_PAYLOAD_BYTES) payloadTooLarge();
  state.bytes += bytes;
  return fragment;
}

function countCanonicalNode(state: CanonicalPayloadState, depth: number): void {
  if (depth > MAX_PRIVILEGED_PAYLOAD_DEPTH) {
    payloadTooComplex("WhatsApp privileged payload exceeds its depth budget");
  }
  state.nodes += 1;
  if (state.nodes > MAX_PRIVILEGED_PAYLOAD_NODES) {
    payloadTooComplex("WhatsApp privileged payload exceeds its node budget");
  }
}

function assertPayloadString(value: string, label: string): void {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    payloadInvalid(`${label} contains unsafe control bytes`);
  }
}

function assertPayloadKey(key: string): void {
  if (
    !key ||
    key.length > MAX_PRIVILEGED_KEY_LENGTH ||
    /[\u0000-\u001F\u007F]/.test(key) ||
    DANGEROUS_PAYLOAD_KEYS.has(key)
  ) {
    payloadInvalid("WhatsApp privileged payload contains an unsafe object key");
  }
}

function assertUnseenObject(value: object, state: CanonicalPayloadState): void {
  if (state.seen.has(value)) {
    payloadInvalid(
      "WhatsApp privileged payload contains a cycle or shared object reference",
    );
  }
  state.seen.add(value);
}

function canonicalArray(
  value: unknown[],
  state: CanonicalPayloadState,
  depth: number,
): string {
  if (utilTypes.isProxy(value)) {
    payloadInvalid("WhatsApp privileged payload cannot contain proxy values");
  }
  if (value.length > MAX_PRIVILEGED_CONTAINER_ITEMS) {
    payloadTooComplex("WhatsApp privileged payload array exceeds its item budget");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    payloadInvalid("WhatsApp privileged payload arrays cannot contain symbol keys");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length !== value.length + 1 || !ownNames.includes("length")) {
    payloadInvalid(
      "WhatsApp privileged payload arrays must be dense and cannot contain extra properties",
    );
  }

  assertUnseenObject(value, state);
  const parts = [emitCanonical(state, "[")];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      payloadInvalid(
        "WhatsApp privileged payload arrays must contain enumerable data items only",
      );
    }
    if (index > 0) parts.push(emitCanonical(state, ","));
    parts.push(canonicalJsonValue(descriptor.value, state, depth + 1));
  }
  parts.push(emitCanonical(state, "]"));
  return parts.join("");
}

function canonicalObject(
  value: object,
  state: CanonicalPayloadState,
  depth: number,
): string {
  if (utilTypes.isProxy(value)) {
    payloadInvalid("WhatsApp privileged payload cannot contain proxy values");
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    payloadInvalid("WhatsApp privileged payload objects must be plain objects");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    payloadInvalid("WhatsApp privileged payload objects cannot contain symbol keys");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownNames = Object.getOwnPropertyNames(value);
  const keys = Object.keys(value);
  if (ownNames.length !== keys.length) {
    payloadInvalid(
      "WhatsApp privileged payload objects cannot contain hidden properties",
    );
  }
  if (keys.length > MAX_PRIVILEGED_CONTAINER_ITEMS) {
    payloadTooComplex("WhatsApp privileged payload object exceeds its key budget");
  }

  assertUnseenObject(value, state);
  const sorted = [...keys].sort();
  const parts = [emitCanonical(state, "{")];
  for (let index = 0; index < sorted.length; index += 1) {
    const key = sorted[index];
    assertPayloadKey(key);
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      payloadInvalid(
        "WhatsApp privileged payload objects must contain enumerable data properties only",
      );
    }
    if (index > 0) parts.push(emitCanonical(state, ","));
    parts.push(emitCanonical(state, JSON.stringify(key)));
    parts.push(emitCanonical(state, ":"));
    parts.push(canonicalJsonValue(descriptor.value, state, depth + 1));
  }
  parts.push(emitCanonical(state, "}"));
  return parts.join("");
}

function canonicalJsonValue(
  value: unknown,
  state: CanonicalPayloadState,
  depth: number,
): string {
  countCanonicalNode(state, depth);

  if (value === null) return emitCanonical(state, "null");

  if (typeof value === "string") {
    assertPayloadString(value, "WhatsApp privileged payload string");
    return emitCanonical(state, JSON.stringify(value));
  }

  if (typeof value === "boolean") {
    return emitCanonical(state, value ? "true" : "false");
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      payloadInvalid(
        "WhatsApp privileged payload numbers must be finite JSON numbers",
      );
    }
    return emitCanonical(state, JSON.stringify(value));
  }

  if (Array.isArray(value)) return canonicalArray(value, state, depth);

  if (value && typeof value === "object") {
    return canonicalObject(value, state, depth);
  }

  payloadInvalid("WhatsApp privileged payload contains a non-JSON value");
}

function canonicalPrivilegedPayload(payload: Record<string, unknown>): string {
  try {
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      utilTypes.isProxy(payload) ||
      Object.getPrototypeOf(payload) !== Object.prototype
    ) {
      payloadInvalid("WhatsApp privileged payload root must be a plain object");
    }
    return canonicalJsonValue(
      payload,
      { seen: new Set<object>(), nodes: 0, bytes: 0 },
      0,
    );
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (typeof code === "string" && code.startsWith("WHATSAPP_PRIVILEGED_JOB_")) {
      throw error;
    }
    throw planError(
      "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
      "WhatsApp privileged payload could not be inspected safely",
    );
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jobType(value: unknown): WhatsAppPrivilegedJobType {
  if (
    value === "whatsapp_inbound_message" ||
    value === "whatsapp_delivery_status" ||
    value === "whatsapp_provider_error" ||
    value === "whatsapp_outbound_send"
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
 * from plaintext persistence. Inbound jobs use normalized provider event IDs;
 * outbound-send jobs may use a deterministic local attempt ID as the same
 * bounded work identity.
 *
 * Privileged payloads are restricted to deterministic plain JSON data before
 * cloning or hashing. Fawri-internal byte/depth/node/container limits prevent a
 * malformed future caller from creating ambiguous hashes or unbounded
 * canonicalization work; these limits are not provider-side limits.
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
  const canonicalPayload = canonicalPrivilegedPayload(input.payload);
  const payload = structuredClone(input.payload);
  assertPayloadOwnership({
    payload,
    merchantId,
    channelId,
    eventId,
  });

  const payloadSha256 = sha256(canonicalPayload);
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
