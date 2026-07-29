from pathlib import Path

AUTH = Path('artifacts/api-server/src/routes/auth.ts')
TEST = Path('artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs')
REALTIME = Path('artifacts/fawri/src/hooks/useMerchantRealtime.ts')
NOTIFICATION_HOOK = Path('artifacts/fawri/src/hooks/useMerchantNotifications.ts')
LAYOUT = Path('artifacts/fawri/src/components/layout/DashboardLayout.tsx')
OVERVIEW = Path('artifacts/fawri/src/pages/dashboard/OverviewPage.tsx')
SUBSCRIPTION = Path('artifacts/fawri/src/pages/dashboard/SubscriptionPage.tsx')
NOTIFICATIONS = Path('artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# ── Backend SSE connection and state broadcasts ───────────────────────────────
auth = AUTH.read_text(encoding='utf-8')

auth = replace_once(
    auth,
    '''function isChannelPlatform(value: unknown): value is ChannelPlatform {
''',
    '''type MerchantRealtimeEventName =
  | "snapshot"
  | "subscription_updated"
  | "notifications_updated";

type MerchantRealtimePayload = {
  subscription: SubscriptionRecord | null;
  unread_notification_count: number;
  emitted_at: string;
};

type MerchantRealtimeClient = {
  id: string;
  response: Response;
};

const merchantRealtimeClients = new Map<
  string,
  Map<string, MerchantRealtimeClient>
>();

function buildMerchantRealtimePayload(
  db: AuthDb,
  merchantId: string,
): MerchantRealtimePayload {
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (subscription) recalculateSubscriptionTotals(subscription);

  return {
    subscription: subscription || null,
    unread_notification_count: db.merchant_notifications.filter(
      (item) => item.merchant_id === merchantId && !item.read_at,
    ).length,
    emitted_at: now(),
  };
}

function writeMerchantRealtimeEvent(
  response: Response,
  eventName: MerchantRealtimeEventName,
  payload: MerchantRealtimePayload,
): boolean {
  if (response.writableEnded) return false;

  try {
    response.write(
      `event: ${eventName}\\ndata: ${JSON.stringify(payload)}\\n\\n`,
    );
    const flush = (response as Response & { flush?: () => void }).flush;
    if (typeof flush === "function") flush.call(response);
    return true;
  } catch {
    return false;
  }
}

function emitMerchantRealtimeState(
  db: AuthDb,
  merchantId: string,
  eventName: Exclude<MerchantRealtimeEventName, "snapshot">,
): void {
  const clients = merchantRealtimeClients.get(merchantId);
  if (!clients || clients.size === 0) return;

  const payload = buildMerchantRealtimePayload(db, merchantId);
  for (const [clientId, client] of clients) {
    if (!writeMerchantRealtimeEvent(client.response, eventName, payload)) {
      clients.delete(clientId);
    }
  }

  if (clients.size === 0) merchantRealtimeClients.delete(merchantId);
}

function isChannelPlatform(value: unknown): value is ChannelPlatform {
''',
    'merchant realtime helpers',
)

auth = replace_once(
    auth,
    '''router.get("/notifications", requireMerchantSession, (req: Request, res: Response) => {
''',
    '''router.get("/events", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const clientId = makeId("merchant-realtime");

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  req.socket.setTimeout(0);
  req.socket.setKeepAlive(true);

  let clients = merchantRealtimeClients.get(merchantId);
  if (!clients) {
    clients = new Map<string, MerchantRealtimeClient>();
    merchantRealtimeClients.set(merchantId, clients);
  }
  clients.set(clientId, { id: clientId, response: res });

  writeMerchantRealtimeEvent(
    res,
    "snapshot",
    buildMerchantRealtimePayload(ensureDb(), merchantId),
  );

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    try {
      res.write(": heartbeat\\n\\n");
      const flush = (res as Response & { flush?: () => void }).flush;
      if (typeof flush === "function") flush.call(res);
    } catch {
      // The close handler removes disconnected clients.
    }
  }, 25_000);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    const currentClients = merchantRealtimeClients.get(merchantId);
    currentClients?.delete(clientId);
    if (currentClients?.size === 0) {
      merchantRealtimeClients.delete(merchantId);
    }
    if (!res.writableEnded) res.end();
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
});

router.get("/notifications", requireMerchantSession, (req: Request, res: Response) => {
''',
    'merchant realtime route',
)

auth = replace_once(
    auth,
    '''    notification.read_at = notification.read_at || now();
    writeDb(db);
    return res.json({ ok: true, notification });
''',
    '''    notification.read_at = notification.read_at || now();
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    return res.json({ ok: true, notification });
''',
    'broadcast notification read',
)

auth = replace_once(
    auth,
    '''  recalculateSubscriptionTotals(subscription);
  writeDb(db);

  return res.json({ ok: true, subscription });
});

router.get("/admin/me"''',
    '''  recalculateSubscriptionTotals(subscription);
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({ ok: true, subscription });
});

router.get("/admin/me"''',
    'broadcast emergency activation',
)

auth = replace_once(
    auth,
    '''  writeDb(db);

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    subscription,
  });
});

router.patch("/merchants/:id/subscription"''',
    '''  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    subscription,
  });
});

router.patch("/merchants/:id/subscription"''',
    'broadcast plan operation',
)

auth = replace_once(
    auth,
    '''  appendAdminLog(db, admin, merchant, actionType, details, { meta });
  writeDb(db);
  return res.json({
''',
    '''  appendAdminLog(db, admin, merchant, actionType, details, { meta });
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");
  return res.json({
''',
    'broadcast subscription action',
)

AUTH.write_text(auth, encoding='utf-8')


# ── Integration test proves live delivery and unread-count updates ─────────────
test = TEST.read_text(encoding='utf-8')

test = replace_once(
    test,
    '''async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

''',
    '''async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

function createSseEventReader(body) {
  assert.ok(body);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function readChunk() {
    let timeout;
    try {
      return await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("timed out waiting for SSE event")),
            3_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async next(expectedEvent) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        let boundary = buffer.indexOf("\\n\\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = block.split("\\n");
          const eventName = lines
            .find((line) => line.startsWith("event:"))
            ?.slice("event:".length)
            .trim();
          const data = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice("data:".length).trimStart())
            .join("\\n");

          if (eventName === expectedEvent && data) {
            return JSON.parse(data);
          }
          boundary = buffer.indexOf("\\n\\n");
        }

        const { value, done } = await readChunk();
        if (done) throw new Error("SSE connection closed before expected event");
        buffer += decoder.decode(value, { stream: true });
      }

      throw new Error(`SSE event not received: ${expectedEvent}`);
    },
    cancel() {
      return reader.cancel();
    },
  };
}

''',
    'SSE test reader',
)

test = replace_once(
    test,
    '''  assert.equal(secondEmergency.status, 409);

  const partialDebtPayment = await subscriptionAction("merchant-a", "add_replies", 100);
''',
    '''  assert.equal(secondEmergency.status, 409);

  const realtimeController = new AbortController();
  const realtimeResponse = await fetch(`${baseUrl}/api/auth/events`, {
    headers: { Cookie: merchantACookie },
    signal: realtimeController.signal,
  });
  assert.equal(realtimeResponse.status, 200);
  assert.match(realtimeResponse.headers.get("content-type") || "", /text\\/event-stream/);
  const realtimeEvents = createSseEventReader(realtimeResponse.body);
  const realtimeSnapshot = await realtimeEvents.next("snapshot");
  assert.equal(realtimeSnapshot.subscription.emergency_debt, 400);
  assert.equal(realtimeSnapshot.unread_notification_count, 0);

  const partialDebtPayment = await subscriptionAction("merchant-a", "add_replies", 100);
''',
    'open realtime stream',
)

test = replace_once(
    test,
    '''  assert.equal(partialDebtPayment.body.notification.emergency_debt_remaining, 300);

  const partialNotifications = await json(await fetch(
''',
    '''  assert.equal(partialDebtPayment.body.notification.emergency_debt_remaining, 300);
  const partialRealtime = await realtimeEvents.next("subscription_updated");
  assert.equal(partialRealtime.subscription.emergency_debt, 300);
  assert.equal(partialRealtime.unread_notification_count, 1);

  const partialNotifications = await json(await fetch(
''',
    'assert partial realtime update',
)

test = replace_once(
    test,
    '''  assert.equal(debtAndAddon.body.notification.total_replies_available, 600);

  const splitNotifications = await json(await fetch(
''',
    '''  assert.equal(debtAndAddon.body.notification.total_replies_available, 600);
  const splitRealtime = await realtimeEvents.next("subscription_updated");
  assert.equal(splitRealtime.subscription.addon_replies_remaining, 200);
  assert.equal(splitRealtime.unread_notification_count, 2);

  const splitNotifications = await json(await fetch(
''',
    'assert split realtime update',
)

test = replace_once(
    test,
    '''  assert.equal(markedRead.response.status, 200);
  assert.ok(markedRead.body.notification.read_at);

  const unreadAfterMark = await json(await fetch(
''',
    '''  assert.equal(markedRead.response.status, 200);
  assert.ok(markedRead.body.notification.read_at);
  const readRealtime = await realtimeEvents.next("notifications_updated");
  assert.equal(readRealtime.unread_notification_count, 1);
  realtimeController.abort();
  await realtimeEvents.cancel().catch(() => undefined);

  const unreadAfterMark = await json(await fetch(
''',
    'assert realtime notification read',
)

TEST.write_text(test, encoding='utf-8')


# ── One shared browser SSE connection for the merchant dashboard ───────────────
REALTIME.parent.mkdir(parents=True, exist_ok=True)
REALTIME.write_text(r'''import { useEffect } from 'react';

import { saveSubscriptions } from '@/lib/store';
import type { Subscription } from '@/lib/types';

export const MERCHANT_REALTIME_EVENT = 'fawri:merchant-realtime';

export type MerchantRealtimeEventName =
  | 'snapshot'
  | 'subscription_updated'
  | 'notifications_updated';

export interface MerchantRealtimeDetail {
  event: MerchantRealtimeEventName;
  subscription: Subscription | null;
  unread_notification_count: number;
  emitted_at: string;
}

let sharedSource: EventSource | null = null;
let activeConsumers = 0;
let delayedClose: ReturnType<typeof setTimeout> | null = null;

const REALTIME_EVENT_NAMES: MerchantRealtimeEventName[] = [
  'snapshot',
  'subscription_updated',
  'notifications_updated',
];

function closeSharedSource(): void {
  sharedSource?.close();
  sharedSource = null;
}

function dispatchRealtimeEvent(
  eventName: MerchantRealtimeEventName,
  event: Event,
): void {
  if (!(event instanceof MessageEvent)) return;

  try {
    const payload = JSON.parse(event.data) as Omit<
      MerchantRealtimeDetail,
      'event'
    >;
    if (
      !payload ||
      typeof payload.unread_notification_count !== 'number' ||
      typeof payload.emitted_at !== 'string'
    ) {
      return;
    }

    if (payload.subscription) {
      saveSubscriptions([payload.subscription]);
    } else {
      saveSubscriptions([]);
    }

    window.dispatchEvent(
      new CustomEvent<MerchantRealtimeDetail>(MERCHANT_REALTIME_EVENT, {
        detail: { ...payload, event: eventName },
      }),
    );
  } catch (error) {
    console.error('Could not parse merchant realtime event:', error);
  }
}

function openSharedSource(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  if (
    sharedSource &&
    (sharedSource.readyState === EventSource.OPEN ||
      sharedSource.readyState === EventSource.CONNECTING)
  ) {
    return;
  }

  closeSharedSource();
  const source = new EventSource('/api/auth/events');
  sharedSource = source;

  for (const eventName of REALTIME_EVENT_NAMES) {
    source.addEventListener(eventName, (event) =>
      dispatchRealtimeEvent(eventName, event),
    );
  }

  source.onerror = () => {
    // Native EventSource reconnects automatically. A fresh connection receives
    // a complete snapshot, so missed changes are recovered without polling.
  };
}

export function useMerchantRealtimeConnection(): void {
  useEffect(() => {
    activeConsumers += 1;
    if (delayedClose) {
      clearTimeout(delayedClose);
      delayedClose = null;
    }
    openSharedSource();

    const handleFocus = () => {
      if (!sharedSource || sharedSource.readyState === EventSource.CLOSED) {
        openSharedSource();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      activeConsumers = Math.max(0, activeConsumers - 1);
      delayedClose = setTimeout(() => {
        if (activeConsumers === 0) closeSharedSource();
      }, 750);
    };
  }, []);
}
''', encoding='utf-8')


# ── Notification badge consumes pushed unread count, retaining focus fallback ──
NOTIFICATION_HOOK.write_text(r'''import { useCallback, useEffect, useState } from 'react';

import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

export const MERCHANT_NOTIFICATIONS_CHANGED_EVENT =
  'fawri:merchant-notifications-changed';

export function notifyMerchantNotificationsChanged(): void {
  window.dispatchEvent(new Event(MERCHANT_NOTIFICATIONS_CHANGED_EVENT));
}

export function useUnreadMerchantNotificationCount(): number {
  const [count, setCount] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/notifications?unread=1&limit=50', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setCount(0);
        return;
      }

      setCount(
        Array.isArray(data.notifications) ? data.notifications.length : 0,
      );
    } catch (error) {
      console.error('Could not load unread merchant notification count:', error);
    }
  }, []);

  useEffect(() => {
    void loadCount();

    const handleRefresh = () => void loadCount();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (typeof detail?.unread_notification_count === 'number') {
        setCount(Math.max(0, detail.unread_notification_count));
      }
    };

    window.addEventListener('focus', handleRefresh);
    window.addEventListener(
      MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
      handleRefresh,
    );
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);

    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener(
        MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
        handleRefresh,
      );
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [loadCount]);

  return count;
}
''', encoding='utf-8')


# ── Dashboard owns the single shared live connection ───────────────────────────
layout = LAYOUT.read_text(encoding='utf-8')
layout = replace_once(
    layout,
    "import type { Merchant } from '@/lib/types';\n",
    "import type { Merchant } from '@/lib/types';\nimport { useMerchantRealtimeConnection } from '@/hooks/useMerchantRealtime';\n",
    'dashboard realtime import',
)
layout = replace_once(
    layout,
    '''export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, dir } = useI18n();
''',
    '''export function DashboardLayout({ children }: { children: React.ReactNode }) {
  useMerchantRealtimeConnection();
  const { t, dir } = useI18n();
''',
    'dashboard realtime connection',
)
LAYOUT.write_text(layout, encoding='utf-8')


# ── Overview applies pushed subscription immediately, with focus fallback ──────
overview = OVERVIEW.read_text(encoding='utf-8')
overview = replace_once(
    overview,
    "import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';\n",
    "import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';\nimport { MERCHANT_REALTIME_EVENT, type MerchantRealtimeDetail } from '@/hooks/useMerchantRealtime';\n",
    'overview realtime import',
)
old_overview_effect = '''  useEffect(() => {
    let active = true;

    if (!merchant) {
      setLoadingSubscription(false);
      return () => {
        active = false;
      };
    }

    setStats({
      convs: getConversations(merchant.id).length,
      orders: getOrders(merchant.id).length,
      prods: getProducts(merchant.id).length,
    });

    fetch('/api/auth/subscription/current')
      .then(async response => ({
        response,
        data: await response.json().catch(() => null),
      }))
      .then(({ response, data }) => {
        if (!active) return;

        if (response.ok && data?.ok && data.subscription) {
          const serverSubscription = data.subscription as Subscription;
          saveSubscriptions([serverSubscription]);
          setSub(serverSubscription);
        } else {
          saveSubscriptions([]);
          setSub(null);
        }
      })
      .catch(error => {
        console.error('Could not load overview subscription:', error);
        if (active) setSub(null);
      })
      .finally(() => {
        if (active) setLoadingSubscription(false);
      });

    return () => {
      active = false;
    };
  }, [merchant?.id]);
'''
new_overview_effect = '''  useEffect(() => {
    let active = true;

    if (!merchant) {
      setLoadingSubscription(false);
      return () => {
        active = false;
      };
    }

    setStats({
      convs: getConversations(merchant.id).length,
      orders: getOrders(merchant.id).length,
      prods: getProducts(merchant.id).length,
    });

    const applySubscription = (subscription: Subscription | null) => {
      if (!active) return;
      if (subscription) saveSubscriptions([subscription]);
      else saveSubscriptions([]);
      setSub(subscription);
      setLoadingSubscription(false);
    };

    const loadSubscription = async () => {
      try {
        const response = await fetch('/api/auth/subscription/current', {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        if (!active) return;
        applySubscription(
          response.ok && data?.ok && data.subscription
            ? (data.subscription as Subscription)
            : null,
        );
      } catch (error) {
        console.error('Could not load overview subscription:', error);
        if (active) setLoadingSubscription(false);
      }
    };

    const handleFocus = () => void loadSubscription();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      const subscription = detail?.subscription ?? null;
      if (subscription && subscription.merchant_id !== merchant.id) return;
      applySubscription(subscription);
    };

    void loadSubscription();
    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [merchant?.id]);
'''
overview = replace_once(
    overview,
    old_overview_effect,
    new_overview_effect,
    'overview live subscription effect',
)
OVERVIEW.write_text(overview, encoding='utf-8')


# ── Subscription page applies the same pushed state immediately ────────────────
SUBSCRIPTION.write_text(r'''import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SubscriptionCard } from '@/components/SubscriptionCard';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant, saveSubscriptions } from '@/lib/store';
import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';
import { Subscription } from '@/lib/types';
import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

export default function SubscriptionPage() {
  const { t, lang } = useI18n();
  const merchant = getCurrentMerchant();
  const merchantId = merchant?.id ?? null;
  const messages = subscriptionStateMessages[lang];

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!merchantId) {
      setSubscription(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const applySubscription = (nextSubscription: Subscription | null) => {
      if (!active) return;
      if (nextSubscription) saveSubscriptions([nextSubscription]);
      else saveSubscriptions([]);
      setSubscription(nextSubscription);
      setLoading(false);
    };

    const loadSubscription = async () => {
      try {
        const response = await fetch('/api/auth/subscription/current', {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        if (!active) return;
        applySubscription(
          response.ok && data?.ok && data.subscription
            ? (data.subscription as Subscription)
            : null,
        );
      } catch (error) {
        console.error('Could not load the current subscription:', error);
        if (active) setLoading(false);
      }
    };

    const handleFocus = () => void loadSubscription();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      const nextSubscription = detail?.subscription ?? null;
      if (nextSubscription && nextSubscription.merchant_id !== merchantId) return;
      applySubscription(nextSubscription);
    };

    setLoading(true);
    void loadSubscription();
    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [merchantId]);

  const handleActivateEmergency = async () => {
    const canRequestEmergency =
      subscription?.status === 'active' ||
      subscription?.status === 'replies_exhausted';

    if (!merchantId || !subscription || !canRequestEmergency) return;

    try {
      const response = await fetch('/api/auth/subscription/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || !data.subscription) {
        throw new Error(data?.error || messages.emergencyUnavailable);
      }

      const updatedSubscription = data.subscription as Subscription;
      saveSubscriptions([updatedSubscription]);
      setSubscription(updatedSubscription);
      toast.success(t.subscription_emergency_success);
    } catch (error) {
      console.error('Emergency credit activation failed:', error);
      toast.error(
        error instanceof Error ? error.message : messages.emergencyUnavailable,
      );
    }
  };

  if (!merchantId) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center text-muted-foreground">
        {t.overview_loading}
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-8">
        <h1 className="text-2xl font-bold">{messages.noSubscriptionTitle}</h1>
        <p className="text-muted-foreground">{messages.noSubscriptionBody}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t.subscription}</h1>

      <SubscriptionCard
        subscription={subscription}
        onEmergencyActivate={handleActivateEmergency}
      />
    </div>
  );
}
''', encoding='utf-8')


# ── Open notification page refreshes as soon as a new event arrives ───────────
notifications = NOTIFICATIONS.read_text(encoding='utf-8')
notifications = replace_once(
    notifications,
    "import { notifyMerchantNotificationsChanged } from '@/hooks/useMerchantNotifications';\n",
    "import { notifyMerchantNotificationsChanged } from '@/hooks/useMerchantNotifications';\nimport { MERCHANT_REALTIME_EVENT, type MerchantRealtimeDetail } from '@/hooks/useMerchantRealtime';\n",
    'notification page realtime import',
)
notifications = replace_once(
    notifications,
    '''  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);
''',
    '''  useEffect(() => {
    void loadNotifications();

    const handleFocus = () => void loadNotifications();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (
        detail?.event === 'subscription_updated' ||
        detail?.event === 'notifications_updated'
      ) {
        void loadNotifications();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [loadNotifications]);
''',
    'notification page live refresh',
)
NOTIFICATIONS.write_text(notifications, encoding='utf-8')

print('Added SSE merchant balance and notification updates with focus fallback.')
