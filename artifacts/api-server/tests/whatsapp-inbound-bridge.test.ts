import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  bridgeWhatsAppInboundMessage,
  type WhatsAppInboundBridgeInput,
} from "../src/services/whatsappInboundBridge";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function job(
  overrides: Partial<WhatsAppInboundBridgeInput> = {},
): WhatsAppInboundBridgeInput {
  return {
    job_type: "whatsapp_inbound_message",
    event_id: "whatsapp:123:456:message:wamid.1",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
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
  assert.equal(first.message.channel_id, "channel-1");
  assert.equal(first.message.external_channel_id, "9876543210");
  assert.equal(first.message.customer_external_id, "9647711111111");
  assert.equal(first.message.conversation_key, second.message.conversation_key);
  assert.equal(first.message.inbound_event_key, second.message.inbound_event_key);
  assert.match(first.message.conversation_key, /^whatsapp-conversation-[a-f0-9]{40}$/);
});

test("button and interactive normalized text are eligible without provider calls", () => {
  for (const kind of ["button", "interactive"] as const) {
    const result = bridgeWhatsAppInboundMessage(
      job({ message_kind: kind, text: "choice" }),
    );
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

test("safe provider references are carried without changing media disposition", () => {
  const result = bridgeWhatsAppInboundMessage(
    job({
      message_kind: "image",
      text: undefined,
      provider_reference: {
        kind: "media",
        media_kind: "image",
        id: "media-123",
        mime_type: "image/jpeg",
        sha256: "abc123",
        caption: "Product image",
      },
    }),
  );
  assert.equal(result.disposition.action, "manual_or_future_media");
  assert.deepEqual(result.message.provider_reference, {
    kind: "media",
    media_kind: "image",
    id: "media-123",
    mime_type: "image/jpeg",
    sha256: "abc123",
    caption: "Product image",
  });
});

test("provider reference kind must match the normalized message kind", () => {
  assert.throws(
    () =>
      bridgeWhatsAppInboundMessage(
        job({
          message_kind: "image",
          text: undefined,
          provider_reference: {
            kind: "media",
            media_kind: "document",
            id: "media-123",
          },
        }),
      ),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
  );
});

test("location references are bounded and validated before downstream handling", () => {
  const valid = bridgeWhatsAppInboundMessage(
    job({
      message_kind: "location",
      text: undefined,
      provider_reference: {
        kind: "location",
        latitude: 33.3152,
        longitude: 44.3661,
        name: "Baghdad",
      },
    }),
  );
  assert.deepEqual(valid.message.provider_reference, {
    kind: "location",
    latitude: 33.3152,
    longitude: 44.3661,
    name: "Baghdad",
  });

  assert.throws(
    () =>
      bridgeWhatsAppInboundMessage(
        job({
          message_kind: "location",
          text: undefined,
          provider_reference: {
            kind: "location",
            latitude: 200,
            longitude: 44.3661,
          },
        }),
      ),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
  );
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
  for (const overrides of [
    { phone_number_id: "bad" },
    { channel_id: "" },
  ]) {
    assert.throws(
      () => bridgeWhatsAppInboundMessage(job(overrides)),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
    );
  }
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
