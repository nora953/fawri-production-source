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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

  const usagePercent =
    sub && sub.reply_limit > 0
      ? (sub.replies_used / sub.reply_limit) * 100
      : 0;

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

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="space-y-6">
        <SubscriptionRetentionCard />

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t.overview}</h1>
        </div>

        {loadingSubscription && (
          <div className="rounded-3xl border bg-card p-5 text-center text-muted-foreground">
            {t.overview_loading}
          </div>
        )}

        {isActive && usagePercent >= 100 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t.subscription_alert_title}</AlertTitle>
            <AlertDescription>{t.usage_100_warning}</AlertDescription>
          </Alert>
        )}

        {isActive && usagePercent >= 90 && usagePercent < 100 && (
          <Alert className="border-orange-500 text-orange-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_warning_title}</AlertTitle>
            <AlertDescription>{t.usage_90_warning}</AlertDescription>
          </Alert>
        )}

        {isActive && usagePercent >= 80 && usagePercent < 90 && (
          <Alert className="border-yellow-500 text-yellow-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_notice_title}</AlertTitle>
            <AlertDescription>{t.usage_80_warning}</AlertDescription>
          </Alert>
        )}

        {isActive && daysRemaining <= 3 && (
          <Alert className="border-orange-500 text-orange-600">
            <Clock className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_warning_title}</AlertTitle>
            <AlertDescription>{t.expiry_warning}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t.current_plan}</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{planName}</div>
              {statusLabel && (
                <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t.conversations_count}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{stats.convs}</div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t.orders_count}</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{stats.orders}</div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t.products_count}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold">{stats.prods}</div>
            </CardContent>
          </Card>
        </div>

        {isActive && sub && (
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>{t.reply_limit}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
