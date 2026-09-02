import assert from "node:assert/strict";
import test from "node:test";
import {
  safeWhatsAppEventDiagnostic,
  safeWhatsAppPlanDiagnostic,
} from "../src/services/whatsappSafeDiagnostics";
import type { WhatsAppWebhookProcessingPlan } from "../src/services/whatsappWebhookPlanner";

test("event diagnostics never expose message text or raw customer/channel identifiers", () => {
  const event = {
    event_id: "whatsapp:1234567890:9876543210:message:wamid.secret",
    event_kind: "message" as const,
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.secret",
    customer_id: "9647711111111",
    customer_name: "Sensitive Customer",
    message_kind: "text" as const,
    text: "sensitive order text",
  };
  const diagnostic = safeWhatsAppEventDiagnostic(event);
  const serialized = JSON.stringify(diagnostic);
  assert.equal(serialized.includes("sensitive order text"), false);
  assert.equal(serialized.includes("Sensitive Customer"), false);
  assert.equal(serialized.includes("9647711111111"), false);
  assert.equal(serialized.includes("1234567890"), false);
  assert.equal(serialized.includes("9876543210"), false);
  assert.equal(serialized.includes("wamid.secret"), false);
  assert.match(diagnostic.event_hash, /^[a-f0-9]{24}$/);
});

test("provider error diagnostics preserve only safe codes", () => {
  const diagnostic = safeWhatsAppEventDiagnostic({
    event_id: "error-1",
    event_kind: "error",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    code: "131000",
    title: "sensitive title",
    message: "sensitive provider detail",
  });
  assert.deepEqual(diagnostic.provider_error_codes, ["131000"]);
  const serialized = JSON.stringify(diagnostic);
  assert.equal(serialized.includes("sensitive title"), false);
  assert.equal(serialized.includes("sensitive provider detail"), false);
});

test("plan diagnostics contain counts and hashes instead of business payloads", () => {
  const plan: WhatsAppWebhookProcessingPlan = {
    mode: "offline_replay",
    supported: true,
    provider_object: "whatsapp_business_account",
    ignored_changes: 0,
    malformed_changes: 0,
    duplicate_events: 0,
    inbound_messages: [
      {
        job_type: "whatsapp_inbound_message",
        event_id: "event-1",
        merchant_id: "merchant-1",
        channel: "whatsapp",
        waba_id: "1234567890",
        phone_number_id: "9876543210",
        external_message_id: "wamid.1",
        customer_id: "9647711111111",
        message_kind: "text",
        text: "private text",
      },
    ],
    delivery_statuses: [],
    provider_errors: [],
  };
  const diagnostic = safeWhatsAppPlanDiagnostic(plan);
  assert.equal(diagnostic.inbound_message_count, 1);
  assert.equal(diagnostic.merchant_hashes.length, 1);
  assert.equal(diagnostic.channel_hashes.length, 1);
  const serialized = JSON.stringify(diagnostic);
  assert.equal(serialized.includes("merchant-1"), false);
  assert.equal(serialized.includes("private text"), false);
  assert.equal(serialized.includes("9647711111111"), false);
});
