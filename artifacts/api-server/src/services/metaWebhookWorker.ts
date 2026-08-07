import os from "node:os";
import {
  blockDeadLetterJobRequeue,
  enqueueDurableJob,
  listDurableJobs,
  startDurableJobWorker,
  type DurableJob,
  type DurableJobWorker,
  type ExpiredJobResolution,
} from "./durableJobQueue";
import {
  getMetaWebhookReplyOutcome,
  removeFailedMetaWebhookAttempt,
} from "./metaWebhookOutcome";
import { getMetaWebhookInternalReplayHeaders } from "./metaWebhookInternalReplay";
import { refundMerchantAutoReply } from "./merchantReplyRefund";
import { merchantAllowsAutoReply } from "./merchantSettingsRuntime";
import { getMerchantOperationalDecision } from "./merchantOperationalAccess";
import { createMetaChannelDisconnectHandler } from "./metaChannelJobs";

const META_REPLY_JOB_TYPE = "meta.webhook.reply";
const META_EVENT_JOB_TYPE = "meta.webhook.event";
const META_TERMINAL_JOB_TYPE = "meta.webhook.terminal";
const META_CHANNEL_DISCONNECT_JOB_TYPE = "meta.channel.disconnect";
const META_REPLY_REFUND_JOB_TYPE = "meta.reply.refund";
const INTERNAL_REQUEST_TIMEOUT_MS = 30_000;

function text(value: unknown): string {
  return String(value || "").trim();
}
function jobError(
  code: string,
  safeMessage: string,
  retryable: boolean,
  requeueSafe = retryable,
): Error & { code: string; retryable: boolean; requeueSafe: boolean; safeMessage: string } {
  return Object.assign(new Error(safeMessage), {
    code,
    retryable,
    requeueSafe,
    safeMessage,
  });
}
function validateJob(job: DurableJob): {
  eventId: string;
  merchantId: string;
  externalMessageId: string;
  webhookBody: Record<string, unknown>;
} {
  const payload = job.payload || {};
  const eventId = text(payload.event_id);
  const merchantId = text(payload.merchant_id || job.merchant_id);
  const externalMessageId = text(payload.external_message_id);
  const webhookBody = payload.webhook_body &&
    typeof payload.webhook_body === "object" &&
    !Array.isArray(payload.webhook_body)
      ? (payload.webhook_body as Record<string, unknown>)
      : null;
  if (!eventId || !merchantId || !externalMessageId || !webhookBody) {
    throw jobError("META_JOB_PAYLOAD_INVALID", "Meta job identity is invalid", false, false);
  }
  return { eventId, merchantId, externalMessageId, webhookBody };
}

async function processMetaReplyJob(
  job: DurableJob,
  internalWebhookUrl: string,
): Promise<Record<string, unknown>> {
  const { eventId, merchantId, externalMessageId, webhookBody } = validateJob(job);

  const access = getMerchantOperationalDecision(merchantId);
  if (!access.allowed) {
    if (access.code === "MERCHANT_ACCESS_STATE_UNAVAILABLE") {
      throw jobError(access.code, access.error, true, true);
    }
    return {
      event_id: eventId,
      delivery_status: "suppressed",
      suppression_code: access.code,
    };
  }

  try {
    if (!merchantAllowsAutoReply(merchantId)) {
      return {
        event_id: eventId,
        delivery_status: "suppressed",
        suppression_code: "MERCHANT_AUTO_REPLY_DISABLED",
      };
    }
  } catch {
    throw jobError(
      "MERCHANT_SETTINGS_UNAVAILABLE",
      "merchant auto-reply setting is unavailable",
      true,
      true,
    );
  }

  const before = getMetaWebhookReplyOutcome({ merchantId, externalMessageId });
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
  const timeout = setTimeout(() => controller.abort(), INTERNAL_REQUEST_TIMEOUT_MS);
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
  } catch {
    const outcome = getMetaWebhookReplyOutcome({ merchantId, externalMessageId });
    if (outcome.status === "sent") {
      return {
        event_id: eventId,
        delivery_status: "sent",
        conversation_id: outcome.conversationId,
        recovered_after_transport_error: true,
      };
    }
    if (outcome.status === "failed") {
      throw jobError("META_REPLY_FAILED", "Messenger reply failed", true, true);
    }
    throw jobError(
      "META_REPLY_OUTCOME_UNCERTAIN",
      "Meta reply outcome is uncertain",
      false,
      false,
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.json().catch(() => null);
  const outcome = getMetaWebhookReplyOutcome({ merchantId, externalMessageId });
  if (outcome.status === "sent") {
    return {
      event_id: eventId,
      delivery_status: "sent",
      conversation_id: outcome.conversationId,
      internal_status: response.status,
    };
  }
  if (outcome.status === "failed") {
    throw jobError("META_REPLY_FAILED", "Messenger reply failed", true, true);
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
        responseError || "Meta internal replay is unavailable",
        true,
        true,
      );
    }
    throw jobError(
      responseCode || "META_INTERNAL_REPLAY_REJECTED",
      responseError || "Meta internal replay was rejected",
      false,
      false,
    );
  }

  throw jobError(
    "META_REPLY_OUTCOME_UNCERTAIN",
    "Meta internal replay completed without a confirmed outcome",
    false,
    false,
  );
}

