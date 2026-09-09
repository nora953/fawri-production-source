import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppOfflineFoundationPlan,
} from "../src/services/whatsappOfflineFoundationPlan";

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

function payload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1234567890",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                display_phone_number: "+964 770 000 0000",
                phone_number_id: "9876543210",
              },
              messages: [
                {
                  id: "wamid.text",
                  from: "9647711111111",
                  type: "text",
                  text: { body: "Where is my order?" },
                  timestamp: "1788380000",
                },
                {
                  id: "wamid.image",
                  from: "9647711111111",
                  type: "image",
                  image: {
                    id: "media-123",
                    mime_type: "image/jpeg",
                    caption: "Product photo",
                  },
                  timestamp: "1788380001",
                },
              ],
              statuses: [
                {
                  id: "wamid.outbound",
                  recipient_id: "9647711111111",
                  status: "delivered",
                  timestamp: "1788380002",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("complete offline foundation composes compatible encrypted PostgreSQL plans without executing them", async () => {
  const result = await buildWhatsAppOfflineFoundationPlan({
    payload: payload(),
    resolveChannel: async () => channel,
    env: { FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1" } as NodeJS.ProcessEnv,
  });

  assert.equal(result.boundary, "offline_only_not_executed");
  assert.equal(result.replay.plan.inbound_messages.length, 2);
  assert.equal(result.replay.plan.delivery_statuses.length, 1);
  assert.equal(result.intake.boundary, "not_persisted_not_enqueued");
  assert.equal(
    result.intake.storage_authority,
    "postgres_background_jobs_encrypted_payload",
  );
  assert.equal(result.intake.units.length, 3);
  assert.equal(result.queue.boundary, "not_persisted_not_enqueued");
  assert.equal(
    result.queue.storage_authority,
    "postgres_background_jobs_encrypted_payload",
  );
  assert.equal(result.queue.jobs.length, 3);
  assert.equal(result.inbound_processing.length, 2);

  const textPlan = result.inbound_processing.find(
    (item) => item.bridge.message.external_message_id === "wamid.text",
  );
  const imagePlan = result.inbound_processing.find(
    (item) => item.bridge.message.external_message_id === "wamid.image",
  );
  assert.equal(textPlan?.next_action, "persist_then_decide");
  assert.equal(textPlan?.reply_decision?.request.customerText, "Where is my order?");
  assert.equal(imagePlan?.next_action, "persist_for_manual_handling");
  assert.equal(imagePlan?.reply_decision, null);
  assert.equal(imagePlan?.persistence.message.text, "Product photo");

  const queueByEvent = new Map(
    result.queue.jobs.map((job) => [job.external_event_id, job]),
  );
  for (const unit of result.intake.units) {
    assert.equal(unit.event.channel_id, "channel-1");
    assert.equal(unit.event.merchant_id, "merchant-1");
    assert.equal(unit.event.enqueue_job_id, unit.job.job_row.id);
    assert.equal(
      unit.event.payload_hash,
      unit.job.encrypted_payload.payload_sha256,
    );
    const queueJob = queueByEvent.get(unit.event.external_event_id);
    assert.equal(queueJob?.job_row.id, unit.job.job_row.id);
    assert.equal(
      queueJob?.encrypted_payload.payload_sha256,
      unit.job.encrypted_payload.payload_sha256,
    );
  }
});

test("complete offline composer inherits the live-cutover refusal", async () => {
  await assert.rejects(
    () =>
      buildWhatsAppOfflineFoundationPlan({
        payload: payload(),
        resolveChannel: async () => channel,
        env: {
          FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
          FAWRI_WHATSAPP_LIVE_CUTOVER: "1",
        } as NodeJS.ProcessEnv,
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OFFLINE_REPLAY_LIVE_CUTOVER_BLOCKED",
  );
});

test("complete offline composer has no database, legacy JSON queue, AI, credential, or provider I/O", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappOfflineFoundationPlan.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /client\.query/);
  assert.doesNotMatch(source, /with(?:Merchant)?OperationalTransaction/);
  assert.doesNotMatch(source, /durableJobQueue/);
  assert.doesNotMatch(source, /JsonFileStore/);
  assert.doesNotMatch(source, /enqueueDurableJob\s*\(/);
  assert.doesNotMatch(source, /getKnowledgeDecisionEngine\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
