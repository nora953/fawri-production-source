import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, ExternalLink, Loader2, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import type {
  MerchantBalanceNotification,
  MerchantInspectionNotification,
  MerchantNotification,
  MerchantSupportReplyReminderNotification,
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
    pendingTitle: 'طلب فحص حسابك',
    approvedTitle: 'تمت الموافقة على طلب الفحص',
    rejectedTitle: 'تم رفض طلب الفحص',
    expiredTitle: 'انتهى طلب الفحص',
    pendingBody: 'أرسل {admin} طلب {mode} ضمن تذكرة «{ticket}».',
    approvedBody: 'وافقت على طلب {mode} من {admin} ضمن تذكرة «{ticket}».',
    rejectedBody: 'رفضت طلب {mode} من {admin} ضمن تذكرة «{ticket}».',
    expiredBody: 'انتهى طلب {mode} من {admin} ضمن تذكرة «{ticket}».',
    live: 'مشاهدة مباشرة',
    readOnly: 'فحص مستقل للقراءة فقط',
    requestExpires: 'ينتهي الطلب',
    approvalExpires: 'تنتهي الموافقة',
    decisionAt: 'وقت القرار',
    endedAt: 'وقت الانتهاء',
    pending: 'بانتظار قرارك',
    approved: 'تمت الموافقة',
    rejected: 'تم الرفض',
    expired: 'منتهٍ',
    openRequest: 'فتح الطلب',
    openTicket: 'فتح التذكرة',
  },
  ku: {
    pendingTitle: 'داواکاری پشکنینی هەژمارەکەت',
    approvedTitle: 'داواکاری پشکنین پەسەند کرا',
    rejectedTitle: 'داواکاری پشکنین ڕەت کرایەوە',
    expiredTitle: 'داواکاری پشکنین کۆتایی هات',
    pendingBody: '{admin} داواکاری {mode}ی لە تیکێتی «{ticket}» ناردووە.',
    approvedBody: 'ڕەزامەندیت دا بە داواکاری {mode}ی {admin} لە تیکێتی «{ticket}».',
    rejectedBody: 'داواکاری {mode}ی {admin}ت لە تیکێتی «{ticket}» ڕەتکردەوە.',
    expiredBody: 'داواکاری {mode}ی {admin} لە تیکێتی «{ticket}» کۆتایی هات.',
    live: 'بینینی ڕاستەوخۆ',
    readOnly: 'پشکنینی سەربەخۆی تەنها خوێندنەوە',
    requestExpires: 'داواکاری کۆتایی دێت',
    approvalExpires: 'ڕەزامەندی کۆتایی دێت',
    decisionAt: 'کاتی بڕیار',
    endedAt: 'کاتی کۆتایی',
    pending: 'چاوەڕوانی بڕیارت',
    approved: 'پەسەند کرا',
    rejected: 'ڕەت کرایەوە',
    expired: 'کۆتایی هاتوو',
    openRequest: 'کردنەوەی داواکاری',
    openTicket: 'کردنەوەی تیکێت',
  },
  en: {
    pendingTitle: 'Account inspection request',
    approvedTitle: 'Inspection request approved',
    rejectedTitle: 'Inspection request rejected',
    expiredTitle: 'Inspection request ended',
    pendingBody: '{admin} requested {mode} for the “{ticket}” support ticket.',
    approvedBody: 'You approved {admin}’s {mode} request for the “{ticket}” support ticket.',
    rejectedBody: 'You rejected {admin}’s {mode} request for the “{ticket}” support ticket.',
    expiredBody: '{admin}’s {mode} request for the “{ticket}” support ticket has ended.',
    live: 'live observation',
    readOnly: 'an independent read-only inspection',
    requestExpires: 'Request expires',
    approvalExpires: 'Approval expires',
    decisionAt: 'Decision time',
    endedAt: 'Ended at',
    pending: 'Waiting for your decision',
    approved: 'Approved',
    rejected: 'Rejected',
    expired: 'Ended',
    openRequest: 'Open request',
    openTicket: 'Open ticket',
  },
} as const;

