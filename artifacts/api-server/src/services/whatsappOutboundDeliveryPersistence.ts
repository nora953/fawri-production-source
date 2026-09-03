import type { WhatsAppSendOutcome } from "./whatsappOfflineContracts";
import {
  assertWhatsAppOutboundAttemptIntegrity,
  type WhatsAppOutboundAttemptPlan,
} from "./whatsappOutboundAttempt";

export type PlannedWhatsAppOutboundDeliveryRow = {
  id: string;
  merchant_id: string;
  inbound_event_id: string;
  reservation_id: string | null;
  reply_intent_id: string;
  outcome: "pending" | "sent" | "confirmed_failed" | "uncertain";
  provider_message_id: string | null;
  failure_code: string | null;
  attempted_at: string;
  finalized_at: string | null;
};

export type WhatsAppReservationEffect =
  | "hold_reserved"
  | "consume_exactly_once"
  | "refund_exactly_once";

export type WhatsAppOutboundDeliveryPersistencePlan = {
  boundary: "not_persisted";
  row: PlannedWhatsAppOutboundDeliveryRow;
  reservation_effect: WhatsAppReservationEffect;
  automatic_retry_allowed: false;
};

function persistenceError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function identity(value: unknown, label: string, optional = false): string | null {
  const result = String(value ?? "").trim();
  if (!result && optional) return null;
  if (!result || result.length > 512 || /[\r\n]/.test(result)) {
    throw persistenceError(
      "WHATSAPP_OUTBOUND_PERSISTENCE_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return result;
}

function timestamp(value: unknown, label: string): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw persistenceError(
      "WHATSAPP_OUTBOUND_PERSISTENCE_TIMESTAMP_INVALID",
      `${label} is invalid`,
    );
  }
  return parsed.toISOString();
}

function safeFailureCode(value: unknown): string {
  const result = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(result)) {
    return "WHATSAPP_DELIVERY_FAILURE_REDACTED";
  }
  return result;
}

/**
 * Maps a credential-free outbound attempt and its observed provider outcome to
 * the existing `outbound_deliveries` schema. It performs no write. The attempt
 * is revalidated at this boundary so a mutated request/routing/recipient cannot
 * be finalized under stale deterministic identifiers. Reservation effects are
 * explicit so a future executor cannot consume/refund credits on an ambiguous
 * send: pending/uncertain hold, confirmed send consumes, and only confirmed
 * failure refunds.
 */
export function planWhatsAppOutboundDeliveryPersistence(input: {
  attempt: WhatsAppOutboundAttemptPlan;
  inboundEventId: unknown;
  reservationId?: unknown;
  attemptedAt: unknown;
  finalizedAt?: unknown;
  outcome?: WhatsAppSendOutcome;
}): WhatsAppOutboundDeliveryPersistencePlan {
  if (input.attempt.boundary !== "not_sent" || input.attempt.transport_authorized) {
    throw persistenceError(
      "WHATSAPP_OUTBOUND_ATTEMPT_BOUNDARY_INVALID",
      "WhatsApp outbound attempt boundary is invalid",
    );
  }
  assertWhatsAppOutboundAttemptIntegrity(input.attempt);

  const inboundEventId = identity(input.inboundEventId, "inbound event id")!;
  const reservationId = identity(input.reservationId, "reservation id", true);
  const attemptedAt = timestamp(input.attemptedAt, "attempted at");
  const base = {
    id: input.attempt.attempt_id,
    merchant_id: input.attempt.merchant_id,
    inbound_event_id: inboundEventId,
    reservation_id: reservationId,
    reply_intent_id: input.attempt.reply_intent_id,
    attempted_at: attemptedAt,
  };

  if (!input.outcome) {
    if (input.finalizedAt !== undefined && input.finalizedAt !== null) {
      throw persistenceError(
        "WHATSAPP_PENDING_DELIVERY_CANNOT_BE_FINALIZED",
        "Pending WhatsApp delivery cannot have a finalized timestamp",
      );
    }
    return {
      boundary: "not_persisted",
      row: {
        ...base,
        outcome: "pending",
        provider_message_id: null,
        failure_code: null,
        finalized_at: null,
      },
      reservation_effect: "hold_reserved",
      automatic_retry_allowed: false,
    };
  }

  const finalizedAt = timestamp(input.finalizedAt, "finalized at");
  if (new Date(finalizedAt).getTime() < new Date(attemptedAt).getTime()) {
    throw persistenceError(
      "WHATSAPP_OUTBOUND_FINALIZATION_ORDER_INVALID",
      "WhatsApp delivery finalized before it was attempted",
    );
  }

  if (input.outcome.status === "sent") {
    const providerMessageId = identity(
      input.outcome.provider_message_id,
      "provider message id",
    )!;
    return {
      boundary: "not_persisted",
      row: {
        ...base,
        outcome: "sent",
        provider_message_id: providerMessageId,
        failure_code: null,
        finalized_at: finalizedAt,
      },
      reservation_effect: "consume_exactly_once",
      automatic_retry_allowed: false,
    };
  }

  if (input.outcome.status === "confirmed_failed") {
    return {
      boundary: "not_persisted",
      row: {
        ...base,
        outcome: "confirmed_failed",
        provider_message_id: null,
        failure_code: safeFailureCode(input.outcome.code),
        finalized_at: finalizedAt,
      },
      reservation_effect: "refund_exactly_once",
      automatic_retry_allowed: false,
    };
  }

  return {
    boundary: "not_persisted",
    row: {
      ...base,
      outcome: "uncertain",
      provider_message_id: null,
      failure_code: safeFailureCode(input.outcome.code),
      finalized_at: finalizedAt,
    },
    reservation_effect: "hold_reserved",
    automatic_retry_allowed: false,
  };
}
