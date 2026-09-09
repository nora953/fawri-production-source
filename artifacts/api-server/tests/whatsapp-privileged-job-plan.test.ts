import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppPrivilegedJobPlan,
} from "../src/services/whatsappPrivilegedJobPlan";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "message-event",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    external_message_id: "wamid.in-1",
    text: "hello",
    ...overrides,
  };
}

test("plans administrative job row separately from encrypted privileged payload", () => {
  const original = payload();
  const result = buildWhatsAppPrivilegedJobPlan({
    type: "whatsapp_inbound_message",
    eventId: "message-event",
    merchantId: "merchant-1",
    channelId: "channel-1",
    payload: original,
    maxAttempts: 5,
  });

  assert.equal(result.boundary, "not_persisted_not_enqueued");
  assert.equal(result.storage_authority, "postgres_background_jobs_encrypted_payload");
  assert.equal(result.job_row.type, "whatsapp_inbound_message");
  assert.equal(result.job_row.merchant_id, "merchant-1");
  assert.equal(result.job_row.status, "queued");
  assert.equal(result.job_row.max_attempts, 5);
  assert.match(result.job_row.id, /^whatsapp-job-[a-f0-9]{40}$/);
  assert.match(result.job_row.dedupe_key, /^whatsapp:whatsapp_inbound_message:[a-f0-9]{64}$/);
  assert.match(result.job_row.payload_hash, /^[a-f0-9]{64}$/);
  assert.equal(result.encrypted_payload.job_id, result.job_row.id);
  assert.equal(result.encrypted_payload.payload_sha256, result.job_row.payload_hash);
  assert.equal(result.encrypted_payload.ciphertext_required, true);
  assert.equal(result.encrypted_payload.plaintext_persistence_forbidden, true);
  assert.notEqual(result.encrypted_payload.payload_for_encryption, original);
  assert.deepEqual(result.encrypted_payload.payload_for_encryption, original);
});

test("same event produces deterministic job identity and payload hash", () => {
  const input = {
    type: "whatsapp_delivery_status" as const,
    eventId: "status-event",
    merchantId: "merchant-1",
    channelId: "channel-1",
    payload: payload({ event_id: "status-event", status: "delivered" }),
    maxAttempts: 5,
  };
  const first = buildWhatsAppPrivilegedJobPlan(input);
  const second = buildWhatsAppPrivilegedJobPlan(input);
  assert.equal(first.job_row.id, second.job_row.id);
  assert.equal(first.job_row.dedupe_key, second.job_row.dedupe_key);
  assert.equal(first.job_row.payload_hash, second.job_row.payload_hash);
});

test("provider event identifiers may contain provider punctuation while local ids stay strict", () => {
  const providerEvent = "whatsapp:message:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const result = buildWhatsAppPrivilegedJobPlan({
    type: "whatsapp_inbound_message",
    eventId: providerEvent,
    merchantId: "merchant-1",
    channelId: "channel_1:primary",
    payload: payload({
      event_id: providerEvent,
      channel_id: "channel_1:primary",
    }),
    maxAttempts: 5,
  });
  assert.equal(result.external_event_id, providerEvent);
  assert.equal(result.channel_id, "channel_1:primary");
});

test("payload ownership mismatch fails before any future persistence boundary", () => {
  for (const badPayload of [
    payload({ merchant_id: "merchant-2" }),
    payload({ channel_id: "channel-2" }),
    payload({ event_id: "other-event" }),
  ]) {
    assert.throws(
      () =>
        buildWhatsAppPrivilegedJobPlan({
          type: "whatsapp_inbound_message",
          eventId: "message-event",
          merchantId: "merchant-1",
          channelId: "channel-1",
          payload: badPayload,
          maxAttempts: 5,
        }),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_OWNERSHIP_MISMATCH",
    );
  }
});

test("invalid retry, priority, and identities fail closed", () => {
  assert.throws(
    () =>
      buildWhatsAppPrivilegedJobPlan({
        type: "whatsapp_inbound_message",
        eventId: "message-event",
        merchantId: "merchant-1",
        channelId: "channel-1",
        payload: payload(),
        maxAttempts: 0,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_PRIVILEGED_JOB_RETRY_INVALID",
  );
  assert.throws(
    () =>
      buildWhatsAppPrivilegedJobPlan({
        type: "whatsapp_provider_error",
        eventId: "message-event",
        merchantId: "merchant-1",
        channelId: "channel-1",
        payload: payload(),
        maxAttempts: 1,
        priority: 101,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_PRIVILEGED_JOB_PRIORITY_INVALID",
  );
  for (const input of [
    { eventId: "bad\nevent", merchantId: "merchant-1", channelId: "channel-1" },
    { eventId: "message-event", merchantId: "bad merchant", channelId: "channel-1" },
    { eventId: "message-event", merchantId: "merchant\nspoof", channelId: "channel-1" },
    { eventId: "message-event", merchantId: "merchant-1", channelId: "bad channel" },
  ]) {
    assert.throws(
      () =>
        buildWhatsAppPrivilegedJobPlan({
          type: "whatsapp_inbound_message",
          eventId: input.eventId,
          merchantId: input.merchantId,
          channelId: input.channelId,
          payload: payload({
            event_id: input.eventId,
            merchant_id: input.merchantId,
            channel_id: input.channelId,
          }),
          maxAttempts: 5,
        }),
      (error: unknown) =>
        (error as { code?: string }).code === "WHATSAPP_PRIVILEGED_JOB_IDENTITY_INVALID",
    );
  }
});

test("privileged job planner is detached from JSON queue, SQL, encryption runtime, and transport", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappPrivilegedJobPlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /durableJobQueue/);
  assert.doesNotMatch(source, /JsonFileStore/);
  assert.doesNotMatch(source, /withOperationalTransaction/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /encryptMetaCredential|decryptMetaCredential/);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
