import {
  buildWhatsAppOfflineReplay,
  type WhatsAppOfflineReplayResult,
} from "./whatsappOfflineReplay";
import type { WhatsAppWebhookChannelResolver } from "./whatsappWebhookPlanner";
import {
  buildWhatsAppInboundIntakeTransactionPlan,
  type WhatsAppInboundIntakeTransactionPlan,
} from "./whatsappInboundIntakePlan";
import {
  buildWhatsAppDurableQueuePlan,
  type WhatsAppDurableQueuePlan,
} from "./whatsappDurableQueuePlan";
import {
  buildWhatsAppInboundProcessingPlan,
  type WhatsAppInboundProcessingPlan,
} from "./whatsappInboundProcessingPlan";

export type WhatsAppOfflineFoundationPlan = {
  boundary: "offline_only_not_executed";
  replay: WhatsAppOfflineReplayResult;
  intake: WhatsAppInboundIntakeTransactionPlan;
  queue: WhatsAppDurableQueuePlan;
  inbound_processing: WhatsAppInboundProcessingPlan[];
};

function foundationError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function assertQueueIntakeCompatibility(
  intake: WhatsAppInboundIntakeTransactionPlan,
  queue: WhatsAppDurableQueuePlan,
): void {
  if (
    intake.storage_authority !== queue.storage_authority ||
    intake.units.length !== queue.jobs.length
  ) {
    throw foundationError(
      "WHATSAPP_OFFLINE_JOB_PLAN_MISMATCH",
      "WhatsApp intake and durable job plans disagree",
    );
  }

  const intakeByExternalEvent = new Map(
    intake.units.map((unit) => [unit.event.external_event_id, unit]),
  );
  if (intakeByExternalEvent.size !== intake.units.length) {
    throw foundationError(
      "WHATSAPP_OFFLINE_JOB_PLAN_MISMATCH",
      "WhatsApp intake contains duplicate external event identities",
    );
  }

  for (const queueJob of queue.jobs) {
    const unit = intakeByExternalEvent.get(queueJob.external_event_id);
    if (
      !unit ||
      unit.event.enqueue_job_id !== queueJob.job_row.id ||
      unit.event.payload_hash !== queueJob.job_row.payload_hash ||
      unit.event.merchant_id !== queueJob.job_row.merchant_id ||
      unit.event.channel_id !== queueJob.channel_id ||
      unit.job.job_row.id !== queueJob.job_row.id ||
      unit.job.encrypted_payload.payload_sha256 !==
        queueJob.encrypted_payload.payload_sha256
    ) {
      throw foundationError(
        "WHATSAPP_OFFLINE_JOB_PLAN_MISMATCH",
        "WhatsApp intake and encrypted durable job identity link is inconsistent",
      );
    }
  }
}

/**
 * Composes the complete dormant WhatsApp fixture path without executing any
 * operational side effect. It exists to prove that normalized provider events,
 * tenant/channel resolution, PostgreSQL durable intake, encrypted privileged job
 * payloads, shared conversation persistence, and reply-decision handoff use
 * compatible contracts before a future live ingress/worker is designed.
 *
 * No HTTP route, signature verification, SQL write, queue write, AI call,
 * credential access, media fetch, or Graph API request is performed here.
 */
export async function buildWhatsAppOfflineFoundationPlan(input: {
  payload: unknown;
  resolveChannel: WhatsAppWebhookChannelResolver;
  env?: NodeJS.ProcessEnv;
}): Promise<WhatsAppOfflineFoundationPlan> {
  const replay = await buildWhatsAppOfflineReplay(input);
  const processingPlan = replay.plan;
  const intake = buildWhatsAppInboundIntakeTransactionPlan(processingPlan);
  const queue = buildWhatsAppDurableQueuePlan(processingPlan);
  assertQueueIntakeCompatibility(intake, queue);

  return {
    boundary: "offline_only_not_executed",
    replay,
    intake,
    queue,
    inbound_processing: processingPlan.inbound_messages.map((message) =>
      buildWhatsAppInboundProcessingPlan(message),
    ),
  };
}
