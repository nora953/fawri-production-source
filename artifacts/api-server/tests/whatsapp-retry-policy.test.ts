import assert from "node:assert/strict";
import test from "node:test";
import {
  decideWhatsAppRetry,
} from "../src/services/whatsappRetryPolicy";

test("confirmed send is complete and never retryable", () => {
  const result = decideWhatsAppRetry({
    outcome: { status: "sent", provider_message_id: "wamid.1" },
    currentAttemptNumber: 1,
  });
  assert.deepEqual(result, {
    action: "complete",
    automatic_retry_allowed: false,
    new_attempt_allowed: false,
    reason: "provider_send_confirmed",
  });
});

test("uncertain send always blocks retry until reconciliation", () => {
  const result = decideWhatsAppRetry({
    outcome: { status: "uncertain", code: "WHATSAPP_GRAPH_HTTP_503", http_status: 503 },
    currentAttemptNumber: 1,
    explicitRetryApproved: true,
    requestFingerprintChanged: true,
  });
  assert.equal(result.action, "reconcile_before_any_retry");
  assert.equal(result.automatic_retry_allowed, false);
  assert.equal(result.new_attempt_allowed, false);
});

test("confirmed failure does not allow a blind same-request retry", () => {
  const outcome = {
    status: "confirmed_failed" as const,
    code: "WHATSAPP_GRAPH_HTTP_400_100",
    http_status: 400,
  };
  for (const input of [
    {},
    { explicitRetryApproved: true },
    { requestFingerprintChanged: true },
    { explicitRetryApproved: true, requestFingerprintChanged: false },
  ]) {
    const result = decideWhatsAppRetry({
      outcome,
      currentAttemptNumber: 2,
      ...input,
    });
    assert.equal(result.action, "terminal_failure");
    assert.equal(result.new_attempt_allowed, false);
    assert.equal(result.automatic_retry_allowed, false);
  }
});

test("approved changed request requires a new reply intent instead of a second persisted attempt", () => {
  const result = decideWhatsAppRetry({
    outcome: {
      status: "confirmed_failed",
      code: "WHATSAPP_GRAPH_HTTP_400_100",
      http_status: 400,
    },
    currentAttemptNumber: 2,
    explicitRetryApproved: true,
    requestFingerprintChanged: true,
  });
  assert.deepEqual(result, {
    action: "new_reply_intent_required",
    automatic_retry_allowed: false,
    new_attempt_allowed: false,
    reason: "confirmed_failure_changed_request_requires_new_reply_intent",
  });
});

test("retry attempt identity remains bounded even though same-intent resend is never authorized", () => {
  assert.throws(
    () =>
      decideWhatsAppRetry({
        outcome: {
          status: "confirmed_failed",
          code: "WHATSAPP_GRAPH_HTTP_400_100",
          http_status: 400,
        },
        currentAttemptNumber: 101,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_RETRY_ATTEMPT_INVALID",
  );
});
