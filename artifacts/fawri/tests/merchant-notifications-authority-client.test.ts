import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  isSafeMerchantNotificationActionUrl,
  markMerchantNotificationReadAuthority,
  readMerchantNotificationsAuthority,
} from "../src/lib/merchantNotificationsAuthority";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const validNotification = {
  id: "notification-1",
  type: "operational_new_order",
  order_id: "order-1",
  action_url: "/dashboard/orders/order-1",
  created_at: "2026-08-29T00:00:00.000Z",
} as const;

test("canonical notification read accepts only validated server records", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true, notifications: [validNotification] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const notifications = await readMerchantNotificationsAuthority();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.id, validNotification.id);
  assert.equal(capturedUrl, "/api/auth/notifications?limit=50");
  assert.equal(capturedInit?.credentials, "same-origin");
  assert.equal(capturedInit?.cache, "no-store");
  assert.deepEqual(capturedInit?.headers, { Accept: "application/json" });
});

test("canonical notification read rejects malformed or external action URLs", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        notifications: [
          { ...validNotification, action_url: "https://example.com/redirect" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  await assert.rejects(
    () => readMerchantNotificationsAuthority(),
    /merchant notification authority unavailable/,
  );
});

test("mark-as-read requires a matching validated notification with read_at", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        ok: true,
        notification: { ...validNotification, read_at: "2026-08-29T00:01:00.000Z" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const notification = await markMerchantNotificationReadAuthority(validNotification.id);
  assert.equal(notification.id, validNotification.id);
  assert.equal(notification.read_at, "2026-08-29T00:01:00.000Z");
  assert.equal(capturedUrl, "/api/auth/notifications/notification-1/read");
  assert.equal(capturedInit?.method, "PATCH");
  assert.equal(capturedInit?.credentials, "same-origin");
});

test("mark-as-read rejects mismatched or unconfirmed mutation results", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        notification: {
          ...validNotification,
          id: "different-notification",
          read_at: "2026-08-29T00:01:00.000Z",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  await assert.rejects(
    () => markMerchantNotificationReadAuthority(validNotification.id),
    /merchant notification read mutation failed/,
  );
});

test("canonical notification read accepts a scoped knowledge-gap notification", async () => {
  const knowledgeGapNotification = {
    id: "knowledge-gap-1",
    type: "operational_knowledge_gap",
    training_request_id: "training-request-1",
    conversation_id: "conversation-1",
    action_url: "/dashboard/conversations?conversation=conversation-1",
    created_at: "2026-08-29T00:00:00.000Z",
  } as const;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ ok: true, notifications: [knowledgeGapNotification] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  const notifications = await readMerchantNotificationsAuthority();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.type, "operational_knowledge_gap");

  if (notifications[0]?.type === "operational_knowledge_gap") {
    assert.equal(notifications[0].training_request_id, "training-request-1");
    assert.equal(notifications[0].conversation_id, "conversation-1");
  }
});

test("knowledge-gap notification rejects a missing training request id", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        notifications: [{
          id: "knowledge-gap-invalid",
          type: "operational_knowledge_gap",
          conversation_id: "conversation-1",
          action_url: "/dashboard/conversations?conversation=conversation-1",
          created_at: "2026-08-29T00:00:00.000Z",
        }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  await assert.rejects(
    () => readMerchantNotificationsAuthority(),
    /merchant notification authority unavailable/,
  );
});


test("unknown metadata-only historical records do not hide valid merchant notifications", async () => {
  const responseRows = [
    { id: "unknown-legacy", type: "historical_custom", created_at: "2026-08-29T00:00:00.000Z" },
    validNotification,
    { id: "historical-inherited", type: "__proto__", created_at: "2026-08-29T00:00:00.000Z", read_at: "2026-08-29T00:01:00.000Z" },
  ];
  const before = structuredClone(responseRows);
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ ok: true, notifications: responseRows }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch;
  const received = await readMerchantNotificationsAuthority();
  assert.deepEqual(received, [validNotification]);
  assert.deepEqual(responseRows, before, "read-only compatibility filter must not alter response records");
});

test("unsupported notice with private extension is rejected rather than silently dropped", async () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ ok: true, notifications: [
      validNotification,
      { id: "unknown-unsafe", type: "historical_custom", created_at: "2026-08-29T00:00:00.000Z", internal_note: "private" },
    ] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch;
  await assert.rejects(() => readMerchantNotificationsAuthority(), /merchant notification authority unavailable/);
});

test("unsupported notice with malformed timestamp and malformed known type both fail closed", async () => {
  for (const unsafe of [
    { id: "unknown-invalid", type: "historical_custom", created_at: "not-a-date" },
    { id: "known-invalid", type: "operational_new_order", created_at: "2026-08-29T00:00:00.000Z" },
  ]) {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ ok: true, notifications: [validNotification, unsafe] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
    await assert.rejects(() => readMerchantNotificationsAuthority(), /merchant notification authority unavailable/);
  }
});

test("FIELD002-R1 rejects hidden ASCII controls that normalize into external navigation", async () => {
  const hiddenExternal = ["/\n/attacker.example", "/\r/attacker.example", "/\t/attacker.example"];
  const base = "https://fawri.invalid";
  for (const url of hiddenExternal) {
    assert.equal(new URL(url, base).origin, "https://attacker.example");
    assert.equal(isSafeMerchantNotificationActionUrl(url), false);
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ ok: true, notifications: [{ ...validNotification, action_url: url }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
    await assert.rejects(() => readMerchantNotificationsAuthority(), /merchant notification authority unavailable/);
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ ok: true, notification: {
        ...validNotification, action_url: url, read_at: "2026-08-29T00:01:00.000Z",
      } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
    await assert.rejects(
      () => markMerchantNotificationReadAuthority(validNotification.id),
      /merchant notification read mutation failed/,
    );
  }
  for (const safe of [
    "/dashboard/orders?order=one%2Ftwo",
    "/dashboard/conversations?conversation=one%0Atwo",
    "/dashboard/support?ticket=synthetic-id",
  ]) {
    assert.equal(isSafeMerchantNotificationActionUrl(safe), true, safe);
  }
  for (const unsafe of [
    "//attacker.example",
    "/\\attacker.example",
    "/\u0000/attacker.example",
    "/\u007f/attacker.example",
  ]) {
    assert.equal(isSafeMerchantNotificationActionUrl(unsafe), false);
  }
});
