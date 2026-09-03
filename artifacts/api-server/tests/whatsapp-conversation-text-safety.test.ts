import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeWhatsAppInboundMessage,
  type WhatsAppInboundBridgeResult,
} from "../src/services/whatsappInboundBridge";
import {
  buildWhatsAppConversationPersistencePlan,
} from "../src/services/whatsappConversationPersistencePlan";

function bridged(text = "hello"): WhatsAppInboundBridgeResult {
  return bridgeWhatsAppInboundMessage({
    job_type: "whatsapp_inbound_message",
    event_id:
      "whatsapp:message:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.inbound-1",
    customer_id: "9647711111111",
    customer_name: "Customer",
    message_kind: "text",
    text,
  });
}

test("forged unsafe message text cannot cross the persistence boundary", () => {
  const forged = structuredClone(bridged());
  forged.message.text = "hello\u0000world";
  assert.throws(
    () => buildWhatsAppConversationPersistencePlan(forged),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_CONVERSATION_PERSISTENCE_TEXT_INVALID",
  );
});

test("forged customer-name control characters cannot be persisted", () => {
  const forged = structuredClone(bridged());
  forged.message.customer_name = "Customer\nSpoof";
  assert.throws(
    () => buildWhatsAppConversationPersistencePlan(forged),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_CONVERSATION_PERSISTENCE_CUSTOMER_NAME_INVALID",
  );
});

test("normal multiline message text is still persisted unchanged", () => {
  const value = "first line\nsecond line\twith tab";
  const plan = buildWhatsAppConversationPersistencePlan(bridged(value));
  assert.equal(plan.message.text, value);
});
