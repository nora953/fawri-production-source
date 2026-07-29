from pathlib import Path

AUTH = Path('artifacts/api-server/src/routes/auth.ts')
TEST = Path('artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs')
TYPES = Path('artifacts/fawri/src/lib/types.ts')
LAYOUT = Path('artifacts/fawri/src/components/layout/DashboardLayout.tsx')
AR = Path('artifacts/fawri/src/lib/translations/ar.ts')
EN = Path('artifacts/fawri/src/lib/translations/en.ts')
KU = Path('artifacts/fawri/src/lib/translations/ku.ts')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# ── Backend persistence and API ────────────────────────────────────────────────
auth = AUTH.read_text(encoding='utf-8')

auth = replace_once(
    auth,
    '''type OtpRecord = {
''',
    '''type MerchantBalanceNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_balance_purchase";
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
};

type OtpRecord = {
''',
    'backend notification type',
)

auth = replace_once(
    auth,
    '''  admin_logs: AdminLogRecord[];
  deletion_requests: MerchantDeletionRequest[];
''',
    '''  admin_logs: AdminLogRecord[];
  merchant_notifications: MerchantBalanceNotificationRecord[];
  deletion_requests: MerchantDeletionRequest[];
''',
    'AuthDb notification field',
)

auth = replace_once(
    auth,
    '''    admin_logs: [],
    deletion_requests: [],
''',
    '''    admin_logs: [],
    merchant_notifications: [],
    deletion_requests: [],
''',
    'initial notification storage',
)

auth = replace_once(
    auth,
    '''      admin_logs: Array.isArray(parsed.admin_logs) ? parsed.admin_logs : [],
      deletion_requests: Array.isArray(parsed.deletion_requests)
''',
    '''      admin_logs: Array.isArray(parsed.admin_logs) ? parsed.admin_logs : [],
      merchant_notifications: Array.isArray(parsed.merchant_notifications)
        ? parsed.merchant_notifications.filter(
            (item): item is MerchantBalanceNotificationRecord =>
              Boolean(
                item &&
                typeof item === "object" &&
                !Array.isArray(item) &&
                typeof item.id === "string" &&
                typeof item.merchant_id === "string" &&
                item.type === "subscription_balance_purchase",
              ),
          )
        : [],
      deletion_requests: Array.isArray(parsed.deletion_requests)
''',
    'notification storage normalization',
)

auth = replace_once(
    auth,
    '''function isChannelPlatform(value: unknown): value is ChannelPlatform {
''',
    '''function appendMerchantBalanceNotification(
  db: AuthDb,
  merchantId: string,
  purchasedReplies: number,
  purchase: { debtPaid: number; addonAdded: number },
  subscription: SubscriptionRecord,
): MerchantBalanceNotificationRecord {
  const notification: MerchantBalanceNotificationRecord = {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_balance_purchase",
    purchased_replies: purchasedReplies,
    emergency_debt_paid: purchase.debtPaid,
    addon_replies_added: purchase.addonAdded,
    emergency_debt_remaining: subscription.emergency_debt,
    base_replies_remaining: subscription.base_replies_remaining,
    emergency_replies_remaining: subscription.emergency_credit_remaining,
    addon_replies_remaining: subscription.addon_replies_remaining,
    total_replies_available: subscription.replies_remaining,
    created_at: now(),
  };

  db.merchant_notifications.unshift(notification);
  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === merchantId)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }

  return notification;
}

function isChannelPlatform(value: unknown): value is ChannelPlatform {
''',
    'append merchant notification helper',
)

auth = replace_once(
    auth,
    '''router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {
''',
    '''router.get("/notifications", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const unreadOnly = String(req.query.unread || "") === "1";
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(50, requestedLimit))
    : 20;

  const notifications = db.merchant_notifications
    .filter(
      (item) =>
        item.merchant_id === merchantId &&
        (!unreadOnly || !item.read_at),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )
    .slice(0, limit);

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, notifications });
});

router.patch(
  "/notifications/:id/read",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const notificationId = String(req.params.id || "").trim();
    const db = ensureDb();
    const notification = db.merchant_notifications.find(
      (item) => item.id === notificationId && item.merchant_id === merchantId,
    );
    if (!notification) return sendError(res, 404, "notification not found");

    notification.read_at = notification.read_at || now();
    writeDb(db);
    return res.json({ ok: true, notification });
  },
);

router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {
''',
    'merchant notification routes',
)

