import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppOfflineReplay,
} from "../src/services/whatsappOfflineReplay";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

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
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+964 770 000 0000",
                phone_number_id: "9876543210",
              },
              messages: [
                {
                  id: "wamid.in-1",
                  from: "9647711111111",
                  type: "text",
                  text: { body: "hello" },
                  timestamp: "1788380000",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

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

test("offline foundation can plan a fixture end to end without enqueueing", async () => {
  const result = await buildWhatsAppOfflineReplay({
    payload: payload(),
    resolveChannel: async () => channel,
    env: { FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1" } as NodeJS.ProcessEnv,
  });
  assert.equal(result.boundary, "offline_only");
  assert.equal(result.plan.inbound_messages.length, 1);
  assert.equal(result.plan.inbound_messages[0].merchant_id, "merchant-1");
});

test("offline replay is disabled by default", async () => {
  await assert.rejects(
    () =>
      buildWhatsAppOfflineReplay({
        payload: payload(),
        resolveChannel: async () => channel,
        env: {} as NodeJS.ProcessEnv,
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OFFLINE_FOUNDATION_DISABLED",
  );
});

test("offline replay refuses to become a hidden live ingress", async () => {
  await assert.rejects(
    () =>
      buildWhatsAppOfflineReplay({
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

test("mixed malformed provider delivery is rejected as a whole", async () => {
  const broken = payload();
  broken.entry[0].changes.push({
    field: "messages",
    value: {
      messaging_product: "whatsapp",
      metadata: {
        display_phone_number: "",
        phone_number_id: "",
      },
      messages: [],
    },
  });
  await assert.rejects(
    () =>
      buildWhatsAppOfflineReplay({
        payload: broken,
        resolveChannel: async () => channel,
        env: { FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1" } as NodeJS.ProcessEnv,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_WEBHOOK_MALFORMED_CHANGE",
  );
});

test("offline replay source has no route, queue, network, or credential capability", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappOfflineReplay.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Authorization/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /express\s*\(/);
});
