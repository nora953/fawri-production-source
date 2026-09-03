import {
  buildWhatsAppPrivilegedJobPlan,
  type WhatsAppPrivilegedJobPlan,
} from "./whatsappPrivilegedJobPlan";
import type { WhatsAppWebhookProcessingPlan } from "./whatsappWebhookPlanner";

export type WhatsAppDurableQueuePlan = {
  boundary: "not_persisted_not_enqueued";
  storage_authority: "postgres_background_jobs_encrypted_payload";
  jobs: WhatsAppPrivilegedJobPlan[];
};

function queueError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Converts resolved webhook events into pure plans for the PostgreSQL
 * `background_jobs` + encrypted `background_job_payloads` authorities.
 *
 * This module intentionally has no dependency on the legacy JSON durable queue,
 * does not persist plaintext payloads, and cannot enqueue/start a worker.
 */
export function buildWhatsAppDurableQueuePlan(
  plan: WhatsAppWebhookProcessingPlan,
): WhatsAppDurableQueuePlan {
  if (plan.mode !== "offline_replay") {
    throw queueError(
      "WHATSAPP_QUEUE_PLAN_MODE_INVALID",
      "WhatsApp queue plan mode is invalid",
    );
  }
  if (
    !plan.supported &&
    (plan.inbound_messages.length > 0 ||
      plan.delivery_statuses.length > 0 ||
      plan.provider_errors.length > 0)
  ) {
    throw queueError(
      "WHATSAPP_QUEUE_PLAN_UNSUPPORTED_EVENTS",
      "Unsupported WhatsApp delivery cannot contain planned jobs",
    );
  }

  const jobs: WhatsAppPrivilegedJobPlan[] = [];
  for (const message of plan.inbound_messages) {
    jobs.push(
      buildWhatsAppPrivilegedJobPlan({
        type: "whatsapp_inbound_message",
        eventId: message.event_id,
        merchantId: message.merchant_id,
        channelId: message.channel_id,
        payload: { ...message },
        priority: 0,
        maxAttempts: 5,
      }),
    );
  }
  for (const status of plan.delivery_statuses) {
    jobs.push(
      buildWhatsAppPrivilegedJobPlan({
        type: "whatsapp_delivery_status",
        eventId: status.event_id,
        merchantId: status.merchant_id,
        channelId: status.channel_id,
        payload: { ...status },
        priority: 0,
        maxAttempts: 5,
      }),
    );
  }
  for (const providerError of plan.provider_errors) {
    jobs.push(
      buildWhatsAppPrivilegedJobPlan({
        type: "whatsapp_provider_error",
        eventId: providerError.event_id,
        merchantId: providerError.merchant_id,
        channelId: providerError.channel_id,
        payload: { ...providerError },
        priority: 10,
        maxAttempts: 1,
      }),
    );
  }

  const seen = new Set<string>();
  for (const job of jobs) {
    const externalEventId = job.external_event_id;
    if (seen.has(externalEventId)) {
      throw queueError(
        "WHATSAPP_QUEUE_PLAN_DUPLICATE_EXTERNAL_EVENT",
        "WhatsApp queue plan contains a duplicate provider event identity",
      );
    }
    seen.add(externalEventId);
  }

  return {
    boundary: "not_persisted_not_enqueued",
    storage_authority: "postgres_background_jobs_encrypted_payload",
    jobs,
  };
}
