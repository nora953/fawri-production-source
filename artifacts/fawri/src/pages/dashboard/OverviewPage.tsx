import React, { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  getCurrentMerchant,
  getSubscriptions,
  getConversations,
  getOrders,
  getProducts,
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

export default function OverviewPage() {
  const { t, dir } = useI18n();
  const merchant = getCurrentMerchant();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [stats, setStats] = useState({ convs: 0, orders: 0, prods: 0 });

  useEffect(() => {
    if (!merchant) return;

    const subs = getSubscriptions();
    const mySub = subs.find(
      item => item.merchant_id === merchant.id && item.status === 'active'
    );

    setSub(mySub || null);

    setStats({
      convs: getConversations(merchant.id).length,
      orders: getOrders(merchant.id).length,
      prods: getProducts(merchant.id).length,
    });
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

  const planName = sub
    ? {
        silver: t.plan_silver,
        gold: t.plan_gold,
        diamond: t.plan_diamond,
        trial: t.plan_trial,
      }[sub.plan_name]
    : t.subscription_no_active;

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

  let progressColor = 'bg-primary';
  if (usagePercent > 90) progressColor = 'bg-red-500';
  else if (usagePercent >= 80) progressColor = 'bg-yellow-500';

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="space-y-6">
        <SubscriptionRetentionCard />

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t.overview}
          </h1>
        </div>

        {!sub && (
          <Alert className="border-orange-500 text-orange-700 dark:text-orange-300">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_notice_title}</AlertTitle>
            <AlertDescription>{t.subscription_no_active}</AlertDescription>
          </Alert>
        )}

        {sub && usagePercent >= 100 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t.subscription_alert_title}</AlertTitle>
            <AlertDescription>{t.usage_100_warning}</AlertDescription>
          </Alert>
        )}

        {sub && usagePercent >= 90 && usagePercent < 100 && (
          <Alert className="border-orange-500 text-orange-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_warning_title}</AlertTitle>
            <AlertDescription>{t.usage_90_warning}</AlertDescription>
          </Alert>
        )}

        {sub && usagePercent >= 80 && usagePercent < 90 && (
          <Alert className="border-yellow-500 text-yellow-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_notice_title}</AlertTitle>
            <AlertDescription>{t.usage_80_warning}</AlertDescription>
          </Alert>
        )}

        {sub && daysRemaining <= 3 && (
          <Alert className="border-orange-500 text-orange-600">
            <Clock className="h-4 w-4 stroke-current" />
            <AlertTitle>{t.subscription_warning_title}</AlertTitle>
            <AlertDescription>{t.expiry_warning}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t.current_plan}
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              <div className="text-2xl font-extrabold">
                {planName}
              </div>
              {sub && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.overview_plan_active}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t.conversations_count}
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              <div className="text-2xl font-extrabold">{stats.convs}</div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t.orders_count}
              </CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              <div className="text-2xl font-extrabold">{stats.orders}</div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t.products_count}
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              <div className="text-2xl font-extrabold">{stats.prods}</div>
            </CardContent>
          </Card>
        </div>

        {sub && (
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>{t.reply_limit}</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex justify-between gap-3 text-sm">
                <span>
                  {sub.replies_used} {t.replies_used}
                </span>
                <span className="font-medium">
                  {sub.reply_limit} {t.total}
                </span>
              </div>

              <Progress value={usagePercent} className={`h-2 ${progressColor}`} />

              <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {sub.replies_remaining} {t.replies_remaining}
                </span>
                <span>
                  {daysRemaining} {t.days_remaining}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