auth = replace_once(
    auth,
    '''  let actionType = "";
  let details = "";
  let meta: Record<string, string | number> = {};
''',
    '''  let actionType = "";
  let details = "";
  let meta: Record<string, string | number> = {};
  let merchantNotification: MerchantBalanceNotificationRecord | undefined;
''',
    'notification response variable',
)

auth = replace_once(
    auth,
    '''    meta = {
      amount,
      emergency_debt_paid: purchase.debtPaid,
      addon_replies_added: purchase.addonAdded,
    };
''',
    '''    meta = {
      amount,
      emergency_debt_paid: purchase.debtPaid,
      addon_replies_added: purchase.addonAdded,
    };
    merchantNotification = appendMerchantBalanceNotification(
      db,
      merchant.id,
      amount,
      purchase,
      subscription,
    );
''',
    'create add replies notification',
)

auth = replace_once(
    auth,
    '''  return res.json({ ok: true, subscription });
});

router.patch("/merchants/:id/status"''',
    '''  return res.json({
    ok: true,
    subscription,
    ...(merchantNotification ? { notification: merchantNotification } : {}),
  });
});

router.patch("/merchants/:id/status"''',
    'subscription action response notification',
)

AUTH.write_text(auth, encoding='utf-8')


# ── API lifecycle test ─────────────────────────────────────────────────────────
test = TEST.read_text(encoding='utf-8')

test = replace_once(
    test,
    '''    subscriptions: [], otps: [], admin_logs: [], deletion_requests: [], channel_overrides: {}, admin_notes: {},
''',
    '''    subscriptions: [], otps: [], admin_logs: [], merchant_notifications: [], deletion_requests: [], channel_overrides: {}, admin_notes: {},
''',
    'test initial notification storage',
)

test = replace_once(
    test,
    '''  assert.equal(partialDebtPayment.body.subscription.emergency_debt, 300);
  assert.equal(partialDebtPayment.body.subscription.addon_replies_remaining, 0);
''',
    '''  assert.equal(partialDebtPayment.body.subscription.emergency_debt, 300);
  assert.equal(partialDebtPayment.body.subscription.addon_replies_remaining, 0);
  assert.equal(partialDebtPayment.body.notification.purchased_replies, 100);
  assert.equal(partialDebtPayment.body.notification.emergency_debt_paid, 100);
  assert.equal(partialDebtPayment.body.notification.addon_replies_added, 0);
  assert.equal(partialDebtPayment.body.notification.emergency_debt_remaining, 300);

  const partialNotifications = await json(await fetch(
    `${baseUrl}/api/auth/notifications?unread=1`,
    { headers: { Cookie: merchantACookie } },
  ));
  assert.equal(partialNotifications.response.status, 200);
  assert.equal(partialNotifications.body.notifications.length, 1);
  assert.equal(partialNotifications.body.notifications[0].merchant_id, "merchant-a");
''',
    'partial debt notification assertions',
)

test = replace_once(
    test,
    '''  assert.equal(debtAndAddon.body.subscription.addon_replies_remaining, 200);
  assert.equal(debtAndAddon.body.subscription.addon_reply_batches.length, 1);
''',
    '''  assert.equal(debtAndAddon.body.subscription.addon_replies_remaining, 200);
  assert.equal(debtAndAddon.body.subscription.addon_reply_batches.length, 1);
  assert.equal(debtAndAddon.body.notification.purchased_replies, 500);
  assert.equal(debtAndAddon.body.notification.emergency_debt_paid, 300);
  assert.equal(debtAndAddon.body.notification.addon_replies_added, 200);
  assert.equal(debtAndAddon.body.notification.emergency_debt_remaining, 0);
  assert.equal(debtAndAddon.body.notification.total_replies_available, 600);

  const splitNotifications = await json(await fetch(
    `${baseUrl}/api/auth/notifications?unread=1`,
    { headers: { Cookie: merchantACookie } },
  ));
  assert.equal(splitNotifications.response.status, 200);
  assert.equal(splitNotifications.body.notifications.length, 2);
  assert.equal(splitNotifications.body.notifications[0].id, debtAndAddon.body.notification.id);

  const markedRead = await json(await fetch(
    `${baseUrl}/api/auth/notifications/${debtAndAddon.body.notification.id}/read`,
    { method: "PATCH", headers: { Cookie: merchantACookie } },
  ));
  assert.equal(markedRead.response.status, 200);
  assert.ok(markedRead.body.notification.read_at);

  const unreadAfterMark = await json(await fetch(
    `${baseUrl}/api/auth/notifications?unread=1`,
    { headers: { Cookie: merchantACookie } },
  ));
  assert.equal(unreadAfterMark.body.notifications.length, 1);
''',
    'split purchase notification assertions',
)

