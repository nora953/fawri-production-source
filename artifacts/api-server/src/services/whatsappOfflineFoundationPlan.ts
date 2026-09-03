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

/**
 * Composes the complete dormant WhatsApp fixture path without executing any
 * operational side effect. It exists to prove that normalized provider events,
 * tenant/channel resolution, durable intake, queue envelopes, shared
 * conversation persistence, and reply-decision handoff use compatible
 * contracts before a future live ingress/worker is designed.
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

  return {
    boundary: "offline_only_not_executed",
    replay,
    intake: buildWhatsAppInboundIntakeTransactionPlan(processingPlan),
    queue: buildWhatsAppDurableQueuePlan(processingPlan),
    inbound_processing: processingPlan.inbound_messages.map((message) =>
      buildWhatsAppInboundProcessingPlan(message),
    ),
  };
}
