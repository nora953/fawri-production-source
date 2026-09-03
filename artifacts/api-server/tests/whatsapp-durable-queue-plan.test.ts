import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppDurableQueuePlan,
} from "../src/services/whatsappDurableQueuePlan";
import type { WhatsAppWebhookProcessingPlan } from "../src/services/whatsappWebhookPlanner";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function plan(): WhatsAppWebhookProcessingPlan {
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

test("builds deterministic encrypted PostgreSQL job plans without enqueueing", () => {
  const first = buildWhatsAppDurableQueuePlan(plan());
  const second = buildWhatsAppDurableQueuePlan(plan());
  assert.equal(first.boundary, "not_persisted_not_enqueued");
  assert.equal(first.storage_authority, "postgres_background_jobs_encrypted_payload");
  assert.equal(first.jobs.length, 3);
  assert.deepEqual(
    first.jobs.map((job) => job.job_row.type),
    ["whatsapp_inbound_message", "whatsapp_delivery_status", "whatsapp_provider_error"],
  );
  assert.deepEqual(
    first.jobs.map((job) => job.job_row.dedupe_key),
    second.jobs.map((job) => job.job_row.dedupe_key),
  );
  assert.ok(first.jobs.every((job) => job.job_row.merchant_id === "merchant-1"));
  assert.ok(first.jobs.every((job) => job.channel_id === "channel-1"));
  assert.equal(
    first.jobs[0].encrypted_payload.payload_for_encryption.channel_id,
    "channel-1",
  );
  assert.match(
    first.jobs[0].job_row.dedupe_key,
    /^whatsapp:whatsapp_inbound_message:[a-f0-9]{64}$/,
  );
  assert.ok(
    first.jobs.every(
      (job) =>
        job.encrypted_payload.ciphertext_required === true &&
        job.encrypted_payload.plaintext_persistence_forbidden === true &&
        job.encrypted_payload.payload_sha256 === job.job_row.payload_hash,
    ),
  );
});

test("provider error observation does not inherit retry-heavy semantics", () => {
  const result = buildWhatsAppDurableQueuePlan(plan());
  const providerError = result.jobs.find(
    (job) => job.job_row.type === "whatsapp_provider_error",
  );
  assert.equal(providerError?.job_row.max_attempts, 1);
  assert.equal(providerError?.job_row.priority, 10);
});

test("duplicate external provider events fail before future persistence", () => {
  const duplicate = plan();
  duplicate.delivery_statuses[0].event_id = duplicate.inbound_messages[0].event_id;
  assert.throws(
    () => buildWhatsAppDurableQueuePlan(duplicate),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_QUEUE_PLAN_DUPLICATE_EXTERNAL_EVENT",
  );
});

test("queue planner is detached from legacy JSON queue and provider/runtime writes", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappDurableQueuePlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /durableJobQueue/);
  assert.doesNotMatch(source, /JsonFileStore/);
  assert.doesNotMatch(source, /enqueueDurableJob\s*\(/);
  assert.doesNotMatch(source, /withOperationalTransaction/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