TEST.write_text(test, encoding='utf-8')


# ── Frontend type ──────────────────────────────────────────────────────────────
types = TYPES.read_text(encoding='utf-8')
types = replace_once(
    types,
    '''export type ProductStatus =
''',
    '''export interface MerchantBalanceNotification {
  id: string;
  merchant_id: string;
  type: 'subscription_balance_purchase';
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
}

export type ProductStatus =
''',
    'frontend notification type',
)
TYPES.write_text(types, encoding='utf-8')


# ── Global merchant notification banner ───────────────────────────────────────
layout = LAYOUT.read_text(encoding='utf-8')
layout = replace_once(
    layout,
    "import React, { useEffect, useState } from 'react';",
    "import React, { useCallback, useEffect, useState } from 'react';",
    'layout React imports',
)
layout = replace_once(
    layout,
    "import { AlertTriangle } from 'lucide-react';",
    "import { AlertTriangle, Bell, X } from 'lucide-react';",
    'layout notification icons',
)
layout = replace_once(
    layout,
    "import type { Merchant } from '@/lib/types';",
    "import type { Merchant, MerchantBalanceNotification } from '@/lib/types';",
    'layout notification type import',
)
layout = replace_once(
    layout,
    '''const PRODUCT_READ_ONLY_STATUSES = new Set([
''',
    '''function formatNotificationText(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template,
  );
}

const PRODUCT_READ_ONLY_STATUSES = new Set([
''',
    'notification text formatter',
)
layout = replace_once(
    layout,
    '''  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );
''',
    '''  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );
  const [balanceNotification, setBalanceNotification] =
    useState<MerchantBalanceNotification | null>(null);
''',
    'layout notification state',
)
layout = replace_once(
    layout,
    '''  useEffect(() => {
    let active = true;

    refreshCurrentMerchantFromApi()
''',
    '''  const loadLatestBalanceNotification = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/notifications?unread=1&limit=1');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) return;
      setBalanceNotification(
        Array.isArray(data.notifications) && data.notifications.length > 0
          ? (data.notifications[0] as MerchantBalanceNotification)
          : null,
      );
    } catch (error) {
      console.error('Could not load merchant notifications:', error);
    }
  }, []);

  useEffect(() => {
    let active = true;

    refreshCurrentMerchantFromApi()
''',
    'notification loader',
)
layout = replace_once(
    layout,
    '''  }, [setLocation]);

  const productsReadOnly =
''',
    '''  }, [setLocation]);

  useEffect(() => {
    void loadLatestBalanceNotification();
    const handleFocus = () => void loadLatestBalanceNotification();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadLatestBalanceNotification]);

  const dismissBalanceNotification = async () => {
    if (!balanceNotification) return;
    const notificationId = balanceNotification.id;
    setBalanceNotification(null);
    try {
      const response = await fetch(
        `/api/auth/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH' },
      );
      if (response.ok) await loadLatestBalanceNotification();
    } catch (error) {
      console.error('Could not mark merchant notification as read:', error);
    }
  };

  const productsReadOnly =
''',
    'notification focus refresh and dismiss',
)
layout = replace_once(
    layout,
    '''          <div className="mx-auto max-w-6xl" dir={dir}>
            {productsReadOnly && (
''',
    '''          <div className="mx-auto max-w-6xl" dir={dir}>
            {balanceNotification && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950 shadow-sm dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-100">
                <Bell className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{t.balance_notification_title}</p>
                  <p className="mt-1 text-sm font-medium leading-6">
                    {formatNotificationText(
                      balanceNotification.emergency_debt_paid > 0
                        ? balanceNotification.addon_replies_added > 0
                          ? t.balance_notification_debt_and_addon
                          : t.balance_notification_debt_only
                        : t.balance_notification_addon_only,
                      {
                        purchased: balanceNotification.purchased_replies.toLocaleString(),
                        debtPaid: balanceNotification.emergency_debt_paid.toLocaleString(),
                        debtRemaining: balanceNotification.emergency_debt_remaining.toLocaleString(),
                        addonAdded: balanceNotification.addon_replies_added.toLocaleString(),
                      },
                    )}
                  </p>
                  <p className="mt-2 rounded-xl border border-sky-200/80 bg-white/70 px-3 py-2 text-xs font-semibold leading-5 dark:border-sky-800 dark:bg-sky-950/40">
                    {formatNotificationText(t.balance_notification_summary, {
                      base: balanceNotification.base_replies_remaining.toLocaleString(),
                      emergency: balanceNotification.emergency_replies_remaining.toLocaleString(),
                      addon: balanceNotification.addon_replies_remaining.toLocaleString(),
                      total: balanceNotification.total_replies_available.toLocaleString(),
                    })}
                  </p>
                  <p className="mt-2 text-[11px] text-sky-700/80 dark:text-sky-300/80">
                    {new Date(balanceNotification.created_at).toLocaleString(
                      lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-300 bg-white/70 transition-colors hover:bg-white dark:border-sky-700 dark:bg-sky-950/40 dark:hover:bg-sky-900"
                  aria-label={t.balance_notification_dismiss}
                  title={t.balance_notification_dismiss}
                  onClick={() => void dismissBalanceNotification()}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {productsReadOnly && (
''',
    'global notification banner',
)
LAYOUT.write_text(layout, encoding='utf-8')