function reconcileExpiredMetaJob(job: DurableJob): ExpiredJobResolution {
  if (job.type === META_REPLY_REFUND_JOB_TYPE) {
    try {
      return { action: "complete", result: processMetaReplyRefundJob(job) };
    } catch (error) {
      const failure = error as {
        code?: unknown;
        safeMessage?: unknown;
        retryable?: unknown;
      };
      return failure.retryable !== false
        ? {
            action: "retry",
            code: text(failure.code) || "META_REPLY_REFUND_UNAVAILABLE",
            message: text(failure.safeMessage) || "Meta reply refund is unavailable",
          }
        : {
            action: "dead_letter",
            code: text(failure.code) || "META_REPLY_REFUND_RECONCILIATION_FAILED",
            message:
              text(failure.safeMessage) ||
              "Meta reply refund could not be reconciled safely",
          };
    }
  }
  if (job.type === META_CHANNEL_DISCONNECT_JOB_TYPE) {
    return {
      action: "retry",
      code: "META_CHANNEL_DISCONNECT_CLAIM_EXPIRED",
      message: "channel disconnect is idempotent and will be retried after an expired claim",
    };
  }
  if (job.type !== META_REPLY_JOB_TYPE) {
    return { action: "complete", result: { recovered_terminal_job: true } };
  }
  try {
    const { merchantId, externalMessageId, eventId } = validateJob(job);
    const outcome = getMetaWebhookReplyOutcome({ merchantId, externalMessageId });
    if (outcome.status === "sent") {
      return {
        action: "complete",
        result: {
          event_id: eventId,
          delivery_status: "sent",
          conversation_id: outcome.conversationId,
          recovered_after_worker_crash: true,
        },
      };
    }
    if (outcome.status === "failed") {
      return {
        action: "retry",
        code: "META_REPLY_FAILED",
        message: "confirmed failed reply recovered after worker crash",
      };
    }
    return {
      action: "dead_letter",
      code: "META_REPLY_OUTCOME_UNCERTAIN",
      message: "worker crashed before reply outcome could be confirmed",
    };
  } catch {
    return {
      action: "dead_letter",
      code: "META_JOB_RECONCILIATION_INVALID",
      message: "expired Meta job could not be reconciled",
    };
  }
}

function processMetaReplyRefundJob(job: DurableJob): Record<string, unknown> {
  const eventId = text(job.payload?.event_id || job.dedupe_key);
  if (!eventId) {
    throw jobError(
      "META_REFUND_JOB_INVALID",
      "Meta refund job identity is invalid",
      false,
      false,
    );
  }

  let refund;
  try {
    refund = refundMerchantAutoReply(eventId, "META_REPLY_FAILED");
  } catch {
    throw jobError(
      "META_REPLY_REFUND_UNAVAILABLE",
      "Meta reply refund is temporarily unavailable",
      true,
      true,
    );
  }

  if (refund.refunded || refund.reason === "already_refunded") {
    return {
      event_id: eventId,
      refund_status: refund.refunded ? "refunded" : "already_refunded",
    };
  }
  if (refund.reason === "refund_balance_conflict") {
    throw jobError(
      "META_REPLY_REFUND_CONFLICT",
      "Meta reply refund balance requires manual reconciliation",
      false,
      false,
    );
  }
  if (refund.reason === "reservation_not_found" || refund.reason === "subscription_not_found") {
    throw jobError(
      "META_REPLY_REFUND_STATE_MISSING",
      "Meta reply refund state is unavailable",
      true,
      true,
    );
  }
  throw jobError(
    "META_REPLY_REFUND_REJECTED",
    "Meta reply refund could not be applied",
    false,
    false,
  );
}

