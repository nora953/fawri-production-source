import crypto from "node:crypto";
import type { EnqueueDurableJobInput } from "./durableJobQueue";
import type { WhatsAppWebhookProcessingPlan } from "./whatsappWebhookPlanner";

export type WhatsAppDurableQueuePlan = {
  boundary: "not_enqueued";
  jobs: EnqueueDurableJobInput[];
};

function dedupeKey(kind: string, eventId: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`fawri:whatsapp:${kind}:${eventId}`)
    .digest("hex");
  return `whatsapp:${kind}:${digest}`;
}

/**
 * Shapes offline webhook plans for the existing durable queue without writing
 * to it. This keeps dedupe and retry metadata deterministic while preserving a
 * hard boundary between planning and enqueueing.
 */
export function buildWhatsAppDurableQueuePlan(
  plan: WhatsAppWebhookProcessingPlan,
): WhatsAppDurableQueuePlan {
  if (plan.mode !== "offline_replay") {
    throw Object.assign(new Error("WhatsApp queue plan mode is invalid"), {
      code: "WHATSAPP_QUEUE_PLAN_MODE_INVALID",
    });
  }

  const jobs: EnqueueDurableJobInput[] = [];
  for (const message of plan.inbound_messages) {
    jobs.push({
      type: "whatsapp_inbound_message",
      dedupeKey: dedupeKey("inbound", message.event_id),
      merchantId: message.merchant_id,
      payload: { ...message },
      priority: 0,
      maxAttempts: 5,
    });
  }
  for (const status of plan.delivery_statuses) {
    jobs.push({
      type: "whatsapp_delivery_status",
      dedupeKey: dedupeKey("status", status.event_id),
      merchantId: status.merchant_id,
      payload: { ...status },
      priority: 0,
      maxAttempts: 5,
    });
  }
  for (const providerError of plan.provider_errors) {
    jobs.push({
      type: "whatsapp_provider_error",
      dedupeKey: dedupeKey("provider-error", providerError.event_id),
      merchantId: providerError.merchant_id,
      payload: { ...providerError },
      priority: 10,
      maxAttempts: 1,
    });
  }

  return { boundary: "not_enqueued", jobs };
}
