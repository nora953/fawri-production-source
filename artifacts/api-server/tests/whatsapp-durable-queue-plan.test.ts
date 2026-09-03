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

test("builds deterministic queue envelopes without enqueueing", () => {
  const first = buildWhatsAppDurableQueuePlan(plan());
  const second = buildWhatsAppDurableQueuePlan(plan());
  assert.equal(first.boundary, "not_enqueued");
  assert.equal(first.jobs.length, 3);
  assert.deepEqual(
    first.jobs.map((job) => job.type),
    ["whatsapp_inbound_message", "whatsapp_delivery_status", "whatsapp_provider_error"],
  );
  assert.deepEqual(
    first.jobs.map((job) => job.dedupeKey),
    second.jobs.map((job) => job.dedupeKey),
  );
  assert.ok(first.jobs.every((job) => job.merchantId === "merchant-1"));
  assert.equal(first.jobs[0].payload.channel_id, "channel-1");
  assert.match(first.jobs[0].dedupeKey, /^whatsapp:inbound:[a-f0-9]{64}$/);
});

test("provider error observation does not inherit retry-heavy semantics", () => {
  const result = buildWhatsAppDurableQueuePlan(plan());
  const providerError = result.jobs.find((job) => job.type === "whatsapp_provider_error");
  assert.equal(providerError?.maxAttempts, 1);
  assert.equal(providerError?.priority, 10);
});

test("queue planner never calls the durable queue or provider", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappDurableQueuePlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /enqueueDurableJob\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
