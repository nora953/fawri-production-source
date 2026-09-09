import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  bridgeWhatsAppInboundMessage,
  type WhatsAppInboundBridgeInput,
} from "../src/services/whatsappInboundBridge";
import {
  buildWhatsAppConversationPersistencePlan,
} from "../src/services/whatsappConversationPersistencePlan";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function input(
  overrides: Partial<WhatsAppInboundBridgeInput> = {},
): WhatsAppInboundBridgeInput {
  return {
    job_type: "whatsapp_inbound_message",
    event_id: "whatsapp:1234567890:9876543210:message:wamid.1",
    merchant_id: "merchant-1",
    channel_id: "channel-whatsapp-1",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.1",
    customer_id: "9647711111111",
    customer_name: "Customer",
    message_kind: "text",
    text: "Where is my order?",
    provider_timestamp: "1788390000",
    ...overrides,
  };
}

test("eligible text plans shared conversation and received customer message", () => {
  const bridged = bridgeWhatsAppInboundMessage(input());
  const plan = buildWhatsAppConversationPersistencePlan(bridged);

  assert.equal(plan.boundary, "not_persisted");
  assert.equal(plan.provider, "whatsapp");
  assert.equal(plan.transaction_required, true);
  assert.equal(plan.collision_checks_required, true);
  assert.equal(plan.conversation.merchant_id, "merchant-1");
  assert.equal(plan.conversation.channel_id, "channel-whatsapp-1");
  assert.equal(plan.conversation.customer_external_id, "9647711111111");
  assert.equal(plan.conversation.status, "auto_replying");
  assert.equal(plan.conversation.assigned_to_human, false);
  assert.equal(plan.message.conversation_id, plan.conversation.id);
  assert.equal(plan.message.external_message_id, "wamid.1");
  assert.equal(plan.message.external_event_id, input().event_id);
  assert.equal(plan.message.sender, "customer");
  assert.equal(plan.message.status, "received");
  assert.equal(plan.message.text, "Where is my order?");
  assert.equal(plan.message.metadata.auto_reply_eligible, true);
  assert.equal(plan.message.metadata.provider_timestamp, "1788390000");
});

test("media remains persisted for merchant handling but cannot become auto reply", () => {
  const bridged = bridgeWhatsAppInboundMessage(
    input({
      event_id: "whatsapp:1234567890:9876543210:message:wamid.image",
      external_message_id: "wamid.image",
      message_kind: "image",
      text: undefined,
      provider_reference: {
        kind: "media",
        media_kind: "image",
        id: "media-123",
        mime_type: "image/jpeg",
        sha256: "abc123",
        caption: "Front of product",
      },
    }),
  );
  const plan = buildWhatsAppConversationPersistencePlan(bridged);

  assert.equal(plan.conversation.status, "needs_reply");
  assert.equal(plan.conversation.assigned_to_human, false);
  assert.equal(plan.conversation.needs_training, false);
  assert.equal(plan.message.text, "Front of product");
  assert.equal(plan.message.metadata.auto_reply_eligible, false);
  assert.equal(plan.message.metadata.disposition_reason, "unsupported_media_or_nontext");
  assert.deepEqual(plan.message.metadata.provider_reference, {
    kind: "media",
    media_kind: "image",
    id: "media-123",
    mime_type: "image/jpeg",
    sha256: "abc123",
    caption: "Front of product",
  });
});

test("media without caption uses a nonempty safe display placeholder", () => {
  const plan = buildWhatsAppConversationPersistencePlan(
    bridgeWhatsAppInboundMessage(
      input({
        event_id: "whatsapp:1234567890:9876543210:message:wamid.document",
        external_message_id: "wamid.document",
        message_kind: "document",
        text: undefined,
        provider_reference: {
          kind: "media",
          media_kind: "document",
          id: "media-doc-1",
          filename: "invoice.pdf",
        },
      }),
    ),
  );
  assert.equal(plan.message.text, "[WhatsApp document]");
  assert.equal(plan.conversation.status, "needs_reply");
});

test("same channel and customer produce deterministic shared conversation identity", () => {
  const first = buildWhatsAppConversationPersistencePlan(
    bridgeWhatsAppInboundMessage(input()),
  );
  const second = buildWhatsAppConversationPersistencePlan(
    bridgeWhatsAppInboundMessage(
      input({
        event_id: "whatsapp:1234567890:9876543210:message:wamid.2",
        external_message_id: "wamid.2",
        text: "Second message",
      }),
    ),
  );
  assert.equal(first.conversation.id, second.conversation.id);
  assert.notEqual(first.message.id, second.message.id);
});

test("persistence planner performs no database, AI, queue, credential, or provider I/O", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappConversationPersistencePlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /with(?:Merchant)?OperationalTransaction/);
  assert.doesNotMatch(source, /client\.query/);
  assert.doesNotMatch(source, /getKnowledgeDecisionEngine/);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
