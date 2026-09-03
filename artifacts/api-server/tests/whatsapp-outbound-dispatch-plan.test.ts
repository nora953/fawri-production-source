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
  planWhatsAppOutboundDispatch,
} from "../src/services/whatsappOutboundDispatchPlan";
import type { ResolvedDormantWhatsAppChannel } from "../src/services/whatsappDormantChannelResolver";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const channel: ResolvedDormantWhatsAppChannel = {
  id: "channel-1",
  merchant_id: "merchant-1",
  platform: "whatsapp",
  status: "pending",
  version: 1,
  waba_id: "1234567890",
  phone_number_id: "9876543210",
  integration_mode: "dormant_offline",
};

function attempt() {
  const request = buildWhatsAppTextSendPlan({
    phoneNumberId: channel.phone_number_id,
    to: "+9647711111111",
    messageText: "تم استلام طلبك",
    graphVersion: "v30.0",
  });
  return createWhatsAppOutboundAttemptPlan({
    merchantId: "merchant-1",
    replyIntentId: "reply-intent-1",
    attemptNumber: 1,
    channel,
    request,
  });
}

test("plans pending delivery and one-shot encrypted outbound job before transport", () => {
  const outboundAttempt = attempt();
  const result = planWhatsAppOutboundDispatch({
    attempt: outboundAttempt,
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt: "2026-09-03T00:00:00.000Z",
  });

  assert.equal(result.boundary, "not_persisted_not_enqueued_not_sent");
  assert.equal(result.transport_authorized, false);
  assert.equal(result.automatic_retry_allowed, false);
  assert.equal(result.delivery.row.outcome, "pending");
  assert.equal(result.delivery.row.id, outboundAttempt.attempt_id);
  assert.equal(result.delivery.row.reply_intent_id, "reply-intent-1");
  assert.equal(result.delivery.reservation_effect, "hold_reserved");

  assert.equal(result.job.job_row.type, "whatsapp_outbound_send");
  assert.equal(result.job.job_row.max_attempts, 1);
  assert.equal(result.job.job_row.merchant_id, "merchant-1");
  assert.equal(result.job.channel_id, "channel-1");
  assert.equal(result.job.external_event_id, outboundAttempt.attempt_id);
  assert.equal(result.job.encrypted_payload.plaintext_persistence_forbidden, true);

  const payload = result.job.encrypted_payload.payload_for_encryption;
  const encryptedRequest = payload.request as ReturnType<typeof buildWhatsAppTextSendPlan>;
  assert.equal(payload.request_sha256, outboundAttempt.request_sha256);
  assert.equal(payload.recipient_hash, outboundAttempt.recipient_hash);
  assert.equal(payload.logical_send_id, outboundAttempt.logical_send_id);
  assert.equal(payload.attempt_number, 1);
  assert.equal(payload.phone_number_id, channel.phone_number_id);
  assert.equal(encryptedRequest.body.to, "9647711111111");
  assert.equal(result.recipient_lock.recipient_hash, outboundAttempt.recipient_hash);
  assert.equal(result.recipient_lock.encrypted_payload_job_id, result.job.job_row.id);
  assert.equal(result.recipient_lock.encrypted_payload_field, "request.body.to");
  assert.equal(result.recipient_lock.plaintext_persistence_forbidden, true);

  assert.equal(JSON.stringify(result.job.job_row).includes("9647711111111"), false);
  assert.equal(JSON.stringify(result.delivery.row).includes("9647711111111"), false);
});

test("same pre-send attempt produces deterministic delivery and dispatch identities", () => {
  const outboundAttempt = attempt();
  const input = {
    attempt: outboundAttempt,
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt: "2026-09-03T00:00:00.000Z",
  };
  const first = planWhatsAppOutboundDispatch(input);
  const second = planWhatsAppOutboundDispatch(input);

  assert.equal(first.delivery.row.id, second.delivery.row.id);
  assert.equal(first.job.job_row.id, second.job.job_row.id);
  assert.equal(first.job.job_row.dedupe_key, second.job.job_row.dedupe_key);
  assert.equal(
    first.job.encrypted_payload.payload_sha256,
    second.job.encrypted_payload.payload_sha256,
  );
});

test("dispatch rejects an attempt that has crossed the dormant transport boundary", () => {
  const forged = {
    ...attempt(),
    transport_authorized: true,
  } as unknown as ReturnType<typeof attempt>;

  assert.throws(
    () =>
      planWhatsAppOutboundDispatch({
        attempt: forged,
        inboundEventId: "inbound-event-1",
        attemptedAt: "2026-09-03T00:00:00.000Z",
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OUTBOUND_DISPATCH_ATTEMPT_INVALID",
  );
});

test("dispatch rejects a mutated request before planning durable state", () => {
  const mutated = attempt();
  mutated.request.body.to = "9647722222222";

  assert.throws(
    () =>
      planWhatsAppOutboundDispatch({
        attempt: mutated,
        inboundEventId: "inbound-event-1",
        attemptedAt: "2026-09-03T00:00:00.000Z",
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OUTBOUND_ATTEMPT_INTEGRITY_INVALID",
  );
});

test("outbound dispatch planner contains no SQL, queue write, credential, or provider transport", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappOutboundDispatchPlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /with(?:Merchant)?OperationalTransaction/);
  assert.doesNotMatch(source, /client\.query/);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Authorization/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});
