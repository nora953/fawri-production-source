import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  correlateWhatsAppDeliveryWithClient,
} from "../src/services/whatsappDeliveryCorrelation";
import type { OperationalSqlClient } from "../src/services/operationalPostgresAuthority";
import type { WhatsAppDeliveryStatusPlan } from "../src/services/whatsappWebhookPlanner";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

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
    status: "delivered",
    error_codes: [],
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    merchant_id: "merchant-1",
    inbound_event_id: "inbound-1",
    reservation_id: "reservation-1",
    reply_intent_id: "reply-intent-1",
    outcome: "sent",
    provider_message_id: "wamid.out-1",
    failure_code: null,
    channel_id: "channel-1",
    ...overrides,
  };
}

function clientWith(rows: Record<string, unknown>[]): OperationalSqlClient {
  return {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      assert.match(sql, /JOIN channel_inbound_events/);
      assert.match(sql, /i\.provider = 'whatsapp'/);
      assert.match(sql, /d\.merchant_id = \$1/);
      assert.match(sql, /i\.channel_id = \$2/);
      assert.match(sql, /d\.provider_message_id = \$3/);
      assert.deepEqual(values, ["merchant-1", "channel-1", "wamid.out-1"]);
      return { rows: rows as T[] };
    },
  };
}

test("correlates only a confirmed send in the same merchant and channel", async () => {
  const result = await correlateWhatsAppDeliveryWithClient(
    clientWith([row()]),
    observation(),
  );
  assert.deepEqual(result, {
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    inbound_event_id: "inbound-1",
    reply_intent_id: "reply-intent-1",
    reservation_id: "reservation-1",
    state: {
      local_attempt_id: "attempt-1",
      waba_id: "1234567890",
      phone_number_id: "9876543210",
      external_message_id: "wamid.out-1",
      phase: "sent",
      recipient_id: "9647711111111",
      error_codes: [],
    },
  });
});

test("missing or ambiguous correlation fails closed", async () => {
  await assert.rejects(
    () => correlateWhatsAppDeliveryWithClient(clientWith([]), observation()),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DELIVERY_NOT_CORRELATED",
  );
  await assert.rejects(
    () =>
      correlateWhatsAppDeliveryWithClient(
        clientWith([row(), row({ id: "attempt-2" })]),
        observation(),
      ),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_DELIVERY_CORRELATION_AMBIGUOUS",
  );
});

test("non-sent or cross-owner rows are rejected even if a query adapter misbehaves", async () => {
  for (const badRow of [
    row({ outcome: "uncertain" }),
    row({ merchant_id: "merchant-2" }),
    row({ channel_id: "channel-2" }),
    row({ provider_message_id: "wamid.other" }),
  ]) {
    await assert.rejects(
      () => correlateWhatsAppDeliveryWithClient(clientWith([badRow]), observation()),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "WHATSAPP_DELIVERY_CORRELATION_STATE_INVALID",
    );
  }
});

test("correlation is read-only and has no provider or credential capability", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappDeliveryCorrelation.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});
