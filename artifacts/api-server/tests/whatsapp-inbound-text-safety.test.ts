import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeWhatsAppInboundMessage,
  type WhatsAppInboundBridgeInput,
} from "../src/services/whatsappInboundBridge";

function job(
  overrides: Partial<WhatsAppInboundBridgeInput> = {},
): WhatsAppInboundBridgeInput {
  return {
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
    text: "hello",
    provider_timestamp: "1788390000",
    ...overrides,
  };
}

test("unsafe control characters cannot enter reply-engine text", () => {
  for (const value of ["hello\u0000world", "hello\u0007world", "hello\u007fworld"]) {
    assert.throws(
      () => bridgeWhatsAppInboundMessage(job({ text: value })),
      (error: unknown) =>
        (error as { code?: string }).code === "WHATSAPP_INBOUND_BRIDGE_TEXT_INVALID",
    );
  }
});

test("customer display names reject control-character spoofing", () => {
  for (const value of ["Customer\nSpoof", "Customer\rSpoof", "Customer\u0000Spoof"]) {
    assert.throws(
      () => bridgeWhatsAppInboundMessage(job({ customer_name: value })),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "WHATSAPP_INBOUND_BRIDGE_CUSTOMER_NAME_INVALID",
    );
  }
});

test("normal multiline customer text remains eligible and unchanged", () => {
  const value = "first line\nsecond line\twith tab";
  const result = bridgeWhatsAppInboundMessage(job({ text: value }));
  assert.deepEqual(result.disposition, {
    action: "eligible_for_reply_engine",
    reason: "text_ready",
  });
  assert.equal(result.message.text, value);
});
