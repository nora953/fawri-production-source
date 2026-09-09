import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppTextSendPlan,
  classifyWhatsAppSendResponse,
} from "../src/services/whatsappOfflineContracts";

function expectShapeError(run: () => unknown) {
  assert.throws(
    run,
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OFFLINE_CONTRACT_SHAPE_INVALID",
  );
}

test("text-send build input accessors are rejected without invocation", () => {
  let getterInvoked = false;
  const input: Record<string, unknown> = {
    phoneNumberId: "9876543210",
    to: "9647711111111",
    graphVersion: "v30.0",
  };
  Object.defineProperty(input, "messageText", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "hello";
    },
  });

  expectShapeError(() => buildWhatsAppTextSendPlan(input as never));
  assert.equal(getterInvoked, false);
});

test("text-send scalar inputs cannot trigger custom string coercion", () => {
  let coercionInvoked = false;
  const phoneNumberId = {
    toString() {
      coercionInvoked = true;
      return "9876543210";
    },
  };

  expectShapeError(() =>
    buildWhatsAppTextSendPlan({
      phoneNumberId,
      to: "9647711111111",
      messageText: "hello",
      graphVersion: "v30.0",
    }),
  );
  assert.equal(coercionInvoked, false);
});

test("send-response root accessors are rejected before status coercion", () => {
  let getterInvoked = false;
  const input: Record<string, unknown> = {
    body: {},
  };
  Object.defineProperty(input, "httpStatus", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return 200;
    },
  });

  expectShapeError(() => classifyWhatsAppSendResponse(input as never));
  assert.equal(getterInvoked, false);
});

test("provider body accessors are rejected before message lookup", () => {
  let getterInvoked = false;
  const body: Record<string, unknown> = {};
  Object.defineProperty(body, "messages", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return [{ id: "wamid.1" }];
    },
  });

  expectShapeError(() =>
    classifyWhatsAppSendResponse({
      httpStatus: 200,
      body,
    }),
  );
  assert.equal(getterInvoked, false);
});

test("provider message id accessors are rejected before response classification", () => {
  let getterInvoked = false;
  const message: Record<string, unknown> = {};
  Object.defineProperty(message, "id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "wamid.1";
    },
  });

  expectShapeError(() =>
    classifyWhatsAppSendResponse({
      httpStatus: 200,
      body: { messages: [message] },
    }),
  );
  assert.equal(getterInvoked, false);
});

test("provider error-code accessors are rejected before failure-code construction", () => {
  let getterInvoked = false;
  const error: Record<string, unknown> = {};
  Object.defineProperty(error, "code", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return 100;
    },
  });

  expectShapeError(() =>
    classifyWhatsAppSendResponse({
      httpStatus: 400,
      body: { error },
    }),
  );
  assert.equal(getterInvoked, false);
});

test("safe scalar response status keeps existing classification semantics", () => {
  assert.deepEqual(
    classifyWhatsAppSendResponse({
      httpStatus: "200",
      body: { messages: [{ id: "wamid.1" }] },
    }),
    {
      status: "sent",
      provider_message_id: "wamid.1",
    },
  );
});
