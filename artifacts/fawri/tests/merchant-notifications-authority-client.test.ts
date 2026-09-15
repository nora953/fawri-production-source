import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
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
