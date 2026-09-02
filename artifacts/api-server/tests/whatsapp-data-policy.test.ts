import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSafeWhatsAppFailureMetadata,
  WHATSAPP_DATA_HANDLING_POLICY,
} from "../src/services/whatsappDataPolicy";

test("dormant WhatsApp policy forbids raw webhook and credential persistence", () => {
  assert.deepEqual(WHATSAPP_DATA_HANDLING_POLICY, {
    raw_webhook_persistence_allowed: false,
    raw_webhook_logging_allowed: false,
    encrypted_queue_payload_required: true,
    diagnostic_customer_payload_allowed: false,
    diagnostic_raw_identifier_allowed: false,
    dormant_credential_storage_allowed: false,
    retention_class: "operational_transient",
  });
});

test("failure metadata contains hashes and operational codes only", () => {
  const metadata = buildSafeWhatsAppFailureMetadata({
    jobType: "whatsapp_inbound_message",
    reasonCode: "WHATSAPP_PROCESSING_FAILED",
    attemptNumber: 2,
    payload: {
      event_id: "event-secret",
      merchant_id: "merchant-secret",
      channel_id: "channel-secret",
      external_message_id: "wamid.secret",
      customer_id: "9647711111111",
      customer_name: "Private Name",
      text: "private message text",
      waba_id: "1234567890",
      phone_number_id: "9876543210",
    },
  });
  assert.equal(metadata.job_type, "whatsapp_inbound_message");
  assert.equal(metadata.reason_code, "WHATSAPP_PROCESSING_FAILED");
  const serialized = JSON.stringify(metadata);
  for (const forbidden of [
    "event-secret",
    "merchant-secret",
    "channel-secret",
    "wamid.secret",
    "9647711111111",
    "Private Name",
    "private message text",
    "1234567890",
    "9876543210",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.match(metadata.event_hash || "", /^[a-f0-9]{24}$/);
  assert.match(metadata.merchant_hash || "", /^[a-f0-9]{24}$/);
  assert.match(metadata.channel_hash || "", /^[a-f0-9]{24}$/);
  assert.match(metadata.external_message_hash || "", /^[a-f0-9]{24}$/);
});

test("unsafe reason text is replaced rather than logged", () => {
  const metadata = buildSafeWhatsAppFailureMetadata({
    jobType: "whatsapp_inbound_message",
    reasonCode: "customer said: private text",
    attemptNumber: 1,
  });
  assert.equal(metadata.reason_code, "WHATSAPP_FAILURE_REDACTED");
});
