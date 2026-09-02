import type { WhatsAppInboundBridgeResult } from "./whatsappInboundBridge";

export type WhatsAppKnowledgeDecisionRequest = {
  merchantId: string;
  customerText: string;
  requestId: string;
};

export type WhatsAppReplyDecisionHandoff = {
  boundary: "decision_not_executed";
  channel: "whatsapp";
  conversation_key: string;
  inbound_event_key: string;
  request: WhatsAppKnowledgeDecisionRequest;
};

function handoffError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Shapes the exact channel-neutral input already expected by Fawri's knowledge
 * decision engine, but never invokes the engine. This keeps WhatsApp dormant
 * while proving that text/button/interactive messages can enter the same
 * knowledge path later without handing raw provider payloads to AI.
 */
export function buildWhatsAppReplyDecisionHandoff(
  bridged: WhatsAppInboundBridgeResult,
): WhatsAppReplyDecisionHandoff {
  if (
    bridged.disposition.action !== "eligible_for_reply_engine" ||
    bridged.disposition.reason !== "text_ready"
  ) {
    throw handoffError(
      "WHATSAPP_REPLY_DECISION_NOT_ELIGIBLE",
      "WhatsApp inbound message is not eligible for automatic reply decision",
    );
  }
  const customerText = String(bridged.message.text ?? "").trim();
  if (!customerText || customerText.length > 2_000) {
    throw handoffError(
      "WHATSAPP_REPLY_DECISION_TEXT_INVALID",
      "WhatsApp reply decision text is invalid",
    );
  }
  if (bridged.message.channel !== "whatsapp") {
    throw handoffError(
      "WHATSAPP_REPLY_DECISION_CHANNEL_INVALID",
      "WhatsApp reply decision channel is invalid",
    );
  }

  return {
    boundary: "decision_not_executed",
    channel: "whatsapp",
    conversation_key: bridged.message.conversation_key,
    inbound_event_key: bridged.message.inbound_event_key,
    request: {
      merchantId: bridged.message.merchant_id,
      customerText,
      requestId: bridged.message.event_id,
    },
  };
}
