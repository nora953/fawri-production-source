import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Subscription } from '@/lib/types';
import { AlertTriangle, Clock } from 'lucide-react';
import { EmergencyCredit } from './EmergencyCredit';
import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';

interface SubscriptionCardProps {
  subscription: Subscription;
  onEmergencyActivate: () => void;
}

export function SubscriptionCard({ subscription, onEmergencyActivate }: SubscriptionCardProps) {
  const { t, lang } = useI18n();
  const messages = subscriptionStateMessages[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const planName = {
    silver: t.plan_silver,
    gold: t.plan_gold,
    diamond: t.plan_diamond,
    trial: t.plan_trial,
  }[subscription.plan_name];

  const baseReplyLimit = subscription.base_reply_limit ?? subscription.reply_limit;
  const baseRepliesUsed =
    subscription.base_replies_used ??
    Math.min(subscription.replies_used, baseReplyLimit);
  const baseRepliesRemaining =
    subscription.base_replies_remaining ??
    Math.max(0, baseReplyLimit - baseRepliesUsed);
  const emergencyRepliesRemaining = subscription.emergency_credit_remaining ?? 0;
  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;
  const usagePercent = baseReplyLimit > 0
    ? (baseRepliesUsed / baseReplyLimit) * 100
    : 0;
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(subscription.expires_at).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  const isActive = subscription.status === 'active';
  const canShowEmergency =
    isActive || subscription.status === 'replies_exhausted';

  const statusLabel = {
    pending_activation: t.subscription_status_pending_activation,
    active: t.subscription_status_active,
    expired: t.subscription_status_expired,
    replies_exhausted: t.subscription_status_replies_exhausted,
    suspended: t.subscription_status_suspended,
  }[subscription.status];

  const stateDescription = {
    pending_activation: messages.pendingBody,
    active: null,
    expired: messages.expiredProtectedBody,
    replies_exhausted: messages.repliesExhaustedBody,
    suspended: messages.suspendedBody,
  }[subscription.status];

  let progressColor = 'bg-primary';
  if (usagePercent > 90) progressColor = 'bg-red-500';
  else if (usagePercent >= 80) progressColor = 'bg-yellow-500';

  const startDate = new Date(subscription.start_date).toLocaleDateString(locale);
  const expiryDate = new Date(subscription.expires_at).toLocaleDateString(locale);

  return (
    <Card className="relative w-full overflow-hidden">
      <CardHeader className="space-y-2 pb-3 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-2xl font-bold">{planName}</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              {subscription.price_iqd.toLocaleString(locale)} IQD {t.per_month}
            </div>
          </div>
          <Badge variant={isActive ? 'default' : 'secondary'} className="shrink-0 text-sm">
            {statusLabel}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t.subscription_start_date}:{' '}
            <strong className="font-semibold text-foreground">{startDate}</strong>
          </span>
          <span>
            {t.expires}:{' '}
            <strong className="font-semibold text-foreground">{expiryDate}</strong>
          </span>
          {isActive && daysRemaining <= 3 && (
            <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
              {daysRemaining} {t.days_remaining}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {stateDescription && (
          <Alert
            className={
              subscription.status === 'suspended'
                ? 'border-red-500 py-2 text-red-700 dark:text-red-300'
                : 'border-orange-500 py-2 text-orange-700 dark:text-orange-300'
            }
          >
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{statusLabel}</AlertTitle>
            <AlertDescription>{stateDescription}</AlertDescription>
          </Alert>
        )}

        {isActive && usagePercent >= 100 && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-medium">
              {t.usage_100_warning}
            </AlertDescription>
          </Alert>
        )}
        {isActive && usagePercent >= 90 && usagePercent < 100 && (
          <Alert className="border-orange-500 py-2 text-orange-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertDescription className="font-medium">
              {t.usage_90_warning}
            </AlertDescription>
          </Alert>
        )}
        {isActive && usagePercent >= 80 && usagePercent < 90 && (
          <Alert className="border-yellow-500 py-2 text-yellow-600">
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertDescription className="font-medium">
              {t.usage_80_warning}
            </AlertDescription>
          </Alert>
        )}
        {isActive && daysRemaining <= 3 && (
          <Alert className="border-orange-500 py-2 text-orange-600">
            <Clock className="h-4 w-4 stroke-current" />
            <AlertDescription className="font-medium">
              {t.expiry_warning}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3">
          <div className="flex justify-between gap-4 text-sm">
            <span>{t.subscription_base_limit}</span>
            <span className="font-bold tabular-nums" dir="ltr">
              {baseReplyLimit.toLocaleString(locale)}
            </span>
          </div>
          <Progress value={usagePercent} className={`h-2 ${progressColor}`} />
          <div className="flex justify-between gap-4 text-xs text-muted-foreground">
            <span>
              {baseRepliesUsed.toLocaleString(locale)} {t.subscription_base_used}
            </span>
            <span>
              {baseRepliesRemaining.toLocaleString(locale)} {t.subscription_base_remaining}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            [t.subscription_emergency_balance, emergencyRepliesRemaining],
            [t.subscription_addon_balance, addonRepliesRemaining],
            [t.subscription_total_available, totalRepliesAvailable],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 sm:block"
            >
              <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
              <p className="text-lg font-bold tabular-nums sm:mt-1" dir="ltr">
                {Number(value).toLocaleString(locale)}
              </p>
            </div>
          ))}
        </div>

        {canShowEmergency && (
          <EmergencyCredit subscription={subscription} onActivate={onEmergencyActivate} />
        )}
      </CardContent>
    </Card>
  );
}
