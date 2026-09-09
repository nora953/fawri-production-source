import assert from "node:assert/strict";
import test from "node:test";
import { parseWhatsAppWebhookPayload } from "../src/services/whatsappWebhookContract";

function payload(messages: Record<string, unknown>[]) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1234567890",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "9876543210" },
              messages,
            },
          },
        ],
      },
    ],
  };
}

function message(text: string) {
  return {
    from: "9647711111111",
    id: "wamid.same-provider-id",
    timestamp: "1788380000",
    type: "text",
    text: { body: text },
  };
}

test("exact provider retries dedupe without becoming malformed", () => {
  const original = message("hello");
  const result = parseWhatsAppWebhookPayload(
    payload([original, structuredClone(original)]),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.malformed_changes, 0);
  assert.match(result.events[0].event_id, /^whatsapp:message:[a-f0-9]{64}$/);
});

test("same provider message identity with conflicting normalized payload fails closed", () => {
  const result = parseWhatsAppWebhookPayload(
    payload([message("first payload"), message("conflicting payload")]),
  );

  assert.equal(result.events.length, 0);
  assert.equal(result.malformed_changes, 1);
});

test("once an event identity conflicts it cannot be restored by a later duplicate", () => {
  const first = message("first payload");
  const result = parseWhatsAppWebhookPayload(
    payload([
      first,
      message("conflicting payload"),
      structuredClone(first),
    ]),
  );

  assert.equal(result.events.length, 0);
  assert.equal(result.malformed_changes, 1);
});
