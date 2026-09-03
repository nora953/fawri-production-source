import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeWhatsAppInboundMessage,
  type WhatsAppInboundBridgeInput,
  type WhatsAppInboundBridgeResult,
} from "../src/services/whatsappInboundBridge";
import {
  buildWhatsAppConversationPersistencePlan,
} from "../src/services/whatsappConversationPersistencePlan";
import {
  buildWhatsAppReplyDecisionHandoff,
} from "../src/services/whatsappReplyDecisionHandoff";

function job(
  overrides: Partial<WhatsAppInboundBridgeInput> = {},
): WhatsAppInboundBridgeInput {
  return {
    job_type: "whatsapp_inbound_message",
    event_id: "event-1",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.1",
    customer_id: "9647711111111",
    message_kind: "text",
    text: "hello",
    ...overrides,
  };
}

function expectCode(run: () => unknown, code: string) {
  assert.throws(
    run,
    (error: unknown) => (error as { code?: string }).code === code,
  );
}

test("direct inbound-job accessors are rejected without invocation", () => {
  let getterInvoked = false;
  const forged = job() as WhatsAppInboundBridgeInput & Record<string, unknown>;
  Object.defineProperty(forged, "merchant_id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "merchant-1";
    },
  });

  expectCode(
    () => bridgeWhatsAppInboundMessage(forged),
    "WHATSAPP_INBOUND_JOB_SHAPE_INVALID",
  );
  assert.equal(getterInvoked, false);
});

test("provider-reference accessors are rejected before bridge normalization", () => {
  let getterInvoked = false;
  const reference: Record<string, unknown> = {
    kind: "media",
    media_kind: "image",
  };
  Object.defineProperty(reference, "id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "media-1";
    },
  });

  expectCode(
    () =>
      bridgeWhatsAppInboundMessage(
        job({
          message_kind: "image",
          text: undefined,
          provider_reference: reference as never,
        }),
      ),
    "WHATSAPP_INBOUND_JOB_SHAPE_INVALID",
  );
  assert.equal(getterInvoked, false);
});

test("structural guard does not replace established semantic bridge errors", () => {
  expectCode(
    () => bridgeWhatsAppInboundMessage(job({ event_id: "bad\u0000event" })),
    "WHATSAPP_INBOUND_BRIDGE_IDENTITY_INVALID",
  );
  expectCode(
    () =>
      bridgeWhatsAppInboundMessage(
        job({
          message_kind: "image",
          text: undefined,
          provider_reference: {
            kind: "media",
            media_kind: "document",
            id: "media-1",
          },
        }),
      ),
    "WHATSAPP_INBOUND_BRIDGE_PROVIDER_REFERENCE_INVALID",
  );
});

test("forged bridge message accessors are rejected before persistence or decision reads", () => {
  for (const consume of [
    (value: WhatsAppInboundBridgeResult) =>
      buildWhatsAppConversationPersistencePlan(value),
    (value: WhatsAppInboundBridgeResult) =>
      buildWhatsAppReplyDecisionHandoff(value),
  ]) {
    let getterInvoked = false;
    const forged = structuredClone(
      bridgeWhatsAppInboundMessage(job()),
    ) as WhatsAppInboundBridgeResult;
    Object.defineProperty(forged.message, "text", {
      enumerable: true,
      configurable: true,
      get() {
        getterInvoked = true;
        return "hello";
      },
    });

    expectCode(
      () => consume(forged),
      "WHATSAPP_INBOUND_BRIDGE_RESULT_SHAPE_INVALID",
    );
    assert.equal(getterInvoked, false);
  }
});

test("forged nested provider-reference accessors never reach persistence clone or display logic", () => {
  let getterInvoked = false;
  const forged = structuredClone(
    bridgeWhatsAppInboundMessage(
      job({
        message_kind: "image",
        text: undefined,
        provider_reference: {
          kind: "media",
          media_kind: "image",
          id: "media-1",
          caption: "safe caption",
        },
      }),
    ),
  ) as WhatsAppInboundBridgeResult;
  const reference = forged.message.provider_reference as Record<string, unknown>;
  Object.defineProperty(reference, "caption", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "should-not-run";
    },
  });

  expectCode(
    () => buildWhatsAppConversationPersistencePlan(forged),
    "WHATSAPP_INBOUND_BRIDGE_RESULT_SHAPE_INVALID",
  );
  assert.equal(getterInvoked, false);
});

test("bridge deterministic identity keys cannot be forged before persistence or reply handoff", () => {
  const forged = structuredClone(
    bridgeWhatsAppInboundMessage(job()),
  ) as WhatsAppInboundBridgeResult;
  forged.message.conversation_key = "whatsapp-conversation-forged";

  expectCode(
    () => buildWhatsAppConversationPersistencePlan(forged),
    "WHATSAPP_INBOUND_BRIDGE_RESULT_SHAPE_INVALID",
  );
  expectCode(
    () => buildWhatsAppReplyDecisionHandoff(forged),
    "WHATSAPP_INBOUND_BRIDGE_RESULT_SHAPE_INVALID",
  );
});

test("unsafe forged customer text still belongs to the final decision text boundary", () => {
  const forged = structuredClone(
    bridgeWhatsAppInboundMessage(job()),
  ) as WhatsAppInboundBridgeResult;
  forged.message.text = "hello\u0000world";

  expectCode(
    () => buildWhatsAppReplyDecisionHandoff(forged),
    "WHATSAPP_REPLY_DECISION_TEXT_INVALID",
  );
  expectCode(
    () => buildWhatsAppConversationPersistencePlan(forged),
    "WHATSAPP_CONVERSATION_PERSISTENCE_TEXT_INVALID",
  );
});
