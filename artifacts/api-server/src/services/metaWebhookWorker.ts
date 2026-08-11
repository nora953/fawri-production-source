import os from "node:os";
import {
  type DurableJob,
  type DurableJobWorker,
  type ExpiredJobResolution,
} from "./durableJobQueue";
import {
  blockDeadLetterJobRequeueAuthoritative,
  enqueueDurableJobAuthoritative,
  listDurableJobsAuthoritative,
  startDurableJobWorkerAuthoritative,
} from "./postgresDurableJobQueue";
import { removeFailedMetaWebhookAttempt } from "./metaWebhookOutcome";
import { refundMerchantAutoReplyAuthoritative } from "./merchantReplyRefundAuthority";
import { createMetaChannelDisconnectHandler } from "./metaChannelJobs";
import { merchantAllowsAutoReplyAuthoritative } from "./postgresMerchantSettingsAuthority";
import {
  processMetaReplyJob,
  reconcileMetaReplyJob,
  type MetaReplyLifecycleHooks,
} from "./metaWebhookWorkerCore";
import {
  createFakeMetaWebhookReplyTransport,
  type MetaWebhookReplyTransport,
} from "./metaWebhookFakeTransport";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";
import { subscriptionPostgresAuthorityRequired } from "./postgresSubscriptionEntitlement";
import {
  preparePostgresMetaAutoReply,
  suppressPreparedPostgresMetaAutoReply,
} from "./postgresMetaAutoReplyIntent";
import {
  createPostgresMetaWebhookReplyTransport,
  reconcilePostgresMetaReplyJob,
} from "./postgresMetaWebhookReplyTransport";

const META_REPLY_JOB_TYPE = "meta.webhook.reply";
const META_EVENT_JOB_TYPE = "meta.webhook.event";
const META_TERMINAL_JOB_TYPE = "meta.webhook.terminal";
const META_CHANNEL_DISCONNECT_JOB_TYPE = "meta.channel.disconnect";
const META_REPLY_REFUND_JOB_TYPE = "meta.reply.refund";

type MetaReplyTransportMode = "fake" | "live";

function text(value: unknown): string {
  return String(value || "").trim();
}

function jobError(
  code: string,
  safeMessage: string,
  retryable: boolean,
  requeueSafe = retryable,
): Error & {
  code: string;
  retryable: boolean;
  requeueSafe: boolean;
  safeMessage: string;
} {
  return Object.assign(new Error(safeMessage), {
    code,
    retryable,
    requeueSafe,
    safeMessage,
  });
}

function readMetaReplyTransportMode(): MetaReplyTransportMode {
  const selected = text(process.env.FAWRI_META_REPLY_TRANSPORT).toLowerCase();
  if (!selected || selected === "fake") return "fake";
  if (selected === "live") return "live";
  throw jobError(
    "META_REPLY_TRANSPORT_CONFIG_INVALID",
    "Meta reply transport selection is invalid",
    false,
    false,
  );
}

function assertLiveMetaReplyTransportReady(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw jobError(
      "META_LIVE_OPERATIONAL_POSTGRES_REQUIRED",
      "live Meta replies require PostgreSQL operational authority",
      false,
      false,
    );
  }
  if (!subscriptionPostgresAuthorityRequired()) {
    throw jobError(
      "META_LIVE_SUBSCRIPTION_POSTGRES_REQUIRED",
      "live Meta replies require PostgreSQL subscription authority",
      false,
      false,
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    text(process.env.FAWRI_META_CREDENTIAL_PROVIDER).toLowerCase() !== "aws-kms"
  ) {
    throw jobError(
      "META_LIVE_PRODUCTION_CREDENTIAL_PROVIDER_REQUIRED",
      "production live Meta replies require the production credential provider",
      false,
      false,
    );
  }
}

