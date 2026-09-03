import type { NormalizedWhatsAppStatusEvent } from "./whatsappWebhookContract";
import type { WhatsAppSendOutcome } from "./whatsappOfflineContracts";
import {
  assertWhatsAppDeliveryCreateInputStructure,
  assertWhatsAppDeliveryStateStructure,
  assertWhatsAppNormalizedStatusEventStructure,
} from "./whatsappDeliveryRuntimeGuards";

const MAX_DELIVERY_ERROR_CODES = 100;

export type WhatsAppDeliveryPhase =
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "uncertain";

export type WhatsAppDeliveryState = {
  local_attempt_id: string;
  waba_id: string;
  phone_number_id: string;
  external_message_id?: string;
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

function lifecycleError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
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

function recipientId(value: unknown): string | undefined {
  const result = text(value);
  if (!result) return undefined;
  if (!/^\d{6,20}$/.test(result)) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_RECIPIENT_INVALID",
      "WhatsApp delivery recipient identity is invalid",
    );
  }
  return result;
}

function localAttemptId(value: unknown): string {
  const result = text(value);
  if (!result || result.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(result)) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_ATTEMPT_ID_INVALID",
      "WhatsApp local delivery attempt identity is invalid",
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

function mergeErrors(...groups: string[][]): string[] {
  return [...new Set(groups.flat())].slice(0, MAX_DELIVERY_ERROR_CODES);
}

function cleanErrors(values: unknown): string[] {
  const input = Array.isArray(values) ? values : [];
  return mergeErrors(
    input
      .map((value) => text(value))
      .filter((value) => value && value.length <= 160),
  );
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

function contradictoryState(
  state: WhatsAppDeliveryState,
  event: NormalizedWhatsAppStatusEvent,
  incomingErrors: string[],
): WhatsAppDeliveryReduction {
  const observedRecipientId = recipientId(event.recipient_id);
  const resolvedRecipientId = observedRecipientId || state.recipient_id;
  const providerTimestamp = text(event.timestamp) || state.provider_timestamp;
  const next: WhatsAppDeliveryState = {
    ...state,
    phase: "uncertain",
    ...(resolvedRecipientId ? { recipient_id: resolvedRecipientId } : {}),
    ...(providerTimestamp ? { provider_timestamp: providerTimestamp } : {}),
    error_codes: mergeErrors(
      ["WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS"],
      state.error_codes,
      incomingErrors,
    ),
    last_status_event_id: event.event_id,
    conflict_code: "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS",
  };
  return {
    state: next,
    changed:
      state.phase !== next.phase ||
      state.last_status_event_id !== next.last_status_event_id ||
      state.provider_timestamp !== next.provider_timestamp ||
      state.recipient_id !== next.recipient_id ||
      !sameArray(state.error_codes, next.error_codes) ||
      state.conflict_code !== next.conflict_code,
  };
}

/**
 * Converts an already-observed send outcome into local delivery state. A local
 * attempt id is always required. Provider message identity is stored only when
 * Meta actually returned one; failed/uncertain attempts never invent a fake
 * provider id that could later collide with a real status webhook. A recipient,
 * when supplied from the outbound request, becomes a locked delivery identity.
 */
export function createWhatsAppDeliveryState(input: {
  attemptId: unknown;
  wabaId: unknown;
  phoneNumberId: unknown;
  outcome: WhatsAppSendOutcome;
  recipientId?: unknown;
}): WhatsAppDeliveryState {
  assertWhatsAppDeliveryCreateInputStructure(input);
  const attemptId = localAttemptId(input.attemptId);
  const wabaId = numericId(input.wabaId, "WhatsApp business account id");
  const phoneNumberId = numericId(input.phoneNumberId, "WhatsApp phone number id");
  const normalizedRecipientId = recipientId(input.recipientId);

  if (input.outcome.status === "sent") {
    return {
      local_attempt_id: attemptId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      external_message_id: messageId(input.outcome.provider_message_id),
      phase: "sent",
      ...(normalizedRecipientId ? { recipient_id: normalizedRecipientId } : {}),
      error_codes: [],
    };
  }

  return {
    local_attempt_id: attemptId,
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    phase: input.outcome.status === "confirmed_failed" ? "failed" : "uncertain",
    ...(normalizedRecipientId ? { recipient_id: normalizedRecipientId } : {}),
    error_codes: [input.outcome.code],
  };
}

function assertEventMatchesState(
  state: WhatsAppDeliveryState,
  event: NormalizedWhatsAppStatusEvent,
): void {
  if (
    state.waba_id !== event.waba_id ||
    state.phone_number_id !== event.phone_number_id
  ) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_MAPPING_MISMATCH",
      "WhatsApp status event does not belong to the supplied delivery channel",
    );
  }
  if (!state.external_message_id) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_PROVIDER_ID_UNAVAILABLE",
      "WhatsApp delivery has no confirmed provider message identity",
    );
  }
  if (state.external_message_id !== event.external_message_id) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_MAPPING_MISMATCH",
      "WhatsApp status event does not belong to the supplied delivery",
    );
  }

  const expectedRecipientId = recipientId(state.recipient_id);
  const observedRecipientId = recipientId(event.recipient_id);
  if (
    expectedRecipientId &&
    observedRecipientId &&
    expectedRecipientId !== observedRecipientId
  ) {
    throw lifecycleError(
      "WHATSAPP_DELIVERY_RECIPIENT_MISMATCH",
      "WhatsApp status event belongs to a different recipient",
    );
  }
}

