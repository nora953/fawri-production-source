import type { WhatsAppSendOutcome } from "./whatsappOfflineContracts";

export type WhatsAppRetryDecision =
  | {
      action: "complete";
      automatic_retry_allowed: false;
      new_attempt_allowed: false;
      reason: "provider_send_confirmed";
    }
  | {
      action: "reconcile_before_any_retry";
      automatic_retry_allowed: false;
      new_attempt_allowed: false;
      reason: "send_outcome_uncertain";
    }
  | {
      action: "terminal_failure";
      automatic_retry_allowed: false;
      new_attempt_allowed: false;
      reason: "confirmed_failure_requires_changed_request_and_explicit_approval";
    }
  | {
      action: "new_reply_intent_required";
      automatic_retry_allowed: false;
      new_attempt_allowed: false;
      reason: "confirmed_failure_changed_request_requires_new_reply_intent";
    };

function retryError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Prevents blind resend after any ambiguous provider interaction. The canonical
 * `outbound_deliveries` authority allows one persisted delivery per
 * merchant/inbound-event/reply-intent, so even a confirmed failure never
 * authorizes a second attempt under the same reply intent. If an operator
 * explicitly approves a materially changed request, the caller must create a
 * new reply intent/workflow identity before any future send can be considered.
 */
export function decideWhatsAppRetry(input: {
  outcome: WhatsAppSendOutcome;
  currentAttemptNumber: unknown;
  explicitRetryApproved?: boolean;
  requestFingerprintChanged?: boolean;
}): WhatsAppRetryDecision {
  const attempt = Number(input.currentAttemptNumber);
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 100) {
    throw retryError(
      "WHATSAPP_RETRY_ATTEMPT_INVALID",
      "WhatsApp retry attempt number is invalid",
    );
  }

  if (input.outcome.status === "sent") {
    return {
      action: "complete",
      automatic_retry_allowed: false,
      new_attempt_allowed: false,
      reason: "provider_send_confirmed",
    };
  }

  if (input.outcome.status === "uncertain") {
    return {
      action: "reconcile_before_any_retry",
      automatic_retry_allowed: false,
      new_attempt_allowed: false,
      reason: "send_outcome_uncertain",
    };
  }

  if (
    input.explicitRetryApproved === true &&
    input.requestFingerprintChanged === true
  ) {
    return {
      action: "new_reply_intent_required",
      automatic_retry_allowed: false,
      new_attempt_allowed: false,
      reason: "confirmed_failure_changed_request_requires_new_reply_intent",
    };
  }

  return {
    action: "terminal_failure",
    automatic_retry_allowed: false,
    new_attempt_allowed: false,
    reason: "confirmed_failure_requires_changed_request_and_explicit_approval",
  };
}
