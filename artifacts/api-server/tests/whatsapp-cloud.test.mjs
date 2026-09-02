import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  parseWhatsAppWebhookPayload,
  verifyMetaWebhookSignature,
} from "../src/services/whatsappCloud.ts";

test("parses WhatsApp text messages and contact metadata", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-123",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                display_phone_number: "9647700000000",
                phone_number_id: "phone-number-1",
              },
              contacts: [
                {
                  wa_id: "9647711111111",
                  profile: { name: "Customer One" },
                },
              ],
              messages: [
                {
                  from: "9647711111111",
                  id: "wamid.message-1",
                  timestamp: "1760000000",
                  type: "text",
                  text: { body: "  شكد السعر؟  " },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  assert.deepEqual(parseWhatsAppWebhookPayload(payload), [
    {
      wabaId: "waba-123",
      phoneNumberId: "phone-number-1",
      displayPhoneNumber: "9647700000000",
      from: "9647711111111",
      messageId: "wamid.message-1",
      timestamp: "1760000000",
      contactName: "Customer One",
      text: "شكد السعر؟",
    },
  ]);
});

test("ignores non-text and status-only WhatsApp webhook entries", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-123",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-number-1" },
              statuses: [{ id: "wamid.sent-1", status: "delivered" }],
              messages: [
                {
                  from: "9647711111111",
                  id: "wamid.image-1",
                  type: "image",
                  image: { id: "media-1" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  assert.deepEqual(parseWhatsAppWebhookPayload(payload), []);
  assert.deepEqual(parseWhatsAppWebhookPayload({ object: "page" }), []);
});

test("verifies a valid X-Hub-Signature-256 and rejects tampering", () => {
  const rawBody = Buffer.from(
    JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    "utf8",
  );
  const appSecret = "test-app-secret";
  const digest = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  assert.equal(
    verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${digest}`,
      appSecret,
    }),
    true,
  );

  assert.equal(
    verifyMetaWebhookSignature({
      rawBody: Buffer.from(`${rawBody.toString("utf8")} `, "utf8"),
      signatureHeader: `sha256=${digest}`,
      appSecret,
    }),
    false,
  );

  assert.equal(
    verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: "sha256=invalid",
      appSecret,
    }),
    false,
  );
});
