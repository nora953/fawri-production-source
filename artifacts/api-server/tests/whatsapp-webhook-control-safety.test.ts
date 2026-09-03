import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWhatsAppWebhookPayload,
} from "../src/services/whatsappWebhookContract";

function messagePayload(input: {
  message: Record<string, unknown>;
  contacts?: unknown[];
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1234567890",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: "9876543210",
                display_phone_number: "+964 770 000 0000",
              },
              ...(input.contacts ? { contacts: input.contacts } : {}),
              messages: [input.message],
            },
          },
        ],
      },
    ],
  };
}

function firstMessageEvent(payload: unknown) {
  const result = parseWhatsAppWebhookPayload(payload);
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.equal(event.event_kind, "message");
  if (event.event_kind !== "message") throw new Error("expected message event");
  return event;
}

test("human message text keeps normal multiline whitespace but rejects unsafe control bytes", () => {
  const safe = firstMessageEvent(
    messagePayload({
      message: {
        from: "9647711111111",
        id: "wamid.safe-text",
        type: "text",
        text: { body: "السطر الأول\nالسطر الثاني\tOK" },
      },
    }),
  );
  assert.equal(safe.text, "السطر الأول\nالسطر الثاني\tOK");

  const unsafe = firstMessageEvent(
    messagePayload({
      message: {
        from: "9647711111111",
        id: "wamid.unsafe-text",
        type: "text",
        text: { body: "hello\u0000world" },
      },
    }),
  );
  assert.equal(unsafe.message_kind, "text");
  assert.equal(unsafe.text, undefined);
  assert.equal(JSON.stringify(unsafe).includes("world"), false);
});

test("single-line contact and media metadata containing controls is omitted before planning", () => {
  const event = firstMessageEvent(
    messagePayload({
      contacts: [
        {
          wa_id: "9647711111111",
          profile: { name: "Bad\nName" },
        },
      ],
      message: {
        from: "9647711111111",
        id: "wamid.image-control-metadata",
        type: "image",
        image: {
          id: "media-123",
          mime_type: "image/jpeg\nspoofed",
          sha256: "abc\rdef",
          caption: "Line one\nLine two",
          filename: "bad\tname.jpg",
        },
      },
    }),
  );

  assert.equal(event.customer_name, undefined);
  assert.deepEqual(event.provider_reference, {
    kind: "media",
    media_kind: "image",
    id: "media-123",
    caption: "Line one\nLine two",
  });
});

test("location address may remain multiline while location name remains single-line only", () => {
  const event = firstMessageEvent(
    messagePayload({
      message: {
        from: "9647711111111",
        id: "wamid.location-controls",
        type: "location",
        location: {
          latitude: 33.3152,
          longitude: 44.3661,
          name: "Shop\nInjected",
          address: "Street 1\nBaghdad",
        },
      },
    }),
  );

  assert.deepEqual(event.provider_reference, {
    kind: "location",
    latitude: 33.3152,
    longitude: 44.3661,
    address: "Street 1\nBaghdad",
  });
});

test("provider error title is single-line and unsafe error text falls back only to safe details", () => {
  const result = parseWhatsAppWebhookPayload({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1234567890",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "9876543210" },
              errors: [
                {
                  code: "131000",
                  title: "Bad\nTitle",
                  message: "bad\u001bmessage",
                  error_data: { details: "Safe detail\nsecond line" },
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
  assert.equal(event.title, undefined);
  assert.equal(event.message, "Safe detail\nsecond line");
  assert.equal(JSON.stringify(event).includes("bad"), false);
});

test("interactive identifiers containing controls cannot become reply-engine text", () => {
  const event = firstMessageEvent(
    messagePayload({
      message: {
        from: "9647711111111",
        id: "wamid.interactive-controls",
        type: "interactive",
        interactive: {
          button_reply: {
            title: "unsafe\u0000title",
            id: "unsafe\nid",
          },
        },
      },
    }),
  );

  assert.equal(event.message_kind, "interactive");
  assert.equal(event.text, undefined);
});
