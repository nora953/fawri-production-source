import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildWhatsAppInboundMessageJob,
  buildWhatsAppTextSendPlan,
  classifyWhatsAppSendResponse,
  normalizeWhatsAppChannelIdentity,
  whatsAppChannelKey,
} from "../src/services/whatsappOfflineContracts";
import type { NormalizedWhatsAppMessageEvent } from "../src/services/whatsappWebhookContract";

test("offline WhatsApp implementation has no network or credential capability", () => {
  const sources = [
    new URL("../src/services/whatsappWebhookContract.ts", import.meta.url),
    new URL("../src/services/whatsappOfflineContracts.ts", import.meta.url),
  ].map((url) => readFileSync(url, "utf8"));
  const joined = sources.join("\n");

  for (const forbidden of [
    /\bfetch\s*\(/,
    /graph\.facebook\.com/i,
    /\bAuthorization\b/,
    /\bBearer\b/,
    /ACCESS_TOKEN/,
    /APP_SECRET/,
  ]) {
    assert.doesNotMatch(joined, forbidden);
  }
});

test("normalizes merchant/WABA/phone identity and derives a stable key", () => {
  const identity = normalizeWhatsAppChannelIdentity({
    merchantId: "merchant-123",
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
    displayPhoneNumber: "+964 770 000 0000",
  });
  assert.deepEqual(identity, {
    merchant_id: "merchant-123",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    display_phone_number: "+964 770 000 0000",
  });
  assert.match(whatsAppChannelKey(identity), /^[a-f0-9]{32}$/);
  assert.equal(whatsAppChannelKey(identity), whatsAppChannelKey(identity));
});

test("rejects invented or malformed external channel identities", () => {
  assert.throws(
    () =>
      normalizeWhatsAppChannelIdentity({
        merchantId: "merchant-123",
        wabaId: "not-a-waba",
        phoneNumberId: "9876543210",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_CHANNEL_IDENTITY_INVALID",
  );
});

test("builds a queue-ready message contract only for the mapped channel", () => {
  const identity = normalizeWhatsAppChannelIdentity({
    merchantId: "merchant-123",
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
  });
  const event: NormalizedWhatsAppMessageEvent = {
    event_id: "whatsapp:1234567890:9876543210:message:wamid.1",
    event_kind: "message",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.1",
    customer_id: "9647711111111",
    customer_name: "Customer",
    message_kind: "text",
    text: "اريد هذا المنتج",
    timestamp: "1788380000",
  };

  assert.deepEqual(buildWhatsAppInboundMessageJob({ identity, event }), {
    job_type: "whatsapp_inbound_message",
    event_id: event.event_id,
    merchant_id: "merchant-123",
    channel: "whatsapp",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.1",
    customer_id: "9647711111111",
    customer_name: "Customer",
    message_kind: "text",
    text: "اريد هذا المنتج",
    provider_timestamp: "1788380000",
  });

  assert.throws(
    () =>
      buildWhatsAppInboundMessageJob({
        identity,
        event: { ...event, phone_number_id: "1111111111" },
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_CHANNEL_MAPPING_MISMATCH",
  );
});

test("queue-ready contract retains provider references without media I/O", () => {
  const identity = normalizeWhatsAppChannelIdentity({
    merchantId: "merchant-123",
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
  });
  const event: NormalizedWhatsAppMessageEvent = {
    event_id: "whatsapp:1234567890:9876543210:message:wamid.image",
    event_kind: "message",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.image",
    customer_id: "9647711111111",
    message_kind: "image",
    provider_reference: {
      kind: "media",
      media_kind: "image",
      id: "media-123",
      mime_type: "image/jpeg",
      sha256: "abc123",
      caption: "Line one\nLine two",
    },
  };

  const built = buildWhatsAppInboundMessageJob({ identity, event });
  assert.deepEqual(built.provider_reference, event.provider_reference);
  assert.notEqual(built.provider_reference, event.provider_reference);
});

test("builds an outbound text plan without credentials or network calls", () => {
  const plan = buildWhatsAppTextSendPlan({
    phoneNumberId: "9876543210",
    to: "+9647711111111",
    messageText: "تم استلام طلبك",
  });

  assert.deepEqual(plan, {
    method: "POST",
    graph_version: "v22.0",
    path: "/v22.0/9876543210/messages",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "9647711111111",
      type: "text",
      text: {
        preview_url: false,
        body: "تم استلام طلبك",
      },
    },
  });
  assert.equal("access_token" in plan, false);
  assert.equal(JSON.stringify(plan).includes("Bearer"), false);
});

test("rejects unsafe outbound recipient, text, and Graph version values", () => {
  assert.throws(
    () =>
      buildWhatsAppTextSendPlan({
        phoneNumberId: "9876543210",
        to: "not-a-number",
        messageText: "hello",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_RECIPIENT_INVALID",
  );
  assert.throws(
    () =>
      buildWhatsAppTextSendPlan({
        phoneNumberId: "9876543210",
        to: "9647711111111",
        messageText: "",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_MESSAGE_TEXT_INVALID",
  );
  assert.throws(
    () =>
      buildWhatsAppTextSendPlan({
        phoneNumberId: "9876543210",
        to: "9647711111111",
        messageText: "hello",
        graphVersion: "latest",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_GRAPH_VERSION_INVALID",
  );
});

test("classifies confirmed sends only when Meta returns a provider message id", () => {
  assert.deepEqual(
    classifyWhatsAppSendResponse({
      httpStatus: 200,
      body: { messages: [{ id: "wamid.outbound-1" }] },
    }),
    {
      status: "sent",
      provider_message_id: "wamid.outbound-1",
    },
  );

  assert.deepEqual(
    classifyWhatsAppSendResponse({
      httpStatus: 200,
      body: { messages: [] },
    }),
    {
      status: "uncertain",
      code: "WHATSAPP_GRAPH_SUCCESS_WITHOUT_MESSAGE_ID",
      http_status: 200,
    },
  );
});

test("keeps retry-sensitive provider responses uncertain", () => {
  assert.deepEqual(
    classifyWhatsAppSendResponse({
      httpStatus: 429,
      body: { error: { code: 130429 } },
    }),
    {
      status: "uncertain",
      code: "WHATSAPP_GRAPH_HTTP_429_130429",
      http_status: 429,
    },
  );
  assert.deepEqual(
    classifyWhatsAppSendResponse({
      httpStatus: 503,
      body: {},
    }),
    {
      status: "uncertain",
      code: "WHATSAPP_GRAPH_HTTP_503",
      http_status: 503,
    },
  );
});

test("classifies deterministic client rejection as confirmed failure", () => {
  assert.deepEqual(
    classifyWhatsAppSendResponse({
      httpStatus: 400,
      body: { error: { code: 100, error_subcode: 33 } },
    }),
    {
      status: "confirmed_failed",
      code: "WHATSAPP_GRAPH_HTTP_400_100_33",
      http_status: 400,
    },
  );
});
