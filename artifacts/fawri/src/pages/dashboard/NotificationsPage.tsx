import { NOTIFICATIONS_PAGE_AUTHORITY_TEXT, NOTIFICATIONS_PAGE_INSPECTION_NOTIFICATION_TEXT, NOTIFICATIONS_PAGE_OPERATIONAL_NOTIFICATION_TEXT, NOTIFICATIONS_PAGE_SUPPORT_REPLY_REMINDER_TEXT } from '@/lib/translations/features/pages/dashboard/NotificationsPage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, Check, ExternalLink, Loader2, MessageCircle, Package, RefreshCw, ShieldCheck } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import {
  isSafeMerchantNotificationActionUrl,
  markMerchantNotificationReadAuthority,
  readMerchantNotificationsAuthority,
  type MerchantBalanceNotificationRecord,
  type MerchantInspectionNotificationRecord,
  type MerchantNotificationRecord,
  type MerchantOperationalNotificationRecord,
  type MerchantSubscriptionNotificationRecord,
  type MerchantSupportReplyReminderNotificationRecord,
} from '@/lib/merchantNotificationsAuthority';
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

function getArabicReplyUnit(count: number): 'رد' | 'ردود' {
  const value = Math.abs(Math.trunc(count));
  return value >= 3 && value <= 10 ? 'ردود' : 'رد';
}

function getArabicAvailabilityWord(count: number): 'متاح' | 'متاحة' {
  const value = Math.abs(Math.trunc(count));
  return value >= 3 && value <= 10 ? 'متاحة' : 'متاح';
}

function isSubscriptionNotification(
  notification: MerchantNotificationRecord,
): notification is MerchantSubscriptionNotificationRecord {
  return (
    notification.type === 'subscription_plan_event' ||
    notification.type === 'subscription_emergency_activated' ||
    notification.type === 'subscription_expiry_reminder' ||
    notification.type === 'subscription_expired' ||
    notification.type === 'addon_expiry_reminder'
  );
}

const INSPECTION_NOTIFICATION_TEXT = NOTIFICATIONS_PAGE_INSPECTION_NOTIFICATION_TEXT;

const OPERATIONAL_NOTIFICATION_TEXT = NOTIFICATIONS_PAGE_OPERATIONAL_NOTIFICATION_TEXT;

const SUPPORT_REPLY_REMINDER_TEXT = NOTIFICATIONS_PAGE_SUPPORT_REPLY_REMINDER_TEXT;

const AUTHORITY_TEXT = NOTIFICATIONS_PAGE_AUTHORITY_TEXT;

