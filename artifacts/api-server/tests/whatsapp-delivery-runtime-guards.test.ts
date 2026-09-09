import assert from "node:assert/strict";
import test from "node:test";
import {
  correlateWhatsAppDeliveryWithClient,
} from "../src/services/whatsappDeliveryCorrelation";
import {
  createWhatsAppDeliveryState,
  reduceWhatsAppDeliveryStatus,
  type WhatsAppDeliveryState,
} from "../src/services/whatsappDeliveryLifecycle";
import {
  planWhatsAppDeliveryReconciliation,
} from "../src/services/whatsappDeliveryReconciliation";
import type { OperationalSqlClient } from "../src/services/operationalPostgresAuthority";
import type { WhatsAppDeliveryStatusPlan } from "../src/services/whatsappWebhookPlanner";
import type { NormalizedWhatsAppStatusEvent } from "../src/services/whatsappWebhookContract";

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
    provider_timestamp: "1788390100",
    status: "delivered",
    error_codes: [],
    ...overrides,
  };
}

function normalizedStatus(
  overrides: Partial<NormalizedWhatsAppStatusEvent> = {},
): NormalizedWhatsAppStatusEvent {
  return {
    event_id: "status-delivered",
    event_kind: "status",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.out-1",
    recipient_id: expectedRecipientId,
    timestamp: "1788390100",
    status: "delivered",
    error_codes: [],
    ...overrides,
  };
}

function sentState(): WhatsAppDeliveryState {
  return createWhatsAppDeliveryState({
    attemptId: "attempt-1",
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
    recipientId: expectedRecipientId,
    outcome: { status: "sent", provider_message_id: "wamid.out-1" },
  });
}

function expectShapeError(run: () => unknown) {
  assert.throws(
    run,
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DELIVERY_SHAPE_INVALID",
  );
}

async function expectShapeRejection(run: () => Promise<unknown>) {
  await assert.rejects(
    run,
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DELIVERY_SHAPE_INVALID",
  );
}

test("correlation observation accessors are rejected before SQL lookup", async () => {
  let getterInvoked = false;
  let queried = false;
  const forged = observation() as WhatsAppDeliveryStatusPlan & Record<string, unknown>;
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
      queried = true;
      return { rows: [] as T[] };
    },
  };

  await expectShapeRejection(() =>
    correlateWhatsAppDeliveryWithClient(client, forged, expectedRecipientId),
  );
  assert.equal(getterInvoked, false);
  assert.equal(queried, false);
});

test("trusted recipient cannot trigger custom coercion before SQL lookup", async () => {
  let coercionInvoked = false;
  let queried = false;
  const expectedRecipient = {
    toString() {
      coercionInvoked = true;
      return expectedRecipientId;
    },
  };
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      queried = true;
      return { rows: [] as T[] };
    },
  };

  await expectShapeRejection(() =>
    correlateWhatsAppDeliveryWithClient(client, observation(), expectedRecipient),
  );
  assert.equal(coercionInvoked, false);
  assert.equal(queried, false);
});

test("delivery creation input accessors are rejected without invocation", () => {
  let getterInvoked = false;
  const input: Record<string, unknown> = {
    attemptId: "attempt-1",
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
    outcome: { status: "sent", provider_message_id: "wamid.out-1" },
  };
  Object.defineProperty(input, "recipientId", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return expectedRecipientId;
    },
  });

  expectShapeError(() => createWhatsAppDeliveryState(input as never));
  assert.equal(getterInvoked, false);
});

test("forged send outcome status accessors are rejected before delivery creation", () => {
  let getterInvoked = false;
  const outcome: Record<string, unknown> = {
    provider_message_id: "wamid.out-1",
  };
  Object.defineProperty(outcome, "status", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "sent";
    },
  });

  expectShapeError(() =>
    createWhatsAppDeliveryState({
      attemptId: "attempt-1",
      wabaId: "1234567890",
      phoneNumberId: "9876543210",
      outcome: outcome as never,
    }),
  );
  assert.equal(getterInvoked, false);
});

test("unknown send outcome cannot become uncertain implicitly", () => {
  expectShapeError(() =>
    createWhatsAppDeliveryState({
      attemptId: "attempt-1",
      wabaId: "1234567890",
      phoneNumberId: "9876543210",
      outcome: { status: "mystery", code: "UNKNOWN" } as never,
    }),
  );
});

test("delivery-state accessors are rejected before reduction", () => {
  const state = sentState();
  let getterInvoked = false;
  Object.defineProperty(state, "phase", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "sent";
    },
  });

  expectShapeError(() => reduceWhatsAppDeliveryStatus(state, normalizedStatus()));
  assert.equal(getterInvoked, false);
});

test("status error-code array accessors are rejected before reduction", () => {
  const event = normalizedStatus();
  let getterInvoked = false;
  const codes: string[] = ["131000"];
  Object.defineProperty(codes, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "131000";
    },
  });
  event.error_codes = codes;

  expectShapeError(() => reduceWhatsAppDeliveryStatus(sentState(), event));
  assert.equal(getterInvoked, false);
});

test("reconciliation root accessors are rejected before owner coercion", () => {
  let getterInvoked = false;
  const input: Record<string, unknown> = {
    channelId: "channel-1",
    state: sentState(),
    observation: observation(),
  };
  Object.defineProperty(input, "merchantId", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "merchant-1";
    },
  });

  expectShapeError(() => planWhatsAppDeliveryReconciliation(input as never));
  assert.equal(getterInvoked, false);
});

test("reconciliation owner cannot trigger custom string coercion", () => {
  let coercionInvoked = false;
  const merchantId = {
    toString() {
      coercionInvoked = true;
      return "merchant-1";
    },
  };

  expectShapeError(() =>
    planWhatsAppDeliveryReconciliation({
      merchantId,
      channelId: "channel-1",
      state: sentState(),
      observation: observation(),
    }),
  );
  assert.equal(coercionInvoked, false);
});

test("uncertain delivery error accumulation remains internally bounded", () => {
  const state: WhatsAppDeliveryState = {
    ...sentState(),
    phase: "uncertain",
    error_codes: Array.from({ length: 100 }, (_, index) => `OLD_${index}`),
  };
  const result = reduceWhatsAppDeliveryStatus(
    state,
    normalizedStatus({
      status: "failed",
      error_codes: Array.from({ length: 100 }, (_, index) => `NEW_${index}`),
    }),
  );

  assert.equal(result.state.phase, "uncertain");
  assert.equal(result.state.error_codes.length, 100);
  assert.deepEqual(result.state.error_codes, state.error_codes);
});