async function processMetaReplyRefundJob(
  job: DurableJob,
): Promise<Record<string, unknown>> {
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
    refund = await refundMerchantAutoReplyAuthoritative(
      eventId,
      "META_REPLY_FAILED",
    );
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
  if (
    refund.reason === "reservation_not_found" ||
    refund.reason === "subscription_not_found"
  ) {
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

async function processFakeMetaReplyJob(
  job: DurableJob,
  replyTransport: MetaWebhookReplyTransport,
  hooks?: MetaReplyLifecycleHooks,
): Promise<Record<string, unknown>> {
  const merchantId = text(job.payload?.merchant_id || job.merchant_id);
  const eventId = text(job.payload?.event_id || job.dedupe_key);
  if (merchantId) {
    let enabled: boolean;
    try {
      enabled = await merchantAllowsAutoReplyAuthoritative(merchantId);
    } catch {
      throw jobError(
        "MERCHANT_SETTINGS_UNAVAILABLE",
        "merchant settings are unavailable",
        true,
        true,
      );
    }
    if (!enabled) {
      return {
        event_id: eventId,
        delivery_status: "suppressed",
        suppression_code: "MERCHANT_AUTO_REPLY_DISABLED",
      };
    }
  }
  return processMetaReplyJob(job, {
    transport: replyTransport,
    hooks,
  });
}

async function processLiveMetaReplyJob(
  job: DurableJob,
  hooks?: MetaReplyLifecycleHooks,
): Promise<Record<string, unknown>> {
  let prepared;
  try {
    prepared = await preparePostgresMetaAutoReply(job);
  } catch (error) {
    const code = text((error as { code?: unknown } | undefined)?.code);
    throw jobError(
      code || "META_REPLY_DECISION_UNAVAILABLE",
      "Meta reply preparation is temporarily unavailable",
      true,
      true,
    );
  }

  if (prepared.action === "suppress") {
    return {
      event_id: prepared.eventId,
      conversation_id: prepared.conversationId,
      delivery_status: "suppressed",
      suppression_code: prepared.code,
      credit_consumed: false,
    };
  }

  let transport: MetaWebhookReplyTransport;
  try {
    transport = await createPostgresMetaWebhookReplyTransport({ prepared });
  } catch (error) {
    const code = text((error as { code?: unknown } | undefined)?.code);
    throw jobError(
      code || "META_LIVE_TRANSPORT_UNAVAILABLE",
      "live Meta reply transport is temporarily unavailable",
      true,
      true,
    );
  }

  const result = await processMetaReplyJob(job, { transport, hooks });
  if (result.delivery_status === "suppressed") {
    try {
      await suppressPreparedPostgresMetaAutoReply({
        merchantId: prepared.merchantId,
        replyMessageId: prepared.replyMessageId,
        conversationId: prepared.conversationId,
      });
    } catch {
      throw jobError(
        "META_REPLY_SUPPRESSION_COMMIT_FAILED",
        "suppressed Meta reply could not be finalized safely",
        false,
        false,
      );
    }
  }
  return {
    ...result,
    conversation_id: prepared.conversationId,
  };
}

async function reconcileExpiredMetaJob(
  job: DurableJob,
  mode: MetaReplyTransportMode,
  replyTransport: MetaWebhookReplyTransport | null,
): Promise<ExpiredJobResolution> {
  if (job.type === META_REPLY_REFUND_JOB_TYPE) {
    try {
      return { action: "complete", result: await processMetaReplyRefundJob(job) };
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
            message:
              text(failure.safeMessage) || "Meta reply refund is unavailable",
          }
        : {
            action: "dead_letter",
            code:
              text(failure.code) || "META_REPLY_REFUND_RECONCILIATION_FAILED",
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
      message:
        "channel disconnect is idempotent and will be retried after an expired claim",
    };
  }
  if (job.type === META_REPLY_JOB_TYPE) {
    if (mode === "live") return reconcilePostgresMetaReplyJob(job);
    if (!replyTransport) {
      return {
        action: "dead_letter",
        code: "META_REPLY_TRANSPORT_UNAVAILABLE",
        message: "Meta reply transport is unavailable for reconciliation",
      };
    }
    return reconcileMetaReplyJob(job, replyTransport);
  }
  return { action: "complete", result: { recovered_terminal_job: true } };
}

async function enqueueConfirmedFailureRefund(job: DurableJob): Promise<void> {
  const eventId = text(job.payload?.event_id || job.dedupe_key);
  const merchantId = text(job.payload?.merchant_id || job.merchant_id);
  if (!eventId || !merchantId) return;
  await blockDeadLetterJobRequeueAuthoritative(job.id, merchantId);
  await enqueueDurableJobAuthoritative({
    type: META_REPLY_REFUND_JOB_TYPE,
    dedupeKey: `meta-refund:${eventId}`,
    merchantId,
    priority: 100,
    maxAttempts: 10,
    payload: { event_id: eventId, merchant_id: merchantId },
  });
}

async function recoverMissingRefundJobs(): Promise<void> {
  for (const job of await listDurableJobsAuthoritative("dead_letter")) {
    if (
      job.type === META_REPLY_JOB_TYPE &&
      job.last_error_code === "META_REPLY_FAILED"
    ) {
      await enqueueConfirmedFailureRefund(job);
    }
  }
}

async function handleMetaDeadLetter(job: DurableJob): Promise<void> {
  const eventId = text(job.payload?.event_id || job.dedupe_key);
  const merchantId = text(job.payload?.merchant_id || job.merchant_id);
  const externalMessageId = text(job.payload?.external_message_id);

  if (
    job.last_error_code === "META_REPLY_FAILED" &&
    job.requeue_policy === "safe" &&
    eventId
  ) {
    try {
      await enqueueConfirmedFailureRefund(job);
      if (!operationalPostgresAuthorityRequired() && merchantId && externalMessageId) {
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

export function startMetaWebhookWorker(
  port: number,
  options: {
    replyTransport?: MetaWebhookReplyTransport;
    replyHooks?: MetaReplyLifecycleHooks;
  } = {},
): DurableJobWorker {
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("a valid API port is required for the Meta webhook worker");
  }

  const mode: MetaReplyTransportMode = options.replyTransport
    ? "fake"
    : readMetaReplyTransportMode();
  if (mode === "live") assertLiveMetaReplyTransportReady();
  const replyTransport =
    options.replyTransport ||
    (mode === "fake" ? createFakeMetaWebhookReplyTransport() : null);
  const workerId = `meta-worker:${os.hostname()}:${process.pid}:${port}`;
  const disconnectMetaChannel = createMetaChannelDisconnectHandler();
  const recovery = recoverMissingRefundJobs();

  async function afterRecovery<T>(work: () => Promise<T>): Promise<T> {
    try {
      await recovery;
    } catch {
      throw jobError(
        "META_REFUND_RECOVERY_UNAVAILABLE",
        "Meta refund recovery must succeed before processing new jobs",
        true,
        true,
      );
    }
    return work();
  }

  return startDurableJobWorkerAuthoritative({
    workerId,
    pollIntervalMs: Number(process.env.FAWRI_JOB_POLL_INTERVAL_MS || 500),
    visibilityTimeoutMs: Number(
      process.env.FAWRI_JOB_VISIBILITY_TIMEOUT_MS || 5 * 60 * 1000,
    ),
    handlers: {
      [META_REPLY_JOB_TYPE]: (job) =>
        afterRecovery(() => {
          if (mode === "live") {
            return processLiveMetaReplyJob(job, options.replyHooks);
          }
          if (!replyTransport) {
            throw jobError(
              "META_REPLY_TRANSPORT_UNAVAILABLE",
              "Meta reply transport is unavailable",
              true,
              true,
            );
          }
          return processFakeMetaReplyJob(
            job,
            replyTransport,
            options.replyHooks,
          );
        }),
      [META_EVENT_JOB_TYPE]: (job) =>
        afterRecovery(async () => ({
          event_id: text(job.payload?.event_id || job.dedupe_key),
          delivery_status: "ignored_non_reply_event",
        })),
      [META_TERMINAL_JOB_TYPE]: (job) =>
        afterRecovery(async () => ({
          event_id: text(job.payload?.event_id || job.dedupe_key),
          delivery_status: "terminal_no_reply",
        })),
      [META_CHANNEL_DISCONNECT_JOB_TYPE]: (job) =>
        afterRecovery(() => disconnectMetaChannel(job)),
      [META_REPLY_REFUND_JOB_TYPE]: (job) =>
        afterRecovery(() => processMetaReplyRefundJob(job)),
    },
    reconcileExpiredJob: (job) =>
      afterRecovery(() => reconcileExpiredMetaJob(job, mode, replyTransport)),
    onDeadLetter: handleMetaDeadLetter,
  });
}
