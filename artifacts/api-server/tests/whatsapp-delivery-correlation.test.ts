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
const expectedRecipientId = "9647711111111";

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
    recipient_id: expectedRecipientId,
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
    waba_id: "1234567890",
    phone_number_id: "9876543210",
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
      assert.match(sql, /JOIN merchant_channels/);
      assert.match(sql, /i\.provider = 'whatsapp'/);
      assert.match(sql, /c\.platform = 'whatsapp'/);
      assert.match(sql, /d\.merchant_id = \$1/);
      assert.match(sql, /i\.channel_id = \$2/);
      assert.match(sql, /d\.provider_message_id = \$3/);
      assert.match(sql, /c\.whatsapp_business_account_id = \$4/);
      assert.match(sql, /c\.whatsapp_phone_number_id = \$5/);
      assert.deepEqual(values, [
        "merchant-1",
        "channel-1",
        "wamid.out-1",
        "1234567890",
        "9876543210",
      ]);
      return { rows: rows as T[] };
    },
  };
}

function correlate(
  client: OperationalSqlClient,
  observed: WhatsAppDeliveryStatusPlan = observation(),
  expectedRecipient: unknown = expectedRecipientId,
) {
  return correlateWhatsAppDeliveryWithClient(
    client,
    observed,
    expectedRecipient,
  );
}

test("correlates only a confirmed send in the exact merchant WhatsApp channel identity", async () => {
  const result = await correlate(clientWith([row()]));
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
      recipient_id: expectedRecipientId,
      error_codes: [],
    },
  });
});

test("missing or ambiguous correlation fails closed", async () => {
  await assert.rejects(
    () => correlate(clientWith([])),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DELIVERY_NOT_CORRELATED",
  );
  await assert.rejects(
    () => correlate(clientWith([row(), row({ id: "attempt-2" })])),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_DELIVERY_CORRELATION_AMBIGUOUS",
  );
});

test("non-sent, cross-owner, or cross-provider-identity rows are rejected even if a query adapter misbehaves", async () => {
  for (const badRow of [
    row({ outcome: "uncertain" }),
    row({ merchant_id: "merchant-2" }),
    row({ channel_id: "channel-2" }),
    row({ provider_message_id: "wamid.other" }),
    row({ waba_id: "1234567899" }),
    row({ phone_number_id: "9876543299" }),
    row({ waba_id: null }),
    row({ phone_number_id: null }),
  ]) {
    await assert.rejects(
      () => correlate(clientWith([badRow])),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "WHATSAPP_DELIVERY_CORRELATION_STATE_INVALID",
    );
  }
});

test("trusted outbound recipient cannot be replaced by status webhook data", async () => {
  let queried = false;
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      queried = true;
      return { rows: [row()] as T[] };
    },
  };

  await assert.rejects(
    () =>
      correlate(
        client,
        observation({ recipient_id: "9647722222222" }),
        expectedRecipientId,
      ),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_DELIVERY_RECIPIENT_MISMATCH",
  );
  assert.equal(queried, false);

  const withoutProviderRecipient = await correlate(
    clientWith([row()]),
    observation({ recipient_id: undefined }),
  );
  assert.equal(withoutProviderRecipient.state.recipient_id, expectedRecipientId);
});

test("invalid WABA, phone, or expected recipient identity fails before database lookup", async () => {
  let queried = false;
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      queried = true;
      return { rows: [] as T[] };
    },
  };

  for (const input of [
    { observed: observation({ waba_id: "not-numeric" }), expected: expectedRecipientId },
    { observed: observation({ phone_number_id: "" }), expected: expectedRecipientId },
    { observed: observation(), expected: "bad-recipient" },
    { observed: observation({ recipient_id: "bad-recipient" }), expected: expectedRecipientId },
  ]) {
    await assert.rejects(
      () => correlate(client, input.observed, input.expected),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "WHATSAPP_DELIVERY_CORRELATION_IDENTITY_INVALID",
    );
  }
  assert.equal(queried, false);
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