export default function NotificationsPage() {
  const { t, lang } = useI18n();
  const [notifications, setNotifications] = useState<MerchantNotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [authorityStale, setAuthorityStale] = useState(false);
  const [actionError, setActionError] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const latestReadIdRef = useRef(0);
  const hasConfirmedReadRef = useRef(false);

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
  const operationalText =
    lang === 'en'
      ? OPERATIONAL_NOTIFICATION_TEXT.en
      : lang === 'ku'
        ? OPERATIONAL_NOTIFICATION_TEXT.ku
        : OPERATIONAL_NOTIFICATION_TEXT.ar;
  const authorityText =
    lang === 'en'
      ? AUTHORITY_TEXT.en
      : lang === 'ku'
        ? AUTHORITY_TEXT.ku
        : AUTHORITY_TEXT.ar;

  const loadNotifications = useCallback(async (silent = false) => {
    const requestId = ++latestReadIdRef.current;
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    setActionError('');

    try {
      const nextNotifications = await readMerchantNotificationsAuthority();
      if (requestId !== latestReadIdRef.current) return;

      setNotifications(nextNotifications);
      hasConfirmedReadRef.current = true;
      setLoadError(false);
      setAuthorityStale(false);
    } catch (error) {
      if (requestId !== latestReadIdRef.current) return;
      console.error('Could not load merchant notifications:', error);
      if (hasConfirmedReadRef.current) {
        setAuthorityStale(true);
      } else {
        setLoadError(true);
      }
    } finally {
      if (requestId === latestReadIdRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();

    const handleFocus = () => void loadNotifications(true);
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (
        detail?.event === 'subscription_updated' ||
        detail?.event === 'notifications_updated'
      ) {
        void loadNotifications(true);
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
  const authorityActionsAllowed = !loading && !loadError && !authorityStale;

  const markAsRead = async (notificationId: string): Promise<boolean> => {
    if (!authorityActionsAllowed) {
      setActionError(authorityText.actionFailed);
      return false;
    }

    setMarkingId(notificationId);
    setActionError('');

    try {
      const currentNotification = await markMerchantNotificationReadAuthority(notificationId);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? currentNotification : item,
        ),
      );
      notifyMerchantNotificationsChanged();
      return true;
    } catch (error) {
      console.error('Could not mark merchant notification as read:', error);
      setActionError(authorityText.actionFailed);
      return false;
    } finally {
      setMarkingId(null);
    }
  };

  const openNotificationAction = async (
    notification:
      | MerchantInspectionNotificationRecord
      | MerchantSupportReplyReminderNotificationRecord
      | MerchantOperationalNotificationRecord,
  ) => {
    if (!authorityActionsAllowed || !isSafeMerchantNotificationActionUrl(notification.action_url)) {
      setActionError(authorityText.actionFailed);
      return;
    }
    if (!notification.read_at && !(await markAsRead(notification.id))) return;
    window.location.assign(notification.action_url);
  };

  const renderBalanceMessage = (notification: MerchantBalanceNotificationRecord) => {
    const template =
      notification.emergency_debt_paid > 0
        ? notification.addon_replies_added > 0
          ? t.balance_notification_debt_and_addon
          : t.balance_notification_debt_only
        : t.balance_notification_addon_only;

    return formatNotificationText(template, {
      purchased: notification.purchased_replies.toLocaleString(locale),
      purchasedUnit: lang === 'ar' ? getArabicReplyUnit(notification.purchased_replies) : '',
      debtPaid: notification.emergency_debt_paid.toLocaleString(locale),
      debtPaidUnit: lang === 'ar' ? getArabicReplyUnit(notification.emergency_debt_paid) : '',
      debtRemaining: notification.emergency_debt_remaining.toLocaleString(locale),
      debtRemainingUnit: lang === 'ar' ? getArabicReplyUnit(notification.emergency_debt_remaining) : '',
      addonAdded: notification.addon_replies_added.toLocaleString(locale),
      addonAddedUnit: lang === 'ar' ? getArabicReplyUnit(notification.addon_replies_added) : '',
    });
  };

  const getPlanLabel = (plan: 'silver' | 'gold' | 'diamond' | 'trial') =>
    ({ silver: t.plan_silver, gold: t.plan_gold, diamond: t.plan_diamond, trial: t.plan_trial })[plan];

  const renderSubscriptionNotification = (notification: MerchantSubscriptionNotificationRecord) => {
    const formatDate = (value: string) => new Date(value).toLocaleDateString(locale);
    if (notification.type === 'subscription_plan_event') {
      const title = notification.operation === 'activate'
        ? t.notification_plan_activated_title
        : notification.operation === 'renew'
          ? t.notification_plan_renewed_title
          : t.notification_plan_changed_title;
      const template = notification.operation === 'activate'
        ? t.notification_plan_activated_body
        : notification.operation === 'renew'
          ? t.notification_plan_renewed_body
          : t.notification_plan_changed_body;
      const planBody = formatNotificationText(template, {
        plan: getPlanLabel(notification.plan_name),
        previousPlan: notification.previous_plan_name
          ? getPlanLabel(notification.previous_plan_name)
          : getPlanLabel(notification.plan_name),
        start: formatDate(notification.start_date),
        expiry: formatDate(notification.expires_at),
      });
      const debtBody = notification.emergency_debt_paid > 0
        ? formatNotificationText(t.notification_plan_emergency_debt_paid, {
            debtPaid: notification.emergency_debt_paid.toLocaleString(locale),
            base: notification.base_replies_remaining.toLocaleString(locale),
            addon: notification.addon_replies_remaining.toLocaleString(locale),
            total: notification.total_replies_available.toLocaleString(locale),
          })
        : '';

      return {
        title,
        body: debtBody ? `${planBody} ${debtBody}` : planBody,
      };
    }
    if (notification.type === 'subscription_emergency_activated') {
      return {
        title: t.notification_emergency_activated_title,
        body: formatNotificationText(t.notification_emergency_activated_body, {
          amount: notification.emergency_replies_added.toLocaleString(locale),
          debt: notification.emergency_debt.toLocaleString(locale),
          expiry: formatDate(notification.expires_at),
        }),
      };
    }
    if (notification.type === 'subscription_expiry_reminder') {
      return {
        title: t.notification_subscription_expiry_reminder_title,
        body: formatNotificationText(t.notification_subscription_expiry_reminder_body, {
          plan: getPlanLabel(notification.plan_name),
          days: notification.days_remaining.toLocaleString(locale),
          expiry: formatDate(notification.expires_at),
        }),
      };
    }
    if (notification.type === 'subscription_expired') {
      return {
        title: t.notification_subscription_expired_title,
        body: formatNotificationText(t.notification_subscription_expired_body, {
          plan: getPlanLabel(notification.plan_name),
          expired: formatDate(notification.expired_at),
          addon: notification.addon_replies_remaining.toLocaleString(locale),
        }),
      };
    }
    return {
      title: t.notification_addon_expiry_reminder_title,
      body: formatNotificationText(t.notification_addon_expiry_reminder_body, {
        source: notification.source === 'emergency'
          ? t.subscription_addon_batch_emergency
          : t.subscription_addon_batch_purchase,
        remaining: notification.remaining_replies.toLocaleString(locale),
        days: notification.days_remaining.toLocaleString(locale),
        expiry: formatDate(notification.expires_at),
      }),
    };
  };

  const renderBalanceSummary = (notification: MerchantBalanceNotificationRecord) =>
    formatNotificationText(t.balance_notification_summary, {
      base: notification.base_replies_remaining.toLocaleString(locale),
      addon: notification.addon_replies_remaining.toLocaleString(locale),
      total: notification.total_replies_available.toLocaleString(locale),
      totalUnit: lang === 'ar' ? getArabicReplyUnit(notification.total_replies_available) : '',
      availabilityWord: lang === 'ar' ? getArabicAvailabilityWord(notification.total_replies_available) : '',
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

      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
          {actionError}
        </div>
      )}

      {authorityStale && notifications.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <span>{authorityText.stale}</span>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-background px-3 py-2 text-xs font-bold text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            {authorityText.retry}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">{t.notifications_loading}</span>
        </div>
      ) : loadError || (authorityStale && notifications.length === 0) ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="font-bold text-foreground">{authorityText.unavailable}</p>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            {authorityText.retry}
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
            const actionsDisabled = marking || !authorityActionsAllowed;

            if (isSubscriptionNotification(notification)) {
              const content = renderSubscriptionNotification(notification);
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                    unread
                      ? 'border-violet-300 bg-violet-50/80 dark:border-violet-700 dark:bg-violet-950/25'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-black text-foreground">{content.title}</h2>
                        <time className="text-[11px] font-medium text-muted-foreground" dateTime={notification.created_at}>
                          {new Date(notification.created_at).toLocaleString(locale)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">{content.body}</p>
                      <div className="mt-3 flex justify-end">
                        {unread ? (
                          <button
                            type="button"
                            disabled={actionsDisabled}
                            onClick={() => void markAsRead(notification.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-60"
                          >
                            {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
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
            }

            if (
              notification.type === 'operational_new_order' ||
              notification.type === 'operational_customer_message' ||
              notification.type === 'operational_payment_conflict'
            ) {
              const isOrder = notification.type === 'operational_new_order';
              const isPaymentConflict =
                notification.type === 'operational_payment_conflict';
              const title = isPaymentConflict
                ? operationalText.conflictTitle
                : isOrder
                  ? operationalText.orderTitle
                  : operationalText.messageTitle;
              const body = isPaymentConflict
                ? formatNotificationText(operationalText.conflictBody, {
                    order: notification.order_id,
                  })
                : isOrder
                  ? formatNotificationText(operationalText.orderBody, {
                      order: notification.order_id,
                    })
                  : operationalText.messageBody;
              const openLabel = isPaymentConflict
                ? operationalText.conflictOpen
                : isOrder
                  ? operationalText.orderOpen
                  : operationalText.messageOpen;
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                    unread
                      ? 'border-teal-300 bg-teal-50/80 dark:border-teal-700 dark:bg-teal-950/25'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      unread
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {isPaymentConflict ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : isOrder ? (
                        <Package className="h-5 w-5" />
                      ) : (
                        <MessageCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-black text-foreground">{title}</h2>
                        <time className="text-[11px] font-medium text-muted-foreground" dateTime={notification.created_at}>
                          {new Date(notification.created_at).toLocaleString(locale)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">{body}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={actionsDisabled}
                          onClick={() => void openNotificationAction(notification)}
                          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                          {openLabel}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

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
                          disabled={actionsDisabled}
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
                          disabled={actionsDisabled}
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

                    {notification.addon_batch_expires_at && (
                      <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                        {formatNotificationText(t.balance_notification_addon_expiry, {
                          expiry: new Date(notification.addon_batch_expires_at).toLocaleDateString(locale),
                        })}
                      </p>
                    )}

                    <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                      {renderBalanceSummary(notification)}
                    </p>

                    <div className="mt-3 flex justify-end">
                      {unread ? (
                        <button
                          type="button"
                          disabled={actionsDisabled}
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