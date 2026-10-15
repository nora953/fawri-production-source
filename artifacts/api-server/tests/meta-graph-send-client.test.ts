import assert from "node:assert/strict";
import test from "node:test";
import { sendMetaGraphTextMessage } from "../src/services/metaGraphSendClient.js";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("Meta Graph sender uses page endpoint, Bearer authorization, and RESPONSE text payload", async () => {
  let seenUrl = "";
  let seenAuthorization = "";
  let seenBody: Record<string, unknown> | null = null;
  const secret = "meta-test-token-must-not-appear-in-url";

  const result = await sendMetaGraphTextMessage({
    pageId: "123456",
    recipientId: "654321",
    messageText: "مرحبا من فوري",
    pageAccessToken: secret,
    graphVersion: "v22.0",
    fetchImpl: async (input, init) => {
      seenUrl = String(input);
      seenAuthorization = String((init?.headers as Record<string, string>)?.Authorization || "");
      seenBody = JSON.parse(String(init?.body || "{}"));
      return response(200, {
        recipient_id: "654321",
        message_id: "m-provider-1",
      });
    },
  });

  assert.deepEqual(result, {
    status: "sent",
    providerMessageId: "m-provider-1",
    recipientId: "654321",
  });
  assert.equal(seenUrl, "https://graph.facebook.com/v22.0/123456/messages");
  assert.equal(seenUrl.includes(secret), false);
  assert.equal(seenAuthorization, `Bearer ${secret}`);
  assert.deepEqual(seenBody, {
    recipient: { id: "654321" },
    messaging_type: "RESPONSE",
    message: { text: "مرحبا من فوري" },
  });
});

test("confirmed Meta 4xx rejection is safe to retry without exposing provider message", async () => {
  const result = await sendMetaGraphTextMessage({
    pageId: "page-1",
    recipientId: "customer-1",
    messageText: "hello",
    pageAccessToken: "secret-token",
    fetchImpl: async () =>
      response(400, {
        error: {
          code: 100,
          error_subcode: 2018001,
          message: "provider secret diagnostic must not be retained",
        },
      }),
  });

  assert.deepEqual(result, {
    status: "confirmed_failed",
    code: "META_GRAPH_HTTP_400_100_2018001",
    httpStatus: 400,
  });
  assert.equal(JSON.stringify(result).includes("diagnostic"), false);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("network failure, 5xx, 429, and success without message id remain uncertain", async () => {
  const common = {
    pageId: "page-1",
    recipientId: "customer-1",
    messageText: "hello",
    pageAccessToken: "secret-token",
  };

  const network = await sendMetaGraphTextMessage({
    ...common,
    fetchImpl: async () => {
      throw new Error("socket closed after write");
    },
  });
  assert.deepEqual(network, {
    status: "uncertain",
    code: "META_GRAPH_TRANSPORT_UNCERTAIN",
  });

  const server = await sendMetaGraphTextMessage({
    ...common,
    fetchImpl: async () => response(503, { error: { code: 2 } }),
  });
  assert.deepEqual(server, {
    status: "uncertain",
    code: "META_GRAPH_HTTP_503_2",
    httpStatus: 503,
  });

  const throttled = await sendMetaGraphTextMessage({
    ...common,
    fetchImpl: async () => response(429, { error: { code: 4 } }),
  });
  assert.deepEqual(throttled, {
    status: "uncertain",
    code: "META_GRAPH_HTTP_429_4",
    httpStatus: 429,
  });

  const malformedSuccess = await sendMetaGraphTextMessage({
    ...common,
    fetchImpl: async () => response(200, { recipient_id: "customer-1" }),
  });
  assert.deepEqual(malformedSuccess, {
    status: "uncertain",
    code: "META_GRAPH_SUCCESS_WITHOUT_MESSAGE_ID",
    httpStatus: 200,
  });
});

test("invalid identifiers and insecure non-local graph endpoints fail before fetch", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return response(200, { message_id: "unexpected" });
  };

  await assert.rejects(
    () =>
      sendMetaGraphTextMessage({
        pageId: "page/escape",
        recipientId: "customer-1",
        messageText: "hello",
        pageAccessToken: "secret-token",
        fetchImpl,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "META_GRAPH_SEND_INPUT_INVALID",
  );
  await assert.rejects(
    () =>
      sendMetaGraphTextMessage({
        pageId: "page-1",
        recipientId: "customer-1",
        messageText: "hello",
        pageAccessToken: "secret-token",
        graphBaseUrl: "http://example.com",
        fetchImpl,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "META_GRAPH_CONFIGURATION_INVALID",
  );
  assert.equal(called, false);
});
