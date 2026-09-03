import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppTextSendPlan,
} from "../src/services/whatsappOfflineContracts";
import {
  createWhatsAppOutboundAttemptPlan,
} from "../src/services/whatsappOutboundAttempt";
import {
  planWhatsAppOutboundDeliveryPersistence,
} from "../src/services/whatsappOutboundDeliveryPersistence";

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

function attempt() {
  return createWhatsAppOutboundAttemptPlan({
    merchantId: "merchant-1",
    replyIntentId: "reply-intent-1",
    attemptNumber: 1,
    channel,
    request: buildWhatsAppTextSendPlan({
      phoneNumberId: channel.phone_number_id,
      to: "+9647711111111",
      messageText: "hello",
      graphVersion: "v30.0",
    }),
  });
}

const attemptedAt = "2026-09-03T00:00:00.000Z";
const finalizedAt = "2026-09-03T00:00:01.000Z";

test("pending delivery holds reservation and matches schema nullability", () => {
  const result = planWhatsAppOutboundDeliveryPersistence({
    attempt: attempt(),
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt,
  });
  assert.equal(result.boundary, "not_persisted");
  assert.equal(result.row.outcome, "pending");
  assert.equal(result.row.finalized_at, null);
  assert.equal(result.row.failure_code, null);
  assert.equal(result.row.provider_message_id, null);
  assert.equal(result.reservation_effect, "hold_reserved");
  assert.equal(result.automatic_retry_allowed, false);
});

test("confirmed provider send consumes exactly once and stores provider message id", () => {
  const result = planWhatsAppOutboundDeliveryPersistence({
    attempt: attempt(),
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt,
    finalizedAt,
    outcome: { status: "sent", provider_message_id: "wamid.out-1" },
  });
  assert.equal(result.row.outcome, "sent");
  assert.equal(result.row.provider_message_id, "wamid.out-1");
  assert.equal(result.row.failure_code, null);
  assert.equal(result.row.finalized_at, finalizedAt);
  assert.equal(result.reservation_effect, "consume_exactly_once");
});

test("confirmed failure refunds while uncertainty holds reservation", () => {
  const failed = planWhatsAppOutboundDeliveryPersistence({
    attempt: attempt(),
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt,
    finalizedAt,
    outcome: {
      status: "confirmed_failed",
      code: "WHATSAPP_GRAPH_HTTP_400_100",
      http_status: 400,
    },
  });
  assert.equal(failed.row.outcome, "confirmed_failed");
  assert.equal(failed.row.provider_message_id, null);
  assert.equal(failed.row.failure_code, "WHATSAPP_GRAPH_HTTP_400_100");
  assert.equal(failed.reservation_effect, "refund_exactly_once");

  const uncertain = planWhatsAppOutboundDeliveryPersistence({
    attempt: attempt(),
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt,
    finalizedAt,
    outcome: {
      status: "uncertain",
      code: "WHATSAPP_GRAPH_HTTP_503",
      http_status: 503,
    },
  });
  assert.equal(uncertain.row.outcome, "uncertain");
  assert.equal(uncertain.row.provider_message_id, null);
  assert.equal(uncertain.reservation_effect, "hold_reserved");
  assert.equal(uncertain.automatic_retry_allowed, false);
});

test("invalid finalization ordering and pending finalization fail closed", () => {
  assert.throws(
    () =>
      planWhatsAppOutboundDeliveryPersistence({
        attempt: attempt(),
        inboundEventId: "inbound-event-1",
        attemptedAt,
        finalizedAt,
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_PENDING_DELIVERY_CANNOT_BE_FINALIZED",
  );

  assert.throws(
    () =>
      planWhatsAppOutboundDeliveryPersistence({
        attempt: attempt(),
        inboundEventId: "inbound-event-1",
        attemptedAt,
        finalizedAt: "2026-09-02T23:59:59.000Z",
        outcome: { status: "sent", provider_message_id: "wamid.out-1" },
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OUTBOUND_FINALIZATION_ORDER_INVALID",
  );
});

test("persistence planner has no database, queue, provider, or credential I/O", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappOutboundDeliveryPersistence.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /withOperationalTransaction/);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
