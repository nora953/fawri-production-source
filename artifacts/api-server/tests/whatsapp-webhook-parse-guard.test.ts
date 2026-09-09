import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWhatsAppWebhookParseResultRuntime,
} from "../src/services/whatsappWebhookParseGuard";
import {
  planWhatsAppWebhookProcessing,
} from "../src/services/whatsappWebhookPlanner";
import type { ResolvedDormantWhatsAppChannel } from "../src/services/whatsappDormantChannelResolver";
import type { WhatsAppWebhookParseResult } from "../src/services/whatsappWebhookContract";

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

function event(index = 1) {
  return {
    event_id: `message-event-${index}`,
    event_kind: "message" as const,
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: `wamid.in-${index}`,
    customer_id: "9647711111111",
    message_kind: "text" as const,
    text: "hello",
  };
}

function parsed(): WhatsAppWebhookParseResult {
  return {
    supported: true,
    object: "whatsapp_business_account",
    events: [event()],
    ignored_changes: 0,
    malformed_changes: 0,
  };
}

function expectCode(run: () => unknown, code: string) {
  assert.throws(
    run,
    (error: unknown) => (error as { code?: string }).code === code,
  );
}

test("valid parsed webhook results remain accepted", () => {
  assert.doesNotThrow(() => assertWhatsAppWebhookParseResultRuntime(parsed()));
});

test("planner rejects oversized synthetic parsed event arrays before resolution", async () => {
  const fixture = parsed();
  fixture.events = Array.from({ length: 2_001 }, (_, index) => event(index + 1));
  let resolutions = 0;

  await assert.rejects(
    () =>
      planWhatsAppWebhookProcessing({
        parsed: fixture,
        resolveChannel: async () => {
          resolutions += 1;
          return channel;
        },
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_PARSED_WEBHOOK_BUDGET_EXCEEDED",
  );
  assert.equal(resolutions, 0);
});

test("parsed result accessors are rejected without invocation", () => {
  let getterInvoked = false;
  const fixture = parsed() as WhatsAppWebhookParseResult & Record<string, unknown>;
  Object.defineProperty(fixture, "events", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return [event()];
    },
  });

  expectCode(
    () => assertWhatsAppWebhookParseResultRuntime(fixture),
    "WHATSAPP_PARSED_WEBHOOK_SHAPE_INVALID",
  );
  assert.equal(getterInvoked, false);
});

test("normalized event accessors are rejected before planner fingerprinting", async () => {
  let getterInvoked = false;
  const malicious: Record<string, unknown> = {
    event_kind: "message",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.in-1",
    customer_id: "9647711111111",
    message_kind: "text",
    text: "hello",
  };
  Object.defineProperty(malicious, "event_id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "message-event";
    },
  });
  const fixture = parsed();
  fixture.events = [malicious as never];

  await assert.rejects(
    () =>
      planWhatsAppWebhookProcessing({
        parsed: fixture,
        resolveChannel: async () => channel,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_RUNTIME_SHAPE_INVALID",
  );
  assert.equal(getterInvoked, false);
});

test("unsupported parsed objects may be empty but cannot smuggle normalized events", () => {
  assert.doesNotThrow(() =>
    assertWhatsAppWebhookParseResultRuntime({
      supported: false,
      object: "",
      events: [],
      ignored_changes: 0,
      malformed_changes: 0,
    }),
  );

  expectCode(
    () =>
      assertWhatsAppWebhookParseResultRuntime({
        supported: false,
        object: "page",
        events: [event()],
        ignored_changes: 0,
        malformed_changes: 0,
      }),
    "WHATSAPP_PARSED_WEBHOOK_SHAPE_INVALID",
  );
});
