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
      action: "new_attempt_permitted";
      automatic_retry_allowed: false;
      new_attempt_allowed: true;
      reason: "confirmed_failure_changed_request_explicitly_approved";
      next_attempt_number: number;
    };

function retryError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Prevents blind resend after any ambiguous provider interaction. Even a
 * confirmed failure never enables automatic retry: a new attempt is permitted
 * only when an operator/workflow explicitly approves it AND the request
 * fingerprint changed, which protects a worker restart from duplicating the
 * same logical send.
 */
export function decideWhatsAppRetry(input: {
  outcome: WhatsAppSendOutcome;
  currentAttemptNumber: unknown;
  explicitRetryApproved?: boolean;
  requestFingerprintChanged?: boolean;
}): WhatsAppRetryDecision {
  const attempt = Number(input.currentAttemptNumber);
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt >= 100) {
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
      action: "new_attempt_permitted",
      automatic_retry_allowed: false,
      new_attempt_allowed: true,
      reason: "confirmed_failure_changed_request_explicitly_approved",
      next_attempt_number: attempt + 1,
    };
  }

  return {
    action: "terminal_failure",
    automatic_retry_allowed: false,
    new_attempt_allowed: false,
    reason: "confirmed_failure_requires_changed_request_and_explicit_approval",
  };
}
