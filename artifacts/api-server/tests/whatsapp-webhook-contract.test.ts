import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWhatsAppWebhookPayload,
  whatsAppLiveCutoverRequested,
  whatsAppOfflineFoundationEnabled,
} from "../src/services/whatsappWebhookContract";

function messagePayload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+9647700000000",
                phone_number_id: "phone-456",
              },
              contacts: [
                {
                  profile: { name: "Customer" },
                  wa_id: "9647711111111",
                },
              ],
              messages: [
                {
                  from: "9647711111111",
                  id: "wamid.message-1",
                  timestamp: "1788380000",
                  type: "text",
                  text: { body: "السلام عليكم" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("WhatsApp foundation stays disabled unless explicitly enabled", () => {
  assert.equal(whatsAppOfflineFoundationEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(
    whatsAppOfflineFoundationEnabled({
      FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
    } as NodeJS.ProcessEnv),
    true,
  );
});

test("WhatsApp live cutover is independent and fail-closed", () => {
  assert.equal(whatsAppLiveCutoverRequested({} as NodeJS.ProcessEnv), false);
  assert.equal(
    whatsAppLiveCutoverRequested({
      FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
    } as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(
    whatsAppLiveCutoverRequested({
      FAWRI_WHATSAPP_LIVE_CUTOVER: "1",
    } as NodeJS.ProcessEnv),
    true,
  );
});

test("normalizes a WhatsApp text message without side effects", () => {
  const result = parseWhatsAppWebhookPayload(messagePayload());
  assert.equal(result.supported, true);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    event_id: "whatsapp:waba-123:phone-456:message:wamid.message-1",
    event_kind: "message",
    waba_id: "waba-123",
    phone_number_id: "phone-456",
    display_phone_number: "+9647700000000",
    external_message_id: "wamid.message-1",
    customer_id: "9647711111111",
    customer_name: "Customer",
    message_kind: "text",
    text: "السلام عليكم",
    timestamp: "1788380000",
  });
});

test("normalizes button and interactive replies into text", () => {
  const payload = messagePayload();
  const value = payload.entry[0].changes[0].value;
  value.messages = [
    {
      from: "9647711111111",
      id: "wamid.button",
      timestamp: "1788380001",
      type: "button",
      button: { text: "نعم", payload: "yes" },
    },
    {
      from: "9647711111111",
      id: "wamid.interactive",
      timestamp: "1788380002",
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "confirm", title: "تأكيد" },
      },
    },
  ] as never;

  const result = parseWhatsAppWebhookPayload(payload);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].event_kind, "message");
  assert.equal(result.events[0].event_kind === "message" ? result.events[0].text : "", "نعم");
  assert.equal(result.events[1].event_kind, "message");
  assert.equal(
    result.events[1].event_kind === "message" ? result.events[1].text : "",
    "تأكيد",
  );
});

test("normalizes delivery statuses and preserves provider error codes", () => {
  const payload = messagePayload();
  const value = payload.entry[0].changes[0].value;
  value.messages = [];
  Object.assign(value, {
    statuses: [
      {
        id: "wamid.outbound-1",
        status: "failed",
        timestamp: "1788380100",
        recipient_id: "9647711111111",
        errors: [{ code: 131026 }, { code: 131026 }, { code: 130429 }],
      },
    ],
  });

  const result = parseWhatsAppWebhookPayload(payload);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    event_id: "whatsapp:waba-123:phone-456:status:wamid.outbound-1:failed",
    event_kind: "status",
    waba_id: "waba-123",
    phone_number_id: "phone-456",
    external_message_id: "wamid.outbound-1",
    recipient_id: "9647711111111",
    status: "failed",
    timestamp: "1788380100",
    error_codes: ["131026", "130429"],
  });
});

test("deduplicates identical webhook events inside one delivery", () => {
  const payload = messagePayload();
  const message = payload.entry[0].changes[0].value.messages[0];
  payload.entry[0].changes[0].value.messages.push({ ...message });

  const result = parseWhatsAppWebhookPayload(payload);
  assert.equal(result.events.length, 1);
});

test("unsupported Meta objects do not get treated as WhatsApp", () => {
  const result = parseWhatsAppWebhookPayload({
    object: "page",
    entry: [],
  });
  assert.deepEqual(result, {
    supported: false,
    object: "page",
    events: [],
    ignored_changes: 0,
    malformed_changes: 0,
  });
});

test("malformed changes fail closed instead of inventing identities", () => {
  const result = parseWhatsAppWebhookPayload({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-123",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {},
              messages: [
                {
                  from: "9647711111111",
                  id: "wamid.message-1",
                  type: "text",
                  text: { body: "hello" },
                },
              ],
            },
          },
          {
            field: "account_update",
            value: {},
          },
        ],
      },
    ],
  });

  assert.equal(result.supported, true);
  assert.equal(result.events.length, 0);
  assert.equal(result.malformed_changes, 1);
  assert.equal(result.ignored_changes, 1);
});

test("normalizes top-level WhatsApp errors without exposing raw payloads", () => {
  const result = parseWhatsAppWebhookPayload({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-123",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-456" },
              errors: [
                {
                  code: 131000,
                  title: "Generic error",
                  message: "Provider rejected event",
                  error_data: { details: "internal detail" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.equal(event.event_kind, "error");
  if (event.event_kind !== "error") throw new Error("expected error event");
  assert.equal(event.code, "131000");
  assert.equal(event.title, "Generic error");
  assert.equal(event.message, "Provider rejected event");
  assert.match(event.event_id, /^whatsapp:waba-123:phone-456:error:[a-f0-9]{64}$/);
});
