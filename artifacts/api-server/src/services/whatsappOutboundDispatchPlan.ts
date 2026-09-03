import {
  assertWhatsAppOutboundAttemptIntegrity,
  type WhatsAppOutboundAttemptPlan,
} from "./whatsappOutboundAttempt";
import {
  planWhatsAppOutboundDeliveryPersistence,
  type WhatsAppOutboundDeliveryPersistencePlan,
} from "./whatsappOutboundDeliveryPersistence";
import {
  buildWhatsAppPrivilegedJobPlan,
  type WhatsAppPrivilegedJobPlan,
} from "./whatsappPrivilegedJobPlan";
import {
  assertWhatsAppOutboundDispatchInputStructure,
} from "./whatsappOutboundRuntimeGuards";

export type WhatsAppOutboundDispatchPlan = {
  boundary: "not_persisted_not_enqueued_not_sent";
  storage_authority: "postgres_background_jobs_encrypted_payload";
  transport_authorized: false;
  automatic_retry_allowed: false;
  delivery: WhatsAppOutboundDeliveryPersistencePlan;
  job: WhatsAppPrivilegedJobPlan;
  recipient_lock: {
    recipient_hash: string;
    encrypted_payload_job_id: string;
    encrypted_payload_field: "request.body.to";
    plaintext_persistence_forbidden: true;
  };
};

function dispatchError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Plans the durable pre-send boundary required by a future live worker.
 *
 * The administrative delivery row remains `pending`, while the complete send
 * request (including the trusted recipient and immutable phone-number routing
 * identity) is carried only inside the encrypted privileged job payload. The
 * outbound job is deliberately configured for one claim attempt so generic
 * queue retry policy cannot silently duplicate a provider send after an
 * ambiguous transport boundary.
 *
 * This function performs no SQL, encryption, enqueue, credential access, or
 * provider/network request and never authorizes transport.
 */
export function planWhatsAppOutboundDispatch(input: {
  attempt: WhatsAppOutboundAttemptPlan;
  inboundEventId: unknown;
  reservationId?: unknown;
  attemptedAt: unknown;
}): WhatsAppOutboundDispatchPlan {
  assertWhatsAppOutboundDispatchInputStructure(input);
  if (input.attempt.boundary !== "not_sent" || input.attempt.transport_authorized) {
    throw dispatchError(
      "WHATSAPP_OUTBOUND_DISPATCH_ATTEMPT_INVALID",
      "WhatsApp outbound dispatch requires an unauthorized pre-send attempt",
    );
  }
  assertWhatsAppOutboundAttemptIntegrity(input.attempt);

  const delivery = planWhatsAppOutboundDeliveryPersistence({
    attempt: input.attempt,
    inboundEventId: input.inboundEventId,
    reservationId: input.reservationId,
    attemptedAt: input.attemptedAt,
  });
  if (
    delivery.row.outcome !== "pending" ||
    delivery.row.id !== input.attempt.attempt_id ||
    delivery.row.reply_intent_id !== input.attempt.reply_intent_id ||
    delivery.row.merchant_id !== input.attempt.merchant_id ||
    delivery.reservation_effect !== "hold_reserved"
  ) {
    throw dispatchError(
      "WHATSAPP_OUTBOUND_DISPATCH_DELIVERY_MISMATCH",
      "WhatsApp pending delivery does not match its outbound attempt",
    );
  }

  const payload = {
    event_id: input.attempt.attempt_id,
    merchant_id: input.attempt.merchant_id,
    channel_id: input.attempt.channel_id,
    logical_send_id: input.attempt.logical_send_id,
    attempt_id: input.attempt.attempt_id,
    attempt_number: input.attempt.attempt_number,
    phone_number_id: input.attempt.phone_number_id,
    inbound_event_id: delivery.row.inbound_event_id,
    reservation_id: delivery.row.reservation_id,
    reply_intent_id: input.attempt.reply_intent_id,
    request_sha256: input.attempt.request_sha256,
    recipient_hash: input.attempt.recipient_hash,
    request: structuredClone(input.attempt.request),
  };
  const job = buildWhatsAppPrivilegedJobPlan({
    type: "whatsapp_outbound_send",
    eventId: input.attempt.attempt_id,
    merchantId: input.attempt.merchant_id,
    channelId: input.attempt.channel_id,
    payload,
    priority: 0,
    maxAttempts: 1,
  });

  const encrypted = job.encrypted_payload.payload_for_encryption;
  if (
    encrypted.request_sha256 !== input.attempt.request_sha256 ||
    encrypted.recipient_hash !== input.attempt.recipient_hash ||
    encrypted.phone_number_id !== input.attempt.phone_number_id ||
    encrypted.logical_send_id !== input.attempt.logical_send_id ||
    encrypted.attempt_number !== 1
  ) {
    throw dispatchError(
      "WHATSAPP_OUTBOUND_DISPATCH_PAYLOAD_MISMATCH",
      "WhatsApp encrypted dispatch payload does not match its outbound attempt",
    );
  }

  return {
    boundary: "not_persisted_not_enqueued_not_sent",
    storage_authority: "postgres_background_jobs_encrypted_payload",
    transport_authorized: false,
    automatic_retry_allowed: false,
    delivery,
    job,
    recipient_lock: {
      recipient_hash: input.attempt.recipient_hash,
      encrypted_payload_job_id: job.job_row.id,
      encrypted_payload_field: "request.body.to",
      plaintext_persistence_forbidden: true,
    },
  };
}
