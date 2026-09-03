import assert from "node:assert/strict";
import test from "node:test";
import {
  rehearseWhatsAppOfflineOutbound,
} from "../src/services/whatsappOfflineOutboundRehearsal";
import {
  previewDormantWhatsAppTextSend,
} from "../src/services/whatsappOutboundPolicy";

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

function previewInput() {
  return {
    merchantId: "merchant-1",
    channel,
    to: "9647711111111",
    messageText: "hello",
    graphVersion: "v30.0",
  };
}

function rehearsalInput() {
  return {
    ...previewInput(),
    replyIntentId: "reply-intent-1",
    attemptNumber: 1,
    inboundEventId: "inbound-event-1",
    reservationId: "reservation-1",
    attemptedAt: "2026-09-03T00:00:00.000Z",
    finalizedAt: "2026-09-03T00:00:01.000Z",
    observation: { kind: "timeout" as const },
  };
}

function expectShapeError(run: () => unknown) {
  assert.throws(
    run,
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OUTBOUND_POLICY_SHAPE_INVALID",
  );
}

test("preview merchant accessor is rejected without invocation", () => {
  let getterInvoked = false;
  const forged = previewInput() as ReturnType<typeof previewInput> &
    Record<string, unknown>;
  Object.defineProperty(forged, "merchantId", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "merchant-1";
    },
  });

  expectShapeError(() => previewDormantWhatsAppTextSend(forged));
  assert.equal(getterInvoked, false);
});

test("dormant channel accessors are rejected before tenant mapping", () => {
  let getterInvoked = false;
  const forgedChannel = { ...channel } as typeof channel & Record<string, unknown>;
  Object.defineProperty(forgedChannel, "merchant_id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "merchant-1";
    },
  });

  expectShapeError(() =>
    previewDormantWhatsAppTextSend({
      ...previewInput(),
      channel: forgedChannel,
    }),
  );
  assert.equal(getterInvoked, false);
});

test("merchant identity object cannot execute custom string coercion", () => {
  let coercionInvoked = false;
  const merchantId = {
    toString() {
      coercionInvoked = true;
      return "merchant-1";
    },
  };

  expectShapeError(() =>
    previewDormantWhatsAppTextSend({
      ...previewInput(),
      merchantId,
    }),
  );
  assert.equal(coercionInvoked, false);
});

test("readiness accessors are rejected before cutover evidence is read", () => {
  let getterInvoked = false;
  const readiness: Record<string, unknown> = {
    environment: "staging",
    offline_foundation_enabled: true,
    live_cutover_requested: true,
    ready_for_external_activation: false,
    blockers: ["WHATSAPP_DORMANT_DATABASE_BARRIER_ACTIVE"],
  };
  Object.defineProperty(readiness, "mode", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "blocked";
    },
  });

  expectShapeError(() =>
    previewDormantWhatsAppTextSend({
      ...previewInput(),
      readiness: readiness as never,
    }),
  );
  assert.equal(getterInvoked, false);
});

test("rehearsal root accessors are rejected before preview or attempt planning", () => {
  let getterInvoked = false;
  const forged = rehearsalInput() as ReturnType<typeof rehearsalInput> &
    Record<string, unknown>;
  Object.defineProperty(forged, "replyIntentId", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "reply-intent-1";
    },
  });

  expectShapeError(() => rehearseWhatsAppOfflineOutbound(forged));
  assert.equal(getterInvoked, false);
});

test("fake observation accessors are rejected before classification", () => {
  let getterInvoked = false;
  const observation: Record<string, unknown> = {};
  Object.defineProperty(observation, "kind", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "timeout";
    },
  });

  expectShapeError(() =>
    rehearseWhatsAppOfflineOutbound({
      ...rehearsalInput(),
      observation: observation as never,
    }),
  );
  assert.equal(getterInvoked, false);
});

test("unknown primitive fake observation keeps the established semantic failure", () => {
  assert.throws(
    () =>
      rehearseWhatsAppOfflineOutbound({
        ...rehearsalInput(),
        observation: { kind: "mystery" } as never,
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_FAKE_TRANSPORT_OBSERVATION_INVALID",
  );
});