/**
 * Applies a normalized provider status to an existing local delivery state.
 * Successful states advance monotonically. Confirmed failure may follow `sent`
 * but conflicts with `delivered`/`read`; success after failure is also a
 * conflict. Once uncertainty is reached, webhook observations cannot silently
 * clear it and manual/provider reconciliation is required. A known recipient
 * is immutable: a provider status for another recipient fails closed.
 */
export function reduceWhatsAppDeliveryStatus(
  state: WhatsAppDeliveryState,
  event: NormalizedWhatsAppStatusEvent,
): WhatsAppDeliveryReduction {
  assertWhatsAppDeliveryStateStructure(state);
  assertWhatsAppNormalizedStatusEventStructure(event);
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
  const resolvedRecipientId = recipientId(event.recipient_id) || state.recipient_id;
  const providerTimestamp = text(event.timestamp) || state.provider_timestamp;

  if (state.phase === "uncertain") {
    const next: WhatsAppDeliveryState = {
      ...state,
      ...(resolvedRecipientId ? { recipient_id: resolvedRecipientId } : {}),
      ...(providerTimestamp ? { provider_timestamp: providerTimestamp } : {}),
      error_codes: mergeErrors(state.error_codes, incomingErrors),
      last_status_event_id: event.event_id,
    };
    return {
      state: next,
      changed:
        state.last_status_event_id !== next.last_status_event_id ||
        state.provider_timestamp !== next.provider_timestamp ||
        state.recipient_id !== next.recipient_id ||
        !sameArray(state.error_codes, next.error_codes),
    };
  }

  if (state.phase === "failed" && incomingPhase !== "failed") {
    return contradictoryState(state, event, incomingErrors);
  }

  if (
    incomingPhase === "failed" &&
    (state.phase === "delivered" || state.phase === "read")
  ) {
    return contradictoryState(state, event, incomingErrors);
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
      ...(resolvedRecipientId ? { recipient_id: resolvedRecipientId } : {}),
      ...(providerTimestamp ? { provider_timestamp: providerTimestamp } : {}),
      error_codes: nextErrors.slice(0, MAX_DELIVERY_ERROR_CODES),
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
    ...(resolvedRecipientId ? { recipient_id: resolvedRecipientId } : {}),
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
