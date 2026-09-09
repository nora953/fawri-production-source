import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  rehearseWhatsAppOfflineOutbound,
} from "../src/services/whatsappOfflineOutboundRehearsal";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const channel = {
  id: "channel-1",
  merchant_id: "merchant-1",
  platform: "whatsapp" as const,
  status: "pending" as const,
  version: 1,
  waba_id: "1234567890",
  phone_number_id: "9876543210",
  integration_mode: "dormant_offline" as const,
};

function baseInput() {
  return {
    merchantId: "merchant-1",
    channel,
    to: "+9647711111111",
    messageText: "تم استلام طلبك",
    graphVersion: "v30.0",
    replyIntentId: "reply-intent-1",
    attemptNumber: 1,
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt: "2026-09-03T00:00:00.000Z",
    finalizedAt: "2026-09-03T00:00:01.000Z",
  };
}

test("fake HTTP success rehearses sent persistence and delivery state without transport", () => {
  const result = rehearseWhatsAppOfflineOutbound({
    ...baseInput(),
    observation: {
      kind: "http",
      http_status: 200,
      body: { messages: [{ id: "wamid.out-1" }] },
    },
  });

  assert.equal(result.boundary, "offline_fake_transport_only");
  assert.equal(result.preview.code, "WHATSAPP_CHANNEL_DORMANT");
  assert.equal(result.preview.transport_authorized, false);
  assert.equal(result.attempt.transport_authorized, false);
  assert.deepEqual(result.observed_outcome, {
    status: "sent",
    provider_message_id: "wamid.out-1",
  });
  assert.equal(result.persistence.row.outcome, "sent");
  assert.equal(result.persistence.reservation_effect, "consume_exactly_once");
  assert.equal(result.delivery_state.phase, "sent");
  assert.equal(result.delivery_state.external_message_id, "wamid.out-1");
});

test("fake timeout remains uncertain and cannot authorize retry or reservation consumption", () => {
  const result = rehearseWhatsAppOfflineOutbound({
    ...baseInput(),
    observation: { kind: "timeout" },
  });

  assert.deepEqual(result.observed_outcome, {
    status: "uncertain",
    code: "WHATSAPP_FAKE_TRANSPORT_TIMEOUT",
  });
  assert.equal(result.persistence.row.outcome, "uncertain");
  assert.equal(result.persistence.reservation_effect, "hold_reserved");
  assert.equal(result.persistence.automatic_retry_allowed, false);
  assert.equal(result.delivery_state.phase, "uncertain");
  assert.equal(result.delivery_state.external_message_id, undefined);
});

test("fake deterministic rejection rehearses confirmed failure and refund effect", () => {
  const result = rehearseWhatsAppOfflineOutbound({
    ...baseInput(),
    observation: {
      kind: "http",
      http_status: 400,
      body: { error: { code: 100, error_subcode: 33 } },
    },
  });

  assert.equal(result.observed_outcome.status, "confirmed_failed");
  assert.equal(result.persistence.row.outcome, "confirmed_failed");
  assert.equal(result.persistence.reservation_effect, "refund_exactly_once");
  assert.equal(result.delivery_state.phase, "failed");
});

test("cross-merchant fake rehearsal fails before an attempt is created", () => {
  assert.throws(
    () =>
      rehearseWhatsAppOfflineOutbound({
        ...baseInput(),
        merchantId: "merchant-2",
        observation: { kind: "timeout" },
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OFFLINE_REHEARSAL_PREVIEW_BLOCKED",
  );
});

test("offline outbound rehearsal source contains no provider/network or credential capability", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappOfflineOutboundRehearsal.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Authorization/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /express\s*\(/);
});