# ── Localized notification copy ────────────────────────────────────────────────
def patch_translation(path: Path, marker: str, addition: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(text, marker, marker + addition, label)
    path.write_text(text, encoding='utf-8')


patch_translation(
    AR,
    '  subscription_emergency_success: "تم تفعيل رصيد الطوارئ بنجاح",\n',
    '''  balance_notification_title: "إشعار بتحديث رصيد الردود",
  balance_notification_debt_only: "تم استخدام {purchased} رد لتسديد جزء من دين الطوارئ. تم تسديد {debtPaid} رد، والمتبقي من الدين {debtRemaining} رد. لم يُضف رصيد قابل للاستخدام في هذه العملية.",
  balance_notification_debt_and_addon: "تم تسديد {debtPaid} رد من دين الطوارئ بالكامل، وأضيفت {addonAdded} ردود إلى رصيدك الإضافي.",
  balance_notification_addon_only: "تمت إضافة {addonAdded} ردود إلى رصيدك الإضافي.",
  balance_notification_summary: "رصيدك الحالي: {base} أساسي + {emergency} طوارئ + {addon} إضافي = {total} رد متاح.",
  balance_notification_dismiss: "تحديد الإشعار كمقروء",
''',
    'Arabic balance notification copy',
)

patch_translation(
    EN,
    '  subscription_emergency_success: "Emergency credit activated successfully",\n',
    '''  balance_notification_title: "Reply balance updated",
  balance_notification_debt_only: "{purchased} replies were applied to emergency debt. {debtPaid} replies were paid, with {debtRemaining} replies of debt remaining. No usable replies were added in this transaction.",
  balance_notification_debt_and_addon: "The remaining emergency debt of {debtPaid} replies was paid in full, and {addonAdded} replies were added to your add-on balance.",
  balance_notification_addon_only: "{addonAdded} replies were added to your add-on balance.",
  balance_notification_summary: "Current balance: {base} base + {emergency} emergency + {addon} add-on = {total} replies available.",
  balance_notification_dismiss: "Mark notification as read",
''',
    'English balance notification copy',
)

patch_translation(
    KU,
    '  subscription_emergency_success: "کرێدیتی فریاکەوتن بە سەرکەوتوویی چالاک کرا",\n',
    '''  balance_notification_title: "ئاگادارکردنەوەی نوێبوونەوەی کرێدیتی وەڵام",
  balance_notification_debt_only: "{purchased} وەڵام بۆ دانەوەی بەشێک لە قەرزی فریاکەوتن بەکارهات. {debtPaid} وەڵام درایەوە و {debtRemaining} وەڵام لە قەرزەکە ماوە. هیچ وەڵامێکی بەکارهێنان زیاد نەکرا.",
  balance_notification_debt_and_addon: "قەرزی فریاکەوتنی ماوە بە بڕی {debtPaid} وەڵام بە تەواوی درایەوە و {addonAdded} وەڵام زیادکرایە سەر کرێدیتی زیادە.",
  balance_notification_addon_only: "{addonAdded} وەڵام زیادکرایە سەر کرێدیتی زیادە.",
  balance_notification_summary: "کرێدیتی ئێستات: {base} سەرەکی + {emergency} فریاکەوتن + {addon} زیادە = {total} وەڵامی بەردەست.",
  balance_notification_dismiss: "نیشانکردنی ئاگادارکردنەوە وەک خوێندراو",
''',
    'Kurdish balance notification copy',
)

print('Added persistent merchant balance notifications and localized dashboard banner.')
