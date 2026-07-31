import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import type {
  MerchantBalanceNotification,
  MerchantInspectionNotification,
  MerchantNotification,
} from '@/lib/types';
import { notifyMerchantNotificationsChanged } from '@/hooks/useMerchantNotifications';
import { MERCHANT_REALTIME_EVENT, type MerchantRealtimeDetail } from '@/hooks/useMerchantRealtime';

function formatNotificationText(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template,
  );
}

const INSPECTION_NOTIFICATION_TEXT = {
  ar: {
    title: 'طلب فحص حسابك',
    body: 'أرسل {admin} طلب {mode} ضمن تذكرة «{ticket}».',
    live: 'مشاهدة مباشرة',
    readOnly: 'فحص مستقل للقراءة فقط',
    expires: 'ينتهي الطلب',
    open: 'فتح الطلب',
  },
  ku: {
    title: 'داواکاری پشکنینی هەژمارەکەت',
    body: '{admin} داواکاری {mode}ی لە تیکێتی «{ticket}» ناردووە.',
    live: 'بینینی ڕاستەوخۆ',
    readOnly: 'پشکنینی سەربەخۆی تەنها خوێندنەوە',
    expires: 'داواکاری کۆتایی دێت',
    open: 'کردنەوەی داواکاری',
  },
  en: {
    title: 'Account inspection request',
    body: '{admin} requested {mode} for the “{ticket}” support ticket.',
    live: 'live observation',
    readOnly: 'an independent read-only inspection',
    expires: 'Request expires',
    open: 'Open request',
  },
} as const;

export default function NotificationsPage() {
  const { t, lang } = useI18n();
  const [notifications, setNotifications] = useState<MerchantNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const inspectionText =
    lang === 'en'
      ? INSPECTION_NOTIFICATION_TEXT.en
      : lang === 'ku'
        ? INSPECTION_NOTIFICATION_TEXT.ku
        : INSPECTION_NOTIFICATION_TEXT.ar;

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const response = await fetch('/api/auth/notifications?limit=50', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.notifications)) {
        throw new Error('invalid notification response');
      }

      setNotifications(data.notifications as MerchantNotification[]);
    } catch (error) {
      console.error('Could not load merchant notifications:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  const markAsRead = async (notificationId: string) => {
    setMarkingId(notificationId);

    try {
      const response = await fetch(
        `/api/auth/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.notification) {
        throw new Error('could not mark notification as read');
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? { ...item, read_at: data.notification.read_at }
            : item,
        ),
      );
      notifyMerchantNotificationsChanged();
    } catch (error) {
      console.error('Could not mark merchant notification as read:', error);
    } finally {
      setMarkingId(null);
    }
  };

  const openInspectionRequest = async (
    notification: MerchantInspectionNotification,
  ) => {
    if (!notification.read_at) await markAsRead(notification.id);
    window.location.assign(notification.action_url);
  };

  const renderBalanceMessage = (notification: MerchantBalanceNotification) => {
    const template =
      notification.emergency_debt_paid > 0
        ? notification.addon_replies_added > 0
          ? t.balance_notification_debt_and_addon
          : t.balance_notification_debt_only
        : t.balance_notification_addon_only;

    return formatNotificationText(template, {
      purchased: notification.purchased_replies.toLocaleString(locale),
      debtPaid: notification.emergency_debt_paid.toLocaleString(locale),
      debtRemaining: notification.emergency_debt_remaining.toLocaleString(locale),
      addonAdded: notification.addon_replies_added.toLocaleString(locale),
    });
  };

  const renderBalanceSummary = (notification: MerchantBalanceNotification) =>
    formatNotificationText(t.balance_notification_summary, {
      base: notification.base_replies_remaining.toLocaleString(locale),
      emergency: notification.emergency_replies_remaining.toLocaleString(locale),
      addon: notification.addon_replies_remaining.toLocaleString(locale),
      total: notification.total_replies_available.toLocaleString(locale),
    });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <Bell className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black text-foreground">
              {t.notifications_title}
            </h1>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t.notifications_subtitle}
          </p>
        </div>

        {unreadCount > 0 && (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
            <span>{unreadCount.toLocaleString(locale)}</span>
            <span>{t.notifications_unread_count}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">{t.notifications_loading}</span>
        </div>
      ) : loadError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="font-bold text-foreground">{t.notifications_load_error}</p>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            {t.notifications_retry}
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bell className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-black text-foreground">
            {t.notifications_empty_title}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {t.notifications_empty_body}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const unread = !notification.read_at;
            const marking = markingId === notification.id;

            if (notification.type === 'inspection_session_request') {
              const modeLabel =
                notification.mode === 'live_observation'
                  ? inspectionText.live
                  : inspectionText.readOnly;
              const body = formatNotificationText(inspectionText.body, {
                admin: notification.admin_name,
                mode: modeLabel,
                ticket: notification.ticket_subject,
              });

              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                    unread
                      ? 'border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/25'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        unread
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <ShieldCheck className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-black text-foreground">
                          {inspectionText.title}
                        </h2>
                        <time
                          className="text-[11px] font-medium text-muted-foreground"
                          dateTime={notification.created_at}
                        >
                          {new Date(notification.created_at).toLocaleString(locale)}
                        </time>
                      </div>

                      <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">
                        {body}
                      </p>

                      <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                        {inspectionText.expires}:{' '}
                        {new Date(notification.request_expires_at).toLocaleString(locale)}
                      </p>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => void openInspectionRequest(notification)}
                          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ExternalLink className="h-4 w-4" />
                          )}
                          {inspectionText.open}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            return (
              <article
                key={notification.id}
                className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                  unread
                    ? 'border-sky-300 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/25'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      unread
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Bell className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-black text-foreground">
                        {t.balance_notification_title}
                      </h2>
                      <time
                        className="text-[11px] font-medium text-muted-foreground"
                        dateTime={notification.created_at}
                      >
                        {new Date(notification.created_at).toLocaleString(locale)}
                      </time>
                    </div>

                    <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">
                      {renderBalanceMessage(notification)}
                    </p>

                    <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                      {renderBalanceSummary(notification)}
                    </p>

                    <div className="mt-3 flex justify-end">
                      {unread ? (
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => void markAsRead(notification.id)}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          {t.notifications_mark_read}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <Check className="h-4 w-4" />
                          {t.notifications_read}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
