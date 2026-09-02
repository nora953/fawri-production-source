import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  bridgeWhatsAppInboundMessage,
} from "../src/services/whatsappInboundBridge";
import type { WhatsAppInboundMessageJob } from "../src/services/whatsappOfflineContracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function job(overrides: Partial<WhatsAppInboundMessageJob> = {}): WhatsAppInboundMessageJob {
  return {
    job_type: "whatsapp_inbound_message",
    event_id: "whatsapp:123:456:message:wamid.1",
    merchant_id: "merchant-1",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.1",
    customer_id: "9647711111111",
    customer_name: "Customer",
    message_kind: "text",
    text: "hello",
    provider_timestamp: "1788390000",
    ...overrides,
  };
}

test("text message becomes a deterministic channel-neutral reply candidate", () => {
  const first = bridgeWhatsAppInboundMessage(job());
  const second = bridgeWhatsAppInboundMessage(job());
  assert.deepEqual(first.disposition, {
    action: "eligible_for_reply_engine",
    reason: "text_ready",
  });
  assert.equal(first.message.channel, "whatsapp");
  assert.equal(first.message.external_channel_id, "9876543210");
  assert.equal(first.message.customer_external_id, "9647711111111");
  assert.equal(first.message.conversation_key, second.message.conversation_key);
  assert.equal(first.message.inbound_event_key, second.message.inbound_event_key);
  assert.match(first.message.conversation_key, /^whatsapp-conversation-[a-f0-9]{40}$/);
});

test("button and interactive normalized text are eligible without provider calls", () => {
  for (const kind of ["button", "interactive"] as const) {
    const result = bridgeWhatsAppInboundMessage(job({ message_kind: kind, text: "choice" }));
    assert.equal(result.disposition.action, "eligible_for_reply_engine");
  }
});

test("media and non-text kinds fail closed to manual or future media handling", () => {
  for (const kind of [
    "image",
    "audio",
    "video",
    "document",
    "sticker",
    "location",
    "contacts",
    "reaction",
    "unknown",
  ] as const) {
    const result = bridgeWhatsAppInboundMessage(
      job({ message_kind: kind, text: undefined }),
    );
    assert.deepEqual(result.disposition, {
      action: "manual_or_future_media",
      reason: "unsupported_media_or_nontext",
    });
  }
});

test("reply-engine text limit blocks automatic processing without dropping the text", () => {
  const text = "x".repeat(2_001);
  const result = bridgeWhatsAppInboundMessage(job({ text }));
  assert.deepEqual(result.disposition, {
    action: "manual_or_future_media",
    reason: "reply_engine_text_limit_exceeded",
  });
  assert.equal(result.message.text, text);
});

test("invalid channel identity fails before any downstream processing", () => {
  assert.throws(
    () => bridgeWhatsAppInboundMessage(job({ phone_number_id: "bad" })),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
  );
});

test("inbound bridge contains no AI, media fetch, queue, database, or provider I/O", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappInboundBridge.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /getKnowledgeDecisionEngine/);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /withOperationalTransaction/);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