const SUPPORT_REPLY_REMINDER_TEXT = {
  ar: {
    title: 'تذكير: ننتظر ردك',
    body: 'فريق الدعم رد على تذكرة «{ticket}» وينتظر ردك. ستُغلق التذكرة تلقائيًا بعد 72 ساعة من آخر رد للدعم إذا لم يصل رد منك.',
    open: 'فتح التذكرة',
  },
  ku: {
    title: 'بیرهێنانەوە: چاوەڕوانی وەڵامەکەتین',
    body: 'تیمی پشتگیری وەڵامی تیکێتی «{ticket}»ی داوەتەوە و چاوەڕوانی وەڵامەکەتە. ئەگەر وەڵام نەدەیت، تیکێتەکە دوای ٧٢ کاتژمێر لە دوا وەڵامی پشتگیری خۆکارانە دادەخرێت.',
    open: 'کردنەوەی تیکێت',
  },
  en: {
    title: 'Reminder: awaiting your reply',
    body: 'Support replied to the “{ticket}” ticket and is waiting for you. The ticket will close automatically 72 hours after the latest support reply if you do not respond.',
    open: 'Open ticket',
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
  const supportReminderText =
    lang === 'en'
      ? SUPPORT_REPLY_REMINDER_TEXT.en
      : lang === 'ku'
        ? SUPPORT_REPLY_REMINDER_TEXT.ku
        : SUPPORT_REPLY_REMINDER_TEXT.ar;

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

  const openNotificationAction = async (
    notification:
      | MerchantInspectionNotification
      | MerchantSupportReplyReminderNotification,
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

            if (notification.type === 'support_reply_reminder') {
              const body = formatNotificationText(supportReminderText.body, {
                ticket: notification.ticket_subject,
              });
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                    unread
                      ? 'border-orange-300 bg-orange-50/80 dark:border-orange-800 dark:bg-orange-950/25'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      unread
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-black text-foreground">{supportReminderText.title}</h2>
                        <time className="text-[11px] font-medium text-muted-foreground" dateTime={notification.created_at}>
                          {new Date(notification.created_at).toLocaleString(locale)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">{body}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => void openNotificationAction(notification)}
                          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                          {supportReminderText.open}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            if (notification.type === 'inspection_session_request') {
              const modeLabel =
                notification.mode === 'live_observation'
                  ? inspectionText.live
                  : inspectionText.readOnly;
              const displayStatus = notification.ended_at
                ? 'expired'
                : notification.request_status || 'pending';
              const title =
                displayStatus === 'approved'
                  ? inspectionText.approvedTitle
                  : displayStatus === 'rejected'
                    ? inspectionText.rejectedTitle
                    : displayStatus === 'expired'
                      ? inspectionText.expiredTitle
                      : inspectionText.pendingTitle;
              const bodyTemplate =
                displayStatus === 'approved'
                  ? inspectionText.approvedBody
                  : displayStatus === 'rejected'
                    ? inspectionText.rejectedBody
                    : displayStatus === 'expired'
                      ? inspectionText.expiredBody
                      : inspectionText.pendingBody;
              const body = formatNotificationText(bodyTemplate, {
                admin: notification.admin_name,
                mode: modeLabel,
                ticket: notification.ticket_subject,
              });
              const statusLabel =
                displayStatus === 'approved'
                  ? inspectionText.approved
                  : displayStatus === 'rejected'
                    ? inspectionText.rejected
                    : displayStatus === 'expired'
                      ? inspectionText.expired
                      : inspectionText.pending;
              const timeLabel =
                displayStatus === 'approved'
                  ? inspectionText.approvalExpires
                  : displayStatus === 'rejected'
                    ? inspectionText.decisionAt
                    : displayStatus === 'expired'
                      ? inspectionText.endedAt
                      : inspectionText.requestExpires;
              const timeValue =
                displayStatus === 'approved'
                  ? notification.session_expires_at || notification.responded_at
                  : displayStatus === 'rejected'
                    ? notification.responded_at
                    : displayStatus === 'expired'
                      ? notification.ended_at || notification.responded_at
                      : notification.request_expires_at;
              const cardTone =
                displayStatus === 'approved'
                  ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-700 dark:bg-emerald-950/25'
                  : displayStatus === 'rejected'
                    ? 'border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/25'
                    : displayStatus === 'expired'
                      ? 'border-border bg-card'
                      : 'border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/25';
              const badgeTone =
                displayStatus === 'approved'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                  : displayStatus === 'rejected'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300'
                    : displayStatus === 'expired'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300';

              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${cardTone}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${badgeTone}`}
                    >
                      <ShieldCheck className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-black text-foreground">{title}</h2>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badgeTone}`}>
                            {statusLabel}
                          </span>
                        </div>
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

                      {timeValue && (
                        <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                          {timeLabel}:{' '}
                          {new Date(timeValue).toLocaleString(locale)}
                        </p>
                      )}

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => void openNotificationAction(notification)}
                          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ExternalLink className="h-4 w-4" />
                          )}
                          {displayStatus === 'pending'
                            ? inspectionText.openRequest
                            : inspectionText.openTicket}
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
