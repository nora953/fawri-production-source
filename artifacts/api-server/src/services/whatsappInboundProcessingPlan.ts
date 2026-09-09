import {
  bridgeWhatsAppInboundMessage,
  type WhatsAppInboundBridgeInput,
  type WhatsAppInboundBridgeResult,
} from "./whatsappInboundBridge";
import {
  buildWhatsAppConversationPersistencePlan,
  type WhatsAppConversationPersistencePlan,
} from "./whatsappConversationPersistencePlan";
import {
  buildWhatsAppReplyDecisionHandoff,
  type WhatsAppReplyDecisionHandoff,
} from "./whatsappReplyDecisionHandoff";

export type WhatsAppInboundProcessingPlan = {
  boundary: "not_executed";
  provider: "whatsapp";
  bridge: WhatsAppInboundBridgeResult;
  persistence: WhatsAppConversationPersistencePlan;
  reply_decision: WhatsAppReplyDecisionHandoff | null;
  next_action: "persist_then_decide" | "persist_for_manual_handling";
};

/**
 * Connects the verified WhatsApp inbound contract to Fawri's shared
 * conversation and knowledge-decision shapes without performing any side
 * effect. A future worker must persist the inbound conversation/message first;
 * only eligible normalized text may then be handed to the existing decision
 * engine. Media/non-text traffic is retained for merchant handling and never
 * reaches the automatic reply engine through this plan.
 */
export function buildWhatsAppInboundProcessingPlan(
  job: WhatsAppInboundBridgeInput,
): WhatsAppInboundProcessingPlan {
  const bridge = bridgeWhatsAppInboundMessage(job);
  const persistence = buildWhatsAppConversationPersistencePlan(bridge);
  const eligible = bridge.disposition.action === "eligible_for_reply_engine";
  const replyDecision = eligible
    ? buildWhatsAppReplyDecisionHandoff(bridge)
    : null;

  return {
    boundary: "not_executed",
    provider: "whatsapp",
    bridge,
    persistence,
    reply_decision: replyDecision,
    next_action: eligible
      ? "persist_then_decide"
      : "persist_for_manual_handling",
  };
}
