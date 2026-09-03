import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { WhatsAppInboundBridgeInput } from "../src/services/whatsappInboundBridge";
import {
  buildWhatsAppInboundProcessingPlan,
} from "../src/services/whatsappInboundProcessingPlan";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function input(
  overrides: Partial<WhatsAppInboundBridgeInput> = {},
): WhatsAppInboundBridgeInput {
  return {
    job_type: "whatsapp_inbound_message",
    event_id: "whatsapp:1234567890:9876543210:message:wamid.1",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.1",
    customer_id: "9647711111111",
    message_kind: "text",
    text: "Where is my order?",
    ...overrides,
  };
}

test("eligible text is planned to persist before the shared reply decision", () => {
  const plan = buildWhatsAppInboundProcessingPlan(input());
  assert.equal(plan.boundary, "not_executed");
  assert.equal(plan.provider, "whatsapp");
  assert.equal(plan.next_action, "persist_then_decide");
  assert.equal(plan.persistence.boundary, "not_persisted");
  assert.equal(plan.persistence.conversation.channel_id, "channel-1");
  assert.equal(plan.persistence.message.text, "Where is my order?");
  assert.equal(plan.reply_decision?.boundary, "decision_not_executed");
  assert.deepEqual(plan.reply_decision?.request, {
    merchantId: "merchant-1",
    customerText: "Where is my order?",
    requestId: "whatsapp:1234567890:9876543210:message:wamid.1",
  });
});

test("media is retained for merchant handling and never receives an automatic decision", () => {
  const plan = buildWhatsAppInboundProcessingPlan(
    input({
      event_id: "whatsapp:1234567890:9876543210:message:wamid.image",
      external_message_id: "wamid.image",
      message_kind: "image",
      text: undefined,
      provider_reference: {
        kind: "media",
        media_kind: "image",
        id: "media-123",
        caption: "Product\nphoto",
      },
    }),
  );
  assert.equal(plan.next_action, "persist_for_manual_handling");
  assert.equal(plan.reply_decision, null);
  assert.equal(plan.persistence.conversation.status, "needs_reply");
  assert.equal(plan.persistence.message.text, "Product\nphoto");
  assert.deepEqual(plan.persistence.message.metadata.provider_reference, {
    kind: "media",
    media_kind: "image",
    id: "media-123",
    caption: "Product\nphoto",
  });
});

test("over-limit normalized text persists but cannot reach the decision engine", () => {
  const longText = "x".repeat(2_001);
  const plan = buildWhatsAppInboundProcessingPlan(input({ text: longText }));
  assert.equal(plan.next_action, "persist_for_manual_handling");
  assert.equal(plan.reply_decision, null);
  assert.equal(plan.persistence.message.text, longText);
  assert.equal(plan.persistence.conversation.status, "needs_reply");
});

test("inbound processing composer contains no runtime, database, AI, queue, or provider I/O", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappInboundProcessingPlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /getKnowledgeDecisionEngine\s*\(/);
  assert.doesNotMatch(source, /with(?:Merchant)?OperationalTransaction/);
  assert.doesNotMatch(source, /enqueueDurableJob\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
