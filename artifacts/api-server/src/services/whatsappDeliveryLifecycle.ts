import type { NormalizedWhatsAppStatusEvent } from "./whatsappWebhookContract";
import type { WhatsAppSendOutcome } from "./whatsappOfflineContracts";

export type WhatsAppDeliveryPhase =
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "uncertain";

export type WhatsAppDeliveryState = {
  waba_id: string;
  phone_number_id: string;
  external_message_id: string;
  phase: WhatsAppDeliveryPhase;
  recipient_id?: string;
  provider_timestamp?: string;
  error_codes: string[];
  last_status_event_id?: string;
  conflict_code?: "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS";
};

export type WhatsAppDeliveryReduction = {
  state: WhatsAppDeliveryState;
  changed: boolean;
  ignored_status?: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numericId(value: unknown, label: string): string {
  const result = text(value);
  if (!/^\d{1,40}$/.test(result)) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return result;
}

function messageId(value: unknown): string {
  const result = text(value);
  if (!result || result.length > 512 || /[\r\n]/.test(result)) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_MESSAGE_ID_INVALID",
      "WhatsApp delivery message identity is invalid",
    );
  }
  return result;
}

function lifecycleError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function cleanErrors(values: unknown): string[] {
  const input = Array.isArray(values) ? values : [];
  return [
    ...new Set(
      input
        .map((value) => text(value))
        .filter((value) => value && value.length <= 160),
    ),
  ];
}

function successRank(phase: WhatsAppDeliveryPhase): number {
  if (phase === "sent") return 1;
  if (phase === "delivered") return 2;
  if (phase === "read") return 3;
  return 0;
}

function statusPhase(status: string): WhatsAppDeliveryPhase | null {
  if (status === "sent") return "sent";
  if (status === "delivered") return "delivered";
  if (status === "read") return "read";
  if (status === "failed") return "failed";
  return null;
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Converts an already-observed send outcome into local delivery state. No
 * request is made and no provider credential is accepted here.
 */
export function createWhatsAppDeliveryState(input: {
  wabaId: unknown;
  phoneNumberId: unknown;
  outcome: WhatsAppSendOutcome;
  recipientId?: unknown;
}): WhatsAppDeliveryState {
  const wabaId = numericId(input.wabaId, "WhatsApp business account id");
  const phoneNumberId = numericId(input.phoneNumberId, "WhatsApp phone number id");
  const recipientId = text(input.recipientId);

  if (input.outcome.status === "sent") {
    return {
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      external_message_id: messageId(input.outcome.provider_message_id),
      phase: "sent",
      ...(recipientId ? { recipient_id: recipientId } : {}),
      error_codes: [],
    };
  }

  const syntheticId = `local:${input.outcome.code}`;
  return {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    external_message_id: messageId(syntheticId),
    phase: input.outcome.status === "confirmed_failed" ? "failed" : "uncertain",
    ...(recipientId ? { recipient_id: recipientId } : {}),
    error_codes: [input.outcome.code],
  };
}

function assertEventMatchesState(
  state: WhatsAppDeliveryState,
  event: NormalizedWhatsAppStatusEvent,
): void {
  if (
    state.waba_id !== event.waba_id ||
    state.phone_number_id !== event.phone_number_id ||
    state.external_message_id !== event.external_message_id
  ) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_MAPPING_MISMATCH",
      "WhatsApp status event does not belong to the supplied delivery",
    );
  }
}

/**
 * Applies a normalized provider status to an existing local delivery state.
 * The reducer is monotonic for successful states, preserves terminal failure,
 * and fails closed to `uncertain` if a later event contradicts a terminal
 * failure. Unknown provider statuses are retained as ignored observations.
 */
export function reduceWhatsAppDeliveryStatus(
  state: WhatsAppDeliveryState,
  event: NormalizedWhatsAppStatusEvent,
): WhatsAppDeliveryReduction {
  assertEventMatchesState(state, event);

  const normalizedStatus = text(event.status).toLowerCase();
  const incomingPhase = statusPhase(normalizedStatus);
  if (!incomingPhase) {
    return {
      state,
      changed: false,
      ignored_status: normalizedStatus || "unknown",
    };
  }

  const incomingErrors = cleanErrors(event.error_codes);
  const recipientId = text(event.recipient_id) || state.recipient_id;
  const providerTimestamp = text(event.timestamp) || state.provider_timestamp;

  if (state.phase === "failed" && incomingPhase !== "failed") {
    return {
      state: {
        ...state,
        phase: "uncertain",
        ...(recipientId ? { recipient_id: recipientId } : {}),
        ...(providerTimestamp ? { provider_timestamp: providerTimestamp } : {}),
        error_codes: [
          ...new Set([
            ...state.error_codes,
            ...incomingErrors,
            "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS",
          ]),
        ],
        last_status_event_id: event.event_id,
        conflict_code: "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS",
      },
      changed: true,
    };
  }

  if (incomingPhase === "failed") {
    const nextErrors = incomingErrors.length
      ? incomingErrors
      : state.error_codes.length
        ? state.error_codes
        : ["WHATSAPP_DELIVERY_FAILED"];
    const next: WhatsAppDeliveryState = {
      ...state,
      phase: "failed",
      ...(recipientId ? { recipient_id: recipientId } : {}),
      ...(providerTimestamp ? { provider_timestamp: providerTimestamp } : {}),
      error_codes: nextErrors,
      last_status_event_id: event.event_id,
    };
    return {
      state: next,
      changed:
        state.phase !== next.phase ||
        state.last_status_event_id !== next.last_status_event_id ||
        state.provider_timestamp !== next.provider_timestamp ||
        state.recipient_id !== next.recipient_id ||
        !sameArray(state.error_codes, next.error_codes),
    };
  }

  const currentRank = successRank(state.phase);
  const incomingRank = successRank(incomingPhase);
  if (currentRank > incomingRank) {
    return { state, changed: false };
  }

  const next: WhatsAppDeliveryState = {
    ...state,
    phase: incomingPhase,
    ...(recipientId ? { recipient_id: recipientId } : {}),
    ...(providerTimestamp ? { provider_timestamp: providerTimestamp } : {}),
    error_codes: [],
    last_status_event_id: event.event_id,
    conflict_code: undefined,
  };
  return {
    state: next,
    changed:
      state.phase !== next.phase ||
      state.last_status_event_id !== next.last_status_event_id ||
      state.provider_timestamp !== next.provider_timestamp ||
      state.recipient_id !== next.recipient_id ||
      state.error_codes.length !== 0 ||
      state.conflict_code !== undefined,
  };
}