function enqueueConfirmedFailureRefund(job: DurableJob): void {
  const eventId = text(job.payload?.event_id || job.dedupe_key);
  const merchantId = text(job.payload?.merchant_id || job.merchant_id);
  if (!eventId) return;
  blockDeadLetterJobRequeue(job.id);
  enqueueDurableJob({
    type: META_REPLY_REFUND_JOB_TYPE,
    dedupeKey: `meta-refund:${eventId}`,
    merchantId,
    priority: 100,
    maxAttempts: 10,
    payload: { event_id: eventId, merchant_id: merchantId },
  });
}

function recoverMissingRefundJobs(): void {
  for (const job of listDurableJobs("dead_letter")) {
    if (
      job.type === META_REPLY_JOB_TYPE &&
      job.last_error_code === "META_REPLY_FAILED"
    ) {
      enqueueConfirmedFailureRefund(job);
    }
  }
}

function handleMetaDeadLetter(job: DurableJob): void {
  const eventId = text(job.payload?.event_id || job.dedupe_key);
  const merchantId = text(job.payload?.merchant_id || job.merchant_id);
  const externalMessageId = text(job.payload?.external_message_id);

  if (
    job.last_error_code === "META_REPLY_FAILED" &&
    job.requeue_policy === "safe" &&
    eventId
  ) {
    try {
      enqueueConfirmedFailureRefund(job);
      if (merchantId && externalMessageId) {
        removeFailedMetaWebhookAttempt({ merchantId, externalMessageId });
      }
      console.error("Meta reply moved to DLQ after confirmed failure", {
        job_id: job.id,
        merchant_id: merchantId,
        attempts: job.attempts,
        refund_job_enqueued: true,
      });
    } catch {
      console.error("Meta reply refund enqueue failed", {
        job_id: job.id,
        merchant_id: merchantId,
      });
    }
    return;
  }

  console.error("Meta reply moved to DLQ without refund", {
    job_id: job.id,
    merchant_id: merchantId,
    attempts: job.attempts,
    error_code: job.last_error_code,
    requeue_policy: job.requeue_policy,
  });
}

export function startMetaWebhookWorker(port: number): DurableJobWorker {
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("a valid API port is required for the Meta webhook worker");
  }
  const workerId = `meta-worker:${os.hostname()}:${process.pid}`;
  const internalWebhookUrl = `http://127.0.0.1:${port}/api/meta/webhook`;
  const disconnectMetaChannel = createMetaChannelDisconnectHandler();
  recoverMissingRefundJobs();

  return startDurableJobWorker({
    workerId,
    pollIntervalMs: Number(process.env.FAWRI_JOB_POLL_INTERVAL_MS || 500),
    visibilityTimeoutMs: Number(
      process.env.FAWRI_JOB_VISIBILITY_TIMEOUT_MS || 5 * 60 * 1000,
    ),
    handlers: {
      [META_REPLY_JOB_TYPE]: (job) => processMetaReplyJob(job, internalWebhookUrl),
      [META_EVENT_JOB_TYPE]: async (job) => ({
        event_id: text(job.payload?.event_id || job.dedupe_key),
        delivery_status: "ignored_non_reply_event",
      }),
      [META_TERMINAL_JOB_TYPE]: async (job) => ({
        event_id: text(job.payload?.event_id || job.dedupe_key),
        delivery_status: "terminal_no_reply",
      }),
      [META_CHANNEL_DISCONNECT_JOB_TYPE]: disconnectMetaChannel,
      [META_REPLY_REFUND_JOB_TYPE]: async (job) => processMetaReplyRefundJob(job),
    },
    reconcileExpiredJob: reconcileExpiredMetaJob,
    onDeadLetter: handleMetaDeadLetter,
  });
}
