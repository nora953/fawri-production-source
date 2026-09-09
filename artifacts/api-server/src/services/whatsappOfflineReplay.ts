import {
  parseWhatsAppWebhookPayload,
  whatsAppLiveCutoverRequested,
  whatsAppOfflineFoundationEnabled,
} from "./whatsappWebhookContract";
import {
  planWhatsAppWebhookProcessing,
  type WhatsAppWebhookChannelResolver,
  type WhatsAppWebhookProcessingPlan,
} from "./whatsappWebhookPlanner";

function replayError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export type WhatsAppOfflineReplayResult = {
  boundary: "offline_only";
  plan: WhatsAppWebhookProcessingPlan;
};

/**
 * End-to-end offline fixture path: provider-shaped payload -> normalization ->
 * dormant channel resolution -> processing plan. It never mounts an HTTP route,
 * verifies a provider signature, enqueues a job, stores payload data, or calls
 * Meta. Live-cutover intent is rejected so this helper cannot become a hidden
 * production ingress.
 */
export async function buildWhatsAppOfflineReplay(input: {
  payload: unknown;
  resolveChannel: WhatsAppWebhookChannelResolver;
  env?: NodeJS.ProcessEnv;
}): Promise<WhatsAppOfflineReplayResult> {
  const env = input.env || process.env;
  if (!whatsAppOfflineFoundationEnabled(env)) {
    throw replayError(
      "WHATSAPP_OFFLINE_FOUNDATION_DISABLED",
      "WhatsApp offline foundation is disabled",
    );
  }
  if (whatsAppLiveCutoverRequested(env)) {
    throw replayError(
      "WHATSAPP_OFFLINE_REPLAY_LIVE_CUTOVER_BLOCKED",
      "Offline replay cannot run as a live WhatsApp ingress",
    );
  }

  const parsed = parseWhatsAppWebhookPayload(input.payload);
  if (parsed.supported && parsed.malformed_changes > 0) {
    throw replayError(
      "WHATSAPP_WEBHOOK_MALFORMED_CHANGE",
      "WhatsApp offline replay contains malformed provider changes",
    );
  }

  return {
    boundary: "offline_only",
    plan: await planWhatsAppWebhookProcessing({
      parsed,
      resolveChannel: input.resolveChannel,
    }),
  };
}
