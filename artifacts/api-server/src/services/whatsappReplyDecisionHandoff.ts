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

function unsafeHumanText(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

/**
 * Shapes the exact channel-neutral input already expected by Fawri's knowledge
 * decision engine, but never invokes the engine. This boundary independently
 * rejects unsafe control characters even if a caller forges a bridge result,
 * while preserving normal tabs and human line breaks.
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
  if (
    !customerText ||
    customerText.length > 2_000 ||
    unsafeHumanText(customerText)
  ) {
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
