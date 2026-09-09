import assert from "node:assert/strict";
import test from "node:test";
import {
  correlateWhatsAppDeliveryWithClient,
} from "../src/services/whatsappDeliveryCorrelation";
import type { OperationalSqlClient } from "../src/services/operationalPostgresAuthority";
import type { WhatsAppDeliveryStatusPlan } from "../src/services/whatsappWebhookPlanner";

const expectedRecipientId = "9647711111111";

function observation(): WhatsAppDeliveryStatusPlan {
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
  };
}

function row() {
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
  };
}

async function expectResultRejection(client: OperationalSqlClient) {
  await assert.rejects(
    () =>
      correlateWhatsAppDeliveryWithClient(
        client,
        observation(),
        expectedRecipientId,
      ),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_DELIVERY_CORRELATION_RESULT_INVALID",
  );
}

test("query-result rows accessor is rejected without invocation", async () => {
  let getterInvoked = false;
  const result: Record<string, unknown> = {};
  Object.defineProperty(result, "rows", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return [row()];
    },
  });
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      return result as never as { rows: T[] };
    },
  };

  await expectResultRejection(client);
  assert.equal(getterInvoked, false);
});

test("correlation row accessors are rejected before ownership checks", async () => {
  let getterInvoked = false;
  const forged = row() as ReturnType<typeof row> & Record<string, unknown>;
  Object.defineProperty(forged, "merchant_id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "merchant-1";
    },
  });
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      return { rows: [forged] as never as T[] };
    },
  };

  await expectResultRejection(client);
  assert.equal(getterInvoked, false);
});

test("correlation rows larger than SQL LIMIT 2 fail closed", async () => {
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      return {
        rows: [row(), row(), row()] as never as T[],
      };
    },
  };
  await expectResultRejection(client);
});

test("unexpected SQL row fields fail closed before they can influence correlation", async () => {
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      return {
        rows: [{ ...row(), injected: "unexpected" }] as never as T[],
      };
    },
  };
  await expectResultRejection(client);
});
