import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppInboundIntakeTransactionPlan,
} from "../src/services/whatsappInboundIntakePlan";
import type { WhatsAppWebhookProcessingPlan } from "../src/services/whatsappWebhookPlanner";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function processingPlan(): WhatsAppWebhookProcessingPlan {
  return {
    mode: "offline_replay",
    supported: true,
    provider_object: "whatsapp_business_account",
    ignored_changes: 0,
    malformed_changes: 0,
    duplicate_events: 0,
    inbound_messages: [
      {
        job_type: "whatsapp_inbound_message",
        event_id: "message-event",
        merchant_id: "merchant-1",
        channel_id: "channel-1",
        channel: "whatsapp",
        waba_id: "1234567890",
        phone_number_id: "9876543210",
        external_message_id: "wamid.in-1",
        customer_id: "9647711111111",
        message_kind: "text",
        text: "hello",
      },
    ],
    delivery_statuses: [
      {
        event_id: "status-event",
        merchant_id: "merchant-1",
        channel_id: "channel-1",
        waba_id: "1234567890",
        phone_number_id: "9876543210",
        external_message_id: "wamid.out-1",
        status: "delivered",
        error_codes: [],
      },
    ],
    provider_errors: [
      {
        event_id: "error-event",
        merchant_id: "merchant-1",
        channel_id: "channel-1",
        waba_id: "1234567890",
        phone_number_id: "9876543210",
        code: "131000",
      },
    ],
  };
}

test("plans event markers and encrypted PostgreSQL jobs as one required atomic boundary", () => {
  const result = buildWhatsAppInboundIntakeTransactionPlan(processingPlan());
  assert.equal(result.boundary, "not_persisted_not_enqueued");
  assert.equal(result.storage_authority, "postgres_background_jobs_encrypted_payload");
  assert.equal(result.atomic_write_required, true);
  assert.equal(result.encrypted_payload_required, true);
  assert.equal(result.units.length, 3);
  for (const unit of result.units) {
    assert.equal(unit.event.provider, "whatsapp");
    assert.equal(unit.event.merchant_id, "merchant-1");
    assert.equal(unit.event.channel_id, "channel-1");
    assert.equal(unit.event.enqueue_job_id, unit.job.job_row.id);
    assert.equal(unit.job.storage_authority, "postgres_background_jobs_encrypted_payload");
    assert.equal(unit.job.job_row.merchant_id, "merchant-1");
    assert.equal(unit.job.encrypted_payload.ciphertext_required, true);
    assert.equal(unit.job.encrypted_payload.plaintext_persistence_forbidden, true);
    assert.match(unit.event.payload_hash, /^[a-f0-9]{64}$/);
    assert.equal(unit.job.encrypted_payload.payload_sha256, unit.event.payload_hash);
    assert.equal(unit.job.job_row.payload_hash, unit.event.payload_hash);
  }
});

test("same processing plan generates deterministic event and job identities", () => {
  const first = buildWhatsAppInboundIntakeTransactionPlan(processingPlan());
  const second = buildWhatsAppInboundIntakeTransactionPlan(processingPlan());
  assert.deepEqual(
    first.units.map((unit) => [
      unit.event.id,
      unit.job.job_row.id,
      unit.job.job_row.dedupe_key,
    ]),
    second.units.map((unit) => [
      unit.event.id,
      unit.job.job_row.id,
      unit.job.job_row.dedupe_key,
    ]),
  );
});

test("duplicate external provider identities are rejected before any persistence", () => {
  const plan = processingPlan();
  plan.delivery_statuses[0].event_id = plan.inbound_messages[0].event_id;
  assert.throws(
    () => buildWhatsAppInboundIntakeTransactionPlan(plan),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_INTAKE_DUPLICATE_EXTERNAL_EVENT",
  );
});

test("intake planner carries merchant/channel/event identity inside the encryption envelope", () => {
  const result = buildWhatsAppInboundIntakeTransactionPlan(processingPlan());
  const first = result.units[0];
  assert.equal(first.event.channel_id, "channel-1");
  assert.equal(first.job.channel_id, "channel-1");
  assert.equal(
    first.job.encrypted_payload.payload_for_encryption.channel_id,
    "channel-1",
  );
  assert.equal(
    first.job.encrypted_payload.payload_for_encryption.merchant_id,
    "merchant-1",
  );
  assert.equal(
    first.job.encrypted_payload.payload_for_encryption.event_id,
    "message-event",
  );
});

test("intake planner has no legacy JSON queue, database write, network, or secret capability", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappInboundIntakePlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /durableJobQueue/);
  assert.doesNotMatch(source, /JsonFileStore/);
  assert.doesNotMatch(source, /withOperationalTransaction/);
  assert.doesNotMatch(source, /enqueueDurableJob\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});
