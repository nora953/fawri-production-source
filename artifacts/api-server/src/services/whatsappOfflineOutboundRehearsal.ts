import type { ResolvedDormantWhatsAppChannel } from "./whatsappDormantChannelResolver";
import {
  classifyWhatsAppSendResponse,
  type WhatsAppSendOutcome,
} from "./whatsappOfflineContracts";
import {
  createWhatsAppOutboundAttemptPlan,
  type WhatsAppOutboundAttemptPlan,
} from "./whatsappOutboundAttempt";
import {
  planWhatsAppOutboundDeliveryPersistence,
  type WhatsAppOutboundDeliveryPersistencePlan,
} from "./whatsappOutboundDeliveryPersistence";
import {
  previewDormantWhatsAppTextSend,
  type DormantWhatsAppOutboundPreview,
} from "./whatsappOutboundPolicy";
import {
  createWhatsAppDeliveryState,
  type WhatsAppDeliveryState,
} from "./whatsappDeliveryLifecycle";

export type WhatsAppFakeTransportObservation =
  | {
      kind: "http";
      http_status: number;
      body: unknown;
    }
  | {
      kind: "timeout";
    }
  | {
      kind: "connection_reset";
    };

export type WhatsAppOfflineOutboundRehearsal = {
  boundary: "offline_fake_transport_only";
  preview: DormantWhatsAppOutboundPreview & { request_preview: NonNullable<DormantWhatsAppOutboundPreview["request_preview"]> };
  attempt: WhatsAppOutboundAttemptPlan;
  observed_outcome: WhatsAppSendOutcome;
  persistence: WhatsAppOutboundDeliveryPersistencePlan;
  delivery_state: WhatsAppDeliveryState;
};

function rehearsalError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function classifyFakeObservation(
  observation: WhatsAppFakeTransportObservation,
): WhatsAppSendOutcome {
  if (observation.kind === "http") {
    return classifyWhatsAppSendResponse({
      httpStatus: observation.http_status,
      body: observation.body,
    });
  }
  if (observation.kind === "timeout") {
    return {
      status: "uncertain",
      code: "WHATSAPP_FAKE_TRANSPORT_TIMEOUT",
    };
  }
  if (observation.kind === "connection_reset") {
    return {
      status: "uncertain",
      code: "WHATSAPP_FAKE_TRANSPORT_CONNECTION_RESET",
    };
  }
  throw rehearsalError(
    "WHATSAPP_FAKE_TRANSPORT_OBSERVATION_INVALID",
    "WhatsApp fake transport observation is invalid",
  );
}

/**
 * Exercises the complete outbound contract without any provider/network access:
 * request preview -> deterministic attempt -> scripted fake transport outcome ->
 * persistence effect -> delivery lifecycle state.
 *
 * The dormant outbound policy must remain blocked with WHATSAPP_CHANNEL_DORMANT.
 * An activation/readiness override is intentionally not accepted here so this
 * rehearsal can never turn into a hidden live transport path.
 */
export function rehearseWhatsAppOfflineOutbound(input: {
  merchantId: unknown;
  channel: ResolvedDormantWhatsAppChannel;
  to: unknown;
  messageText: unknown;
  graphVersion: unknown;
  replyIntentId: unknown;
  attemptNumber: unknown;
  inboundEventId: unknown;
  reservationId?: unknown;
  attemptedAt: unknown;
  finalizedAt: unknown;
  observation: WhatsAppFakeTransportObservation;
}): WhatsAppOfflineOutboundRehearsal {
  const preview = previewDormantWhatsAppTextSend({
    merchantId: input.merchantId,
    channel: input.channel,
    to: input.to,
    messageText: input.messageText,
    graphVersion: input.graphVersion,
  });

  if (preview.code !== "WHATSAPP_CHANNEL_DORMANT" || !("request_preview" in preview)) {
    throw rehearsalError(
      "WHATSAPP_OFFLINE_REHEARSAL_PREVIEW_BLOCKED",
      "WhatsApp offline rehearsal requires the correctly mapped dormant channel",
    );
  }

  const attempt = createWhatsAppOutboundAttemptPlan({
    merchantId: input.merchantId,
    replyIntentId: input.replyIntentId,
    attemptNumber: input.attemptNumber,
    channel: input.channel,
    request: preview.request_preview,
  });
  const observedOutcome = classifyFakeObservation(input.observation);
  const persistence = planWhatsAppOutboundDeliveryPersistence({
    attempt,
    inboundEventId: input.inboundEventId,
    reservationId: input.reservationId,
    attemptedAt: input.attemptedAt,
    finalizedAt: input.finalizedAt,
    outcome: observedOutcome,
  });
  const deliveryState = createWhatsAppDeliveryState({
    attemptId: attempt.attempt_id,
    wabaId: input.channel.waba_id,
    phoneNumberId: input.channel.phone_number_id,
    outcome: observedOutcome,
    recipientId: preview.request_preview.body.to,
  });

  return {
    boundary: "offline_fake_transport_only",
    preview: preview as WhatsAppOfflineOutboundRehearsal["preview"],
    attempt,
    observed_outcome: observedOutcome,
    persistence,
    delivery_state: deliveryState,
  };
}
