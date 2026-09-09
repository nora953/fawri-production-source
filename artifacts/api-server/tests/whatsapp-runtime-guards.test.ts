import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppDurableQueuePlan,
} from "../src/services/whatsappDurableQueuePlan";
import {
  buildWhatsAppInboundIntakeTransactionPlan,
} from "../src/services/whatsappInboundIntakePlan";
import {
  assertWhatsAppWebhookProcessingPlanRuntime,
} from "../src/services/whatsappRuntimeGuards";
import {
  safeWhatsAppEventDiagnostic,
  safeWhatsAppPlanDiagnostic,
} from "../src/services/whatsappSafeDiagnostics";
import type { WhatsAppWebhookProcessingPlan } from "../src/services/whatsappWebhookPlanner";

function inboundMessage(index = 1) {
  return {
    job_type: "whatsapp_inbound_message" as const,
    event_id: `message-event-${index}`,
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    channel: "whatsapp" as const,
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: `wamid.in-${index}`,
    customer_id: "9647711111111",
    message_kind: "text" as const,
    text: "hello",
  };
}

function processingPlan(): WhatsAppWebhookProcessingPlan {
  return {
    mode: "offline_replay",
    supported: true,
    provider_object: "whatsapp_business_account",
    ignored_changes: 0,
    malformed_changes: 0,
    duplicate_events: 0,
    inbound_messages: [inboundMessage()],
    delivery_statuses: [],
    provider_errors: [],
  };
}

function expectInvalid(run: () => unknown, code = "WHATSAPP_RUNTIME_SHAPE_INVALID") {
  assert.throws(
    run,
    (error: unknown) => (error as { code?: string }).code === code,
  );
}

test("valid planner output remains usable by queue, intake, and safe diagnostics", () => {
  const plan = processingPlan();
  assert.doesNotThrow(() => assertWhatsAppWebhookProcessingPlanRuntime(plan));
  assert.equal(buildWhatsAppDurableQueuePlan(plan).jobs.length, 1);
  assert.equal(buildWhatsAppInboundIntakeTransactionPlan(plan).units.length, 1);
  assert.equal(safeWhatsAppPlanDiagnostic(plan).inbound_message_count, 1);
});

test("synthetic callers cannot exceed the total processing-plan event budget", () => {
  const plan = processingPlan();
  plan.inbound_messages = Array.from({ length: 2_001 }, (_, index) =>
    inboundMessage(index + 1),
  );

  expectInvalid(
    () => assertWhatsAppWebhookProcessingPlanRuntime(plan),
    "WHATSAPP_RUNTIME_SHAPE_BUDGET_EXCEEDED",
  );
  expectInvalid(
    () => buildWhatsAppDurableQueuePlan(plan),
    "WHATSAPP_RUNTIME_SHAPE_BUDGET_EXCEEDED",
  );
  expectInvalid(
    () => buildWhatsAppInboundIntakeTransactionPlan(plan),
    "WHATSAPP_RUNTIME_SHAPE_BUDGET_EXCEEDED",
  );
  expectInvalid(
    () => safeWhatsAppPlanDiagnostic(plan),
    "WHATSAPP_RUNTIME_SHAPE_BUDGET_EXCEEDED",
  );
});

test("plan accessors are rejected before queue or intake spreading can execute them", () => {
  for (const run of [
    (plan: WhatsAppWebhookProcessingPlan) => buildWhatsAppDurableQueuePlan(plan),
    (plan: WhatsAppWebhookProcessingPlan) =>
      buildWhatsAppInboundIntakeTransactionPlan(plan),
    (plan: WhatsAppWebhookProcessingPlan) => safeWhatsAppPlanDiagnostic(plan),
  ]) {
    let getterInvoked = false;
    const plan = processingPlan() as WhatsAppWebhookProcessingPlan &
      Record<string, unknown>;
    Object.defineProperty(plan, "inbound_messages", {
      enumerable: true,
      configurable: true,
      get() {
        getterInvoked = true;
        return [inboundMessage()];
      },
    });

    expectInvalid(() => run(plan));
    assert.equal(getterInvoked, false);
  }
});

test("nested provider-reference accessors are rejected without invocation", () => {
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
      return "media-secret";
    },
  });

  const plan = processingPlan();
  plan.inbound_messages[0] = {
    ...plan.inbound_messages[0],
    message_kind: "image",
    text: undefined,
    provider_reference: reference as never,
  };

  expectInvalid(() => buildWhatsAppDurableQueuePlan(plan));
  assert.equal(getterInvoked, false);
});

test("status error-code arrays keep the parser's bounded nested workload contract", () => {
  const plan = processingPlan();
  plan.inbound_messages = [];
  plan.delivery_statuses = [
    {
      event_id: "status-event",
      merchant_id: "merchant-1",
      channel_id: "channel-1",
      waba_id: "1234567890",
      phone_number_id: "9876543210",
      external_message_id: "wamid.out-1",
      status: "failed",
      error_codes: Array.from({ length: 101 }, (_, index) => String(130000 + index)),
    },
  ];

  expectInvalid(
    () => buildWhatsAppInboundIntakeTransactionPlan(plan),
    "WHATSAPP_RUNTIME_SHAPE_BUDGET_EXCEEDED",
  );
});

test("safe event diagnostics reject accessor-bearing synthetic events before hashing", () => {
  let getterInvoked = false;
  const event: Record<string, unknown> = {
    event_kind: "message",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.in-1",
    customer_id: "9647711111111",
    message_kind: "text",
    text: "hello",
  };
  Object.defineProperty(event, "event_id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "message-event";
    },
  });

  expectInvalid(() => safeWhatsAppEventDiagnostic(event as never));
  assert.equal(getterInvoked, false);
});

test("unsupported extra plan properties fail before they can enter privileged payloads", () => {
  const plan = processingPlan() as WhatsAppWebhookProcessingPlan & {
    raw_webhook?: string;
  };
  plan.raw_webhook = "must-never-flow-through";
  expectInvalid(() => buildWhatsAppDurableQueuePlan(plan));
});
