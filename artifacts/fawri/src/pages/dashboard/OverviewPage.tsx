import React, { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  getCurrentMerchant,
  getConversations,
  getOrders,
  getProducts,
  saveSubscriptions,
} from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  Clock,
  MessageSquare,
  Package,
  ShoppingBag,
  CreditCard,
} from 'lucide-react';
import { Subscription } from '@/lib/types';
import SubscriptionRetentionCard from '@/components/SubscriptionRetentionCard';
import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';
import { MERCHANT_REALTIME_EVENT, type MerchantRealtimeDetail } from '@/hooks/useMerchantRealtime';

export default function OverviewPage() {
  const { t, dir, lang } = useI18n();
  const merchant = getCurrentMerchant();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [stats, setStats] = useState({ convs: 0, orders: 0, prods: 0 });

  useEffect(() => {
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

  if (!merchant) {
    return (
      <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
        <div className="rounded-3xl border bg-card p-8 text-center text-muted-foreground">
          {t.overview_loading}
        </div>
      </div>
    );
  }

  const messages = subscriptionStateMessages[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const planName = sub
    ? {
        silver: t.plan_silver,
        gold: t.plan_gold,
        diamond: t.plan_diamond,
        trial: t.plan_trial,
      }[sub.plan_name]
    : messages.noSubscriptionTitle;

  const statusLabel = sub
    ? {
        pending_activation: t.subscription_status_pending_activation,
        active: t.subscription_status_active,
        expired: t.subscription_status_expired,
        replies_exhausted: t.subscription_status_replies_exhausted,
        suspended: t.subscription_status_suspended,
      }[sub.status]
    : null;

  const baseReplyLimit = sub?.base_reply_limit ?? sub?.reply_limit ?? 0;
  const baseRepliesUsed = sub
    ? sub.base_replies_used ?? Math.min(sub.replies_used, baseReplyLimit)
    : 0;
  const baseRepliesRemaining = sub
    ? sub.base_replies_remaining ?? Math.max(0, baseReplyLimit - baseRepliesUsed)
    : 0;
  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + addonRepliesRemaining;
  const usagePercent =
    baseReplyLimit > 0 ? (baseRepliesUsed / baseReplyLimit) * 100 : 0;
  const lowBaseBalanceThreshold = Math.ceil(baseReplyLimit * 0.15);

  const daysRemaining = sub
    ? Math.max(
        0,
        Math.ceil(
          (new Date(sub.expires_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const isActive = sub?.status === 'active';
  const isBaseBalanceLow =
    isActive &&
    baseReplyLimit > 0 &&
    baseRepliesRemaining > 0 &&
    baseRepliesRemaining <= lowBaseBalanceThreshold;

  let progressColor = 'bg-primary';
  if (usagePercent > 90) progressColor = 'bg-red-500';
  else if (usagePercent >= 80) progressColor = 'bg-yellow-500';

  return (
    <div className="bg-background" dir={dir}>
      <div className="space-y-4">
        <SubscriptionRetentionCard compact />

        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t.overview}</h1>
        </div>

        {loadingSubscription && (
          <div className="rounded-2xl border bg-card p-4 text-center text-sm text-muted-foreground">
            {t.overview_loading}
          </div>
        )}

        {isBaseBalanceLow && (
          <div className="flex min-h-11 items-center gap-3 rounded-lg border border-orange-500 px-3 py-2 text-orange-600">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold leading-5">
              {t.low_balance_purchase_warning}
            </p>
          </div>
        )}

        {isActive && daysRemaining <= 3 && (
          <div className="flex min-h-11 items-center gap-3 rounded-lg border border-orange-500 px-3 py-2 text-orange-600">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold leading-5">{t.expiry_warning}</p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-sm font-medium">{t.current_plan}</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-xl font-extrabold">{planName}</div>
              {statusLabel && (
                <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-sm font-medium">{t.conversations_count}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-xl font-extrabold">{stats.convs}</div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-sm font-medium">{t.orders_count}</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-xl font-extrabold">{stats.orders}</div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-sm font-medium">{t.products_count}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="text-xl font-extrabold">{stats.prods}</div>
            </CardContent>
          </Card>
        </div>

        {isActive && sub && (
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
              <CardTitle className="text-base">{t.reply_limit}</CardTitle>
              <span className="text-xs font-semibold text-muted-foreground">
                {daysRemaining.toLocaleString(locale)} {t.days_remaining}
              </span>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                  <span>
                    {t.subscription_base_limit}:{' '}
                    <strong className="font-extrabold tabular-nums" dir="ltr">
                      {baseReplyLimit.toLocaleString(locale)}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    {t.subscription_base_used}:{' '}
                    <strong className="font-bold tabular-nums text-foreground" dir="ltr">
                      {baseRepliesUsed.toLocaleString(locale)}
                    </strong>
                  </span>
                </div>
                <Progress value={usagePercent} className={`mt-2 h-2 ${progressColor}`} />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  [t.subscription_base_remaining, baseRepliesRemaining],
                  [t.subscription_addon_balance, addonRepliesRemaining],
                  [t.subscription_total_available, totalRepliesAvailable],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex min-h-[62px] flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-2 py-2 text-center shadow-sm"
                  >
                    <p className="text-[11px] font-medium leading-4 text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-base font-extrabold tabular-nums text-foreground" dir="ltr">
                      {Number(value).toLocaleString(locale)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
