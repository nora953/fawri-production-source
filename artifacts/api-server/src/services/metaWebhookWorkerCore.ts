import type { DurableJob } from "./durableJobQueue";
import {
  getMetaWebhookReplyOutcome,
  removeFailedMetaWebhookAttempt,
} from "./metaWebhookOutcome";
import { getMetaWebhookInternalReplayHeaders } from "./metaWebhookInternalReplay";
import { refundMerchantAutoReply } from "./merchantReplyRefund";

const INTERNAL_REQUEST_TIMEOUT_MS = 30_000;

function text(value: unknown): string {
  return String(value || "").trim();
}

function jobError(
  code: string,
  message: string,
  retryable: boolean,
): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error(message), { code, retryable });
}

function payloadRecord(job: DurableJob): Record<string, unknown> {
  if (!job.payload || typeof job.payload !== "object") {
    throw jobError("META_JOB_PAYLOAD_INVALID", "Meta job payload is invalid", false);
  }
  return job.payload;
}

function validateJob(job: DurableJob): {
  eventId: string;
  merchantId: string;
  externalMessageId: string;
  webhookBody: Record<string, unknown>;
} {
  const payload = payloadRecord(job);
  const eventId = text(payload.event_id);
  const merchantId = text(payload.merchant_id || job.merchant_id);
  const externalMessageId = text(payload.external_message_id);
  const webhookBody =
    payload.webhook_body &&
    typeof payload.webhook_body === "object" &&
    !Array.isArray(payload.webhook_body)
      ? (payload.webhook_body as Record<string, unknown>)
      : null;

  if (!eventId || !merchantId || !externalMessageId || !webhookBody) {
    throw jobError(
      "META_JOB_PAYLOAD_INVALID",
      "Meta job identity or webhook body is missing",
      false,
    );
  }
  return { eventId, merchantId, externalMessageId, webhookBody };
}

function inspectOutcome(merchantId: string, externalMessageId: string) {
  return getMetaWebhookReplyOutcome({ merchantId, externalMessageId });
}

export async function processMetaReplyJob(
  job: DurableJob,
  internalWebhookUrl: string,
): Promise<Record<string, unknown>> {
  const { eventId, merchantId, externalMessageId, webhookBody } = validateJob(job);

  const before = inspectOutcome(merchantId, externalMessageId);
  if (before.status === "sent") {
    return {
      event_id: eventId,
      delivery_status: "sent",
      conversation_id: before.conversationId,
      recovered_from_existing_result: true,
    };
  }
  if (before.status === "failed") {
    removeFailedMetaWebhookAttempt({ merchantId, externalMessageId });
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    INTERNAL_REQUEST_TIMEOUT_MS,
  );
  timeout.unref();

  let response: Response;
  try {
    response = await fetch(internalWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getMetaWebhookInternalReplayHeaders(),
      },
      body: JSON.stringify(webhookBody),
      signal: controller.signal,
    });
  } catch (error) {
    const afterFailure = inspectOutcome(merchantId, externalMessageId);
    if (afterFailure.status === "sent") {
      return {
        event_id: eventId,
        delivery_status: "sent",
        conversation_id: afterFailure.conversationId,
        recovered_after_transport_error: true,
      };
    }
    if (afterFailure.status === "failed") {
      throw jobError(
        "META_REPLY_FAILED",
        "Messenger reply failed and can be retried safely",
        true,
      );
    }
    throw jobError(
      "META_REPLY_OUTCOME_UNCERTAIN",
      `Meta internal replay outcome is uncertain: ${String(error)}`,
      false,
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.json().catch(() => null);
  const outcome = inspectOutcome(merchantId, externalMessageId);
  if (outcome.status === "sent") {
    return {
      event_id: eventId,
      delivery_status: "sent",
      conversation_id: outcome.conversationId,
      internal_status: response.status,
    };
  }
  if (outcome.status === "failed") {
    throw jobError(
      "META_REPLY_FAILED",
      "Messenger reply failed and can be retried safely",
      true,
    );
  }

  if (!response.ok) {
    const responseCode = text(
      responseBody && typeof responseBody === "object"
        ? (responseBody as Record<string, unknown>).code
        : "",
    );
    const responseError = text(
      responseBody && typeof responseBody === "object"
        ? (responseBody as Record<string, unknown>).error
        : "",
    );
    if (response.status >= 500) {
      throw jobError(
        responseCode || "META_INTERNAL_REPLAY_UNAVAILABLE",
        responseError || `Meta internal replay returned ${response.status}`,
        true,
      );
    }
    throw jobError(
      responseCode || "META_INTERNAL_REPLAY_REJECTED",
      responseError || `Meta internal replay returned ${response.status}`,
      false,
    );
  }

  throw jobError(
    "META_REPLY_OUTCOME_UNCERTAIN",
    "Meta internal replay completed without a confirmed reply outcome",
    false,
  );
}

export function handleMetaDeadLetter(job: DurableJob): void {
  const payload = job.payload || {};
  const eventId = text(payload.event_id || job.dedupe_key);
  const merchantId = text(payload.merchant_id || job.merchant_id);
  const externalMessageId = text(payload.external_message_id);

  if (job.last_error_code === "META_REPLY_FAILED" && eventId) {
    try {
      const refund = refundMerchantAutoReply(eventId);
      if (refund.refunded && merchantId && externalMessageId) {
        removeFailedMetaWebhookAttempt({ merchantId, externalMessageId });
      }
      console.error("Meta reply moved to DLQ after confirmed failures", {
        job_id: job.id,
        event_id: eventId,
        merchant_id: merchantId,
        attempts: job.attempts,
        refund,
      });
      return;
    } catch (error) {
      console.error("Meta reply DLQ refund failed", {
        job_id: job.id,
        event_id: eventId,
        merchant_id: merchantId,
        error,
      });
      return;
    }
  }

  console.error("Meta reply moved to DLQ without automatic refund", {
    job_id: job.id,
    event_id: eventId,
    merchant_id: merchantId,
    attempts: job.attempts,
    error_code: job.last_error_code,
    reason: "delivery outcome was not a confirmed safe failure",
  });
}
