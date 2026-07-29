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
  const usagePercent =
    baseReplyLimit > 0 ? (baseRepliesUsed / baseReplyLimit) * 100 : 0;

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

  let progressColor = 'bg-primary';
  if (usagePercent > 90) progressColor = 'bg-red-500';
  else if (usagePercent >= 80) progressColor = 'bg-yellow-500';

  const usageNotice =
    isActive && usagePercent >= 100
      ? { text: t.usage_100_warning, className: 'border-red-500 text-red-600' }
      : isActive && usagePercent >= 90
        ? { text: t.usage_90_warning, className: 'border-orange-500 text-orange-600' }
        : isActive && usagePercent >= 80
          ? { text: t.usage_80_warning, className: 'border-yellow-500 text-yellow-700' }
          : null;

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

        {usageNotice && (
          <div
            className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 ${usageNotice.className}`}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold leading-5">{usageNotice.text}</p>
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
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-base">{t.reply_limit}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{sub.replies_used} {t.replies_used}</span>
                <span className="font-medium">{sub.reply_limit} {t.total}</span>
              </div>
              <Progress value={usagePercent} className={`h-2 ${progressColor}`} />
              <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                <span>{sub.replies_remaining} {t.replies_remaining}</span>
                <span>{daysRemaining} {t.days_remaining}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
