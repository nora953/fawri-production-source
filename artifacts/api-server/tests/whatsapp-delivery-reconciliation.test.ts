import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createWhatsAppDeliveryState,
} from "../src/services/whatsappDeliveryLifecycle";
import {
  planWhatsAppDeliveryReconciliation,
} from "../src/services/whatsappDeliveryReconciliation";
import type { WhatsAppDeliveryStatusPlan } from "../src/services/whatsappWebhookPlanner";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function state() {
  return createWhatsAppDeliveryState({
    attemptId: "attempt-1",
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
    recipientId: "9647711111111",
    outcome: { status: "sent", provider_message_id: "wamid.out-1" },
  });
}

function observation(
  overrides: Partial<WhatsAppDeliveryStatusPlan> = {},
): WhatsAppDeliveryStatusPlan {
  return {
    event_id: "status-delivered",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.out-1",
    recipient_id: "9647711111111",
    provider_timestamp: "1788390100",
    status: "delivered",
    error_codes: [],
    ...overrides,
  };
}

test("plans delivery reconciliation without persistence", () => {
  const result = planWhatsAppDeliveryReconciliation({
    merchantId: "merchant-1",
    channelId: "channel-1",
    state: state(),
    observation: observation(),
  });
  assert.equal(result.boundary, "not_persisted");
  assert.equal(result.delivery.changed, true);
  assert.equal(result.delivery.state.phase, "delivered");
  assert.equal(result.delivery.state.provider_timestamp, "1788390100");
});

test("cross-merchant or cross-channel observations fail before reduction", () => {
  for (const overrides of [
    { merchant_id: "merchant-2" },
    { channel_id: "channel-2" },
  ]) {
    assert.throws(
      () =>
        planWhatsAppDeliveryReconciliation({
          merchantId: "merchant-1",
          channelId: "channel-1",
          state: state(),
          observation: observation(overrides),
        }),
      (error: unknown) =>
        (error as { code?: string }).code === "WHATSAPP_DELIVERY_OWNER_MISMATCH",
    );
  }
});

test("provider message mismatch remains fail closed", () => {
  assert.throws(
    () =>
      planWhatsAppDeliveryReconciliation({
        merchantId: "merchant-1",
        channelId: "channel-1",
        state: state(),
        observation: observation({ external_message_id: "wamid.other" }),
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DELIVERY_MAPPING_MISMATCH",
  );
});

test("reconciliation planner has no database, queue, network, or credential side effects", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappDeliveryReconciliation.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /withOperationalTransaction/);
  assert.doesNotMatch(source, /enqueueDurableJob/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
});
