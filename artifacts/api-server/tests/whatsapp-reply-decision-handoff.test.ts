import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  bridgeWhatsAppInboundMessage,
} from "../src/services/whatsappInboundBridge";
import {
  buildWhatsAppReplyDecisionHandoff,
} from "../src/services/whatsappReplyDecisionHandoff";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function bridged(text = "Where is my order?") {
  return bridgeWhatsAppInboundMessage({
    job_type: "whatsapp_inbound_message",
    event_id: "event-1",
    merchant_id: "merchant-1",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.1",
    customer_id: "9647711111111",
    message_kind: "text",
    text,
  });
}

test("eligible WhatsApp text maps to the existing knowledge decision input shape", () => {
  const result = buildWhatsAppReplyDecisionHandoff(bridged());
  assert.equal(result.boundary, "decision_not_executed");
  assert.equal(result.channel, "whatsapp");
  assert.deepEqual(result.request, {
    merchantId: "merchant-1",
    customerText: "Where is my order?",
    requestId: "event-1",
  });
  assert.match(result.conversation_key, /^whatsapp-conversation-/);
  assert.match(result.inbound_event_key, /^whatsapp-inbound-/);
});

test("non-text media disposition cannot be handed to automatic reply decision", () => {
  const media = bridgeWhatsAppInboundMessage({
    job_type: "whatsapp_inbound_message",
    event_id: "event-image",
    merchant_id: "merchant-1",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.image",
    customer_id: "9647711111111",
    message_kind: "image",
  });
  assert.throws(
    () => buildWhatsAppReplyDecisionHandoff(media),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_REPLY_DECISION_NOT_ELIGIBLE",
  );
});

test("handoff source cannot execute AI, database, queue, or provider I/O", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappReplyDecisionHandoff.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /getKnowledgeDecisionEngine\s*\(/);
  assert.doesNotMatch(source, /withOperationalTransaction/);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
});
