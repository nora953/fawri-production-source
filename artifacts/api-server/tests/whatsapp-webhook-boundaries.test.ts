import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWhatsAppWebhookPayload,
} from "../src/services/whatsappWebhookContract";

function payload(message: Record<string, unknown>) {
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
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

test("oversized customer text never enters the normalized queue payload", () => {
  const oversized = "x".repeat(4_001);
  const result = parseWhatsAppWebhookPayload(
    payload({
      from: "9647711111111",
      id: "wamid.long",
      type: "text",
      text: { body: oversized },
    }),
  );

  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.equal(event.event_kind, "message");
  if (event.event_kind !== "message") throw new Error("expected message event");
  assert.equal(event.message_kind, "text");
  assert.equal(event.text, undefined);
  assert.equal(JSON.stringify(event).includes(oversized), false);
});

test("malformed WhatsApp customer identity is rejected before planning", () => {
  const result = parseWhatsAppWebhookPayload(
    payload({
      from: "not-a-whatsapp-user",
      id: "wamid.bad-user",
      type: "text",
      text: { body: "hello" },
    }),
  );
  assert.equal(result.events.length, 0);
  assert.equal(result.malformed_changes, 1);
});

test("malformed delivery recipient identity is rejected before reconciliation", () => {
  const body = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1234567890",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "9876543210" },
              statuses: [
                {
                  id: "wamid.out-1",
                  status: "delivered",
                  recipient_id: "bad-recipient",
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const result = parseWhatsAppWebhookPayload(body);
  assert.equal(result.events.length, 0);
  assert.equal(result.malformed_changes, 1);
});

test("excessive contact arrays are reduced to message-kind metadata only", () => {
  const result = parseWhatsAppWebhookPayload(
    payload({
      from: "9647711111111",
      id: "wamid.contacts-large",
      type: "contacts",
      contacts: Array.from({ length: 1_001 }, (_, index) => ({
        name: { formatted_name: `Contact ${index}` },
      })),
    }),
  );
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.equal(event.event_kind, "message");
  if (event.event_kind !== "message") throw new Error("expected message event");
  assert.equal(event.message_kind, "contacts");
  assert.equal(event.provider_reference, undefined);
  assert.equal(JSON.stringify(event).includes("Contact 1000"), false);
});
