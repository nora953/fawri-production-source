import {
  buildWhatsAppTextSendPlan,
  type WhatsAppTextSendPlan,
} from "./whatsappOfflineContracts";
import type { ResolvedDormantWhatsAppChannel } from "./whatsappDormantChannelResolver";
import type { WhatsAppActivationReadiness } from "./whatsappActivationReadiness";

export type DormantWhatsAppOutboundPreview = {
  decision: "blocked";
  code:
    | "WHATSAPP_CHANNEL_DORMANT"
    | "WHATSAPP_MERCHANT_MAPPING_MISMATCH"
    | "WHATSAPP_EXTERNAL_ACTIVATION_NOT_READY";
  merchant_id: string;
  channel_id: string;
  transport_authorized: false;
  credential_required: false;
  request_preview: WhatsAppTextSendPlan;
};

function policyError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Builds a credential-free request preview while making it impossible for the
 * dormant authority to authorize transport. The preview exists so request
 * shaping can be completed and tested before Meta is connected.
 */
export function previewDormantWhatsAppTextSend(input: {
  merchantId: unknown;
  channel: ResolvedDormantWhatsAppChannel;
  to: unknown;
  messageText: unknown;
  graphVersion?: unknown;
  readiness?: WhatsAppActivationReadiness;
}): DormantWhatsAppOutboundPreview {
  const merchantId = String(input.merchantId ?? "").trim();
  if (!merchantId || merchantId.length > 200) {
    throw policyError(
      "WHATSAPP_MERCHANT_ID_INVALID",
      "WhatsApp merchant identity is invalid",
    );
  }
  if (input.channel.merchant_id !== merchantId) {
    return {
      decision: "blocked",
      code: "WHATSAPP_MERCHANT_MAPPING_MISMATCH",
      merchant_id: merchantId,
      channel_id: input.channel.id,
      transport_authorized: false,
      credential_required: false,
      request_preview: buildWhatsAppTextSendPlan({
        phoneNumberId: input.channel.phone_number_id,
        to: input.to,
        messageText: input.messageText,
        graphVersion: input.graphVersion,
      }),
    };
  }

  const requestPreview = buildWhatsAppTextSendPlan({
    phoneNumberId: input.channel.phone_number_id,
    to: input.to,
    messageText: input.messageText,
    graphVersion: input.graphVersion,
  });

  if (
    input.readiness &&
    input.readiness.mode !== "activation_candidate" &&
    input.readiness.live_cutover_requested
  ) {
    return {
      decision: "blocked",
      code: "WHATSAPP_EXTERNAL_ACTIVATION_NOT_READY",
      merchant_id: merchantId,
      channel_id: input.channel.id,
      transport_authorized: false,
      credential_required: false,
      request_preview: requestPreview,
    };
  }

  return {
    decision: "blocked",
    code: "WHATSAPP_CHANNEL_DORMANT",
    merchant_id: merchantId,
    channel_id: input.channel.id,
    transport_authorized: false,
    credential_required: false,
    request_preview: requestPreview,
  };
}
