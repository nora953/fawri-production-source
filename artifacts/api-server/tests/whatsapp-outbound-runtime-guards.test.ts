import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppTextSendPlan,
  type WhatsAppTextSendPlan,
} from "../src/services/whatsappOfflineContracts";
import {
  assertWhatsAppOutboundAttemptIntegrity,
  createWhatsAppOutboundAttemptPlan,
  type WhatsAppOutboundAttemptPlan,
} from "../src/services/whatsappOutboundAttempt";
import {
  planWhatsAppOutboundDeliveryPersistence,
} from "../src/services/whatsappOutboundDeliveryPersistence";
import {
  planWhatsAppOutboundDispatch,
} from "../src/services/whatsappOutboundDispatchPlan";
import type { ResolvedDormantWhatsAppChannel } from "../src/services/whatsappDormantChannelResolver";

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

function request(): WhatsAppTextSendPlan {
  return buildWhatsAppTextSendPlan({
    phoneNumberId: channel.phone_number_id,
    to: "+9647711111111",
    messageText: "hello",
    graphVersion: "v30.0",
  });
}

function createInput() {
  return {
    merchantId: "merchant-1",
    replyIntentId: "reply-intent-1",
    attemptNumber: 1,
    channel,
    request: request(),
  };
}

function attempt() {
  return createWhatsAppOutboundAttemptPlan(createInput());
}

function expectShapeError(run: () => unknown) {
  assert.throws(
    run,
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_OUTBOUND_SHAPE_INVALID",
  );
}

test("outbound create input accessors are rejected without invocation", () => {
  let getterInvoked = false;
  const forged = createInput() as ReturnType<typeof createInput> &
    Record<string, unknown>;
  Object.defineProperty(forged, "merchantId", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "merchant-1";
    },
  });

  expectShapeError(() => createWhatsAppOutboundAttemptPlan(forged));
  assert.equal(getterInvoked, false);
});

test("nested outbound request accessors cannot execute before hashing or cloning", () => {
  let getterInvoked = false;
  const forged = createInput();
  Object.defineProperty(forged.request.body, "to", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "9647711111111";
    },
  });

  expectShapeError(() => createWhatsAppOutboundAttemptPlan(forged));
  assert.equal(getterInvoked, false);
});

test("proxied outbound requests are rejected before deterministic hashing", () => {
  const forged = createInput();
  forged.request = new Proxy(forged.request, {});
  expectShapeError(() => createWhatsAppOutboundAttemptPlan(forged));
});

test("attempt integrity rejects forged accessors without invoking them", () => {
  const forged = attempt();
  let getterInvoked = false;
  Object.defineProperty(forged, "request_sha256", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "0".repeat(64);
    },
  });

  expectShapeError(() => assertWhatsAppOutboundAttemptIntegrity(forged));
  assert.equal(getterInvoked, false);
});

test("nested attempt request accessors are rejected before integrity rehashing", () => {
  const forged = attempt();
  let getterInvoked = false;
  Object.defineProperty(forged.request.body.text, "body", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "hello";
    },
  });

  expectShapeError(() => assertWhatsAppOutboundAttemptIntegrity(forged));
  assert.equal(getterInvoked, false);
});

test("valid outbound attempt remains accepted after structural hardening", () => {
  const valid = attempt();
  assert.doesNotThrow(() => assertWhatsAppOutboundAttemptIntegrity(valid));
});

test("unexpected outbound attempt fields fail closed before integrity processing", () => {
  const forged = attempt() as WhatsAppOutboundAttemptPlan & Record<string, unknown>;
  forged.untrusted_extra = "must-not-pass";
  expectShapeError(() => assertWhatsAppOutboundAttemptIntegrity(forged));
});

test("dispatch input accessors are rejected before attempt or scalar reads", () => {
  const forged = {
    attempt: attempt(),
    inboundEventId: "inbound-event-1",
    attemptedAt: "2026-09-03T00:00:00.000Z",
  } as Record<string, unknown>;
  let getterInvoked = false;
  Object.defineProperty(forged, "inboundEventId", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "inbound-event-1";
    },
  });

  expectShapeError(() => planWhatsAppOutboundDispatch(forged as never));
  assert.equal(getterInvoked, false);
});

test("persistence outcome accessors are rejected before outcome branching", () => {
  const outcome: Record<string, unknown> = {
    provider_message_id: "wamid.out-1",
  };
  let getterInvoked = false;
  Object.defineProperty(outcome, "status", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "sent";
    },
  });

  expectShapeError(() =>
    planWhatsAppOutboundDeliveryPersistence({
      attempt: attempt(),
      inboundEventId: "inbound-event-1",
      attemptedAt: "2026-09-03T00:00:00.000Z",
      finalizedAt: "2026-09-03T00:00:01.000Z",
      outcome: outcome as never,
    }),
  );
  assert.equal(getterInvoked, false);
});

test("non-scalar timestamps cannot trigger custom coercion", () => {
  let coercionInvoked = false;
  const attemptedAt = {
    toString() {
      coercionInvoked = true;
      return "2026-09-03T00:00:00.000Z";
    },
  };

  expectShapeError(() =>
    planWhatsAppOutboundDeliveryPersistence({
      attempt: attempt(),
      inboundEventId: "inbound-event-1",
      attemptedAt,
    }),
  );
  assert.equal(coercionInvoked, false);
});

test("unknown observed send statuses fail closed instead of becoming uncertainty implicitly", () => {
  expectShapeError(() =>
    planWhatsAppOutboundDeliveryPersistence({
      attempt: attempt(),
      inboundEventId: "inbound-event-1",
      attemptedAt: "2026-09-03T00:00:00.000Z",
      finalizedAt: "2026-09-03T00:00:01.000Z",
      outcome: {
        status: "mystery",
        code: "UNKNOWN",
      } as never,
    }),
  );
});
