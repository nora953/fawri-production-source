import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  planWhatsAppWebhookProcessing,
} from "../src/services/whatsappWebhookPlanner";
import type { ResolvedDormantWhatsAppChannel } from "../src/services/whatsappDormantChannelResolver";
import type { WhatsAppWebhookParseResult } from "../src/services/whatsappWebhookContract";

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

function parsed(): WhatsAppWebhookParseResult {
  return {
    supported: true,
    object: "whatsapp_business_account",
    ignored_changes: 1,
    malformed_changes: 0,
    events: [
      {
        event_id: "message-event",
        event_kind: "message",
        waba_id: "1234567890",
        phone_number_id: "9876543210",
        external_message_id: "wamid.in-1",
        customer_id: "9647711111111",
        message_kind: "text",
        text: "hello",
      },
      {
        event_id: "status-event",
        event_kind: "status",
        waba_id: "1234567890",
        phone_number_id: "9876543210",
        external_message_id: "wamid.out-1",
        status: "delivered",
        error_codes: [],
      },
      {
        event_id: "error-event",
        event_kind: "error",
        waba_id: "1234567890",
        phone_number_id: "9876543210",
        code: "131000",
        title: "provider title that must not be copied",
        message: "provider detail that must not be copied",
      },
    ],
  };
}

test("plans messages, statuses, and provider errors without side effects", async () => {
  let resolutions = 0;
  const plan = await planWhatsAppWebhookProcessing({
    parsed: parsed(),
    resolveChannel: async () => {
      resolutions += 1;
      return channel;
    },
  });
  assert.equal(resolutions, 1);
  assert.equal(plan.mode, "offline_replay");
  assert.equal(plan.inbound_messages.length, 1);
  assert.equal(plan.delivery_statuses.length, 1);
  assert.equal(plan.provider_errors.length, 1);
  assert.equal(plan.inbound_messages[0].merchant_id, "merchant-1");
  assert.equal(plan.delivery_statuses[0].channel_id, "channel-1");
  assert.deepEqual(plan.provider_errors[0], {
    event_id: "error-event",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    code: "131000",
  });
  assert.equal(JSON.stringify(plan.provider_errors).includes("provider detail"), false);
});

test("unsupported objects produce an empty offline plan", async () => {
  const plan = await planWhatsAppWebhookProcessing({
    parsed: {
      supported: false,
      object: "page",
      events: [],
      ignored_changes: 0,
      malformed_changes: 0,
    },
    resolveChannel: async () => {
      throw new Error("must not resolve");
    },
  });
  assert.equal(plan.supported, false);
  assert.deepEqual(plan.inbound_messages, []);
});

test("fails closed when channel resolution fails", async () => {
  await assert.rejects(
    () =>
      planWhatsAppWebhookProcessing({
        parsed: parsed(),
        resolveChannel: async () => {
          throw Object.assign(new Error("not mapped"), {
            code: "WHATSAPP_CHANNEL_NOT_MAPPED",
          });
        },
      }),
    (error: unknown) => {
      const typed = error as { code?: string; cause_code?: string };
      return (
        typed.code === "WHATSAPP_WEBHOOK_CHANNEL_RESOLUTION_FAILED" &&
        typed.cause_code === "WHATSAPP_CHANNEL_NOT_MAPPED"
      );
    },
  );
});

test("fails closed when a resolver returns a cross-channel mapping", async () => {
  await assert.rejects(
    () =>
      planWhatsAppWebhookProcessing({
        parsed: parsed(),
        resolveChannel: async () => ({ ...channel, phone_number_id: "1111111111" }),
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_WEBHOOK_CHANNEL_MAPPING_MISMATCH",
  );
});

test("deduplicates exact repeated events and rejects identity collisions", async () => {
  const original = parsed();
  const repeated = original.events[0];
  const plan = await planWhatsAppWebhookProcessing({
    parsed: { ...original, events: [...original.events, repeated] },
    resolveChannel: async () => channel,
  });
  assert.equal(plan.duplicate_events, 1);

  await assert.rejects(
    () =>
      planWhatsAppWebhookProcessing({
        parsed: {
          ...original,
          events: [
            repeated,
            { ...repeated, text: "different payload with same event id" },
          ],
        },
        resolveChannel: async () => channel,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_EVENT_ID_COLLISION",
  );
});

test("planner contains no network or credential capability", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappWebhookPlanner.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});
