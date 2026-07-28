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
  const planName = {
    silver: t.plan_silver,
    gold: t.plan_gold,
    diamond: t.plan_diamond,
    trial: t.plan_trial,
  }[subscription.plan_name];

  const usagePercent = subscription.reply_limit > 0
    ? (subscription.replies_used / subscription.reply_limit) * 100
    : 0;
  const daysRemaining = Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const isActive = subscription.status === 'active';

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

  let progressColor = "bg-primary";
  if (usagePercent > 90) progressColor = "bg-red-500";
  else if (usagePercent >= 80) progressColor = "bg-yellow-500";

  return (
    <Card className="w-full relative overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <CardTitle className="mb-1 text-2xl font-bold">{planName}</CardTitle>
            <div className="text-muted-foreground">{subscription.price_iqd.toLocaleString()} IQD {t.per_month}</div>
          </div>
          <Badge variant={isActive ? 'default' : 'secondary'} className="text-sm">
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {stateDescription && (
          <Alert className={subscription.status === 'suspended' ? 'border-red-500 text-red-700 dark:text-red-300' : 'border-orange-500 text-orange-700 dark:text-orange-300'}>
            <AlertTriangle className="h-4 w-4 stroke-current" />
            <AlertTitle>{statusLabel}</AlertTitle>
            <AlertDescription>{stateDescription}</AlertDescription>
          </Alert>
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

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{t.reply_limit}</span>
            <span className="font-medium">{subscription.reply_limit.toLocaleString()}</span>
          </div>
          <Progress value={usagePercent} className={`h-2 ${progressColor}`} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{subscription.replies_used.toLocaleString()} {t.replies_used}</span>
            <span>{subscription.replies_remaining.toLocaleString()} {t.replies_remaining}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <div className="text-sm text-muted-foreground mb-1">{t.subscription_start_date}</div>
            <div className="font-medium">{new Date(subscription.start_date).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ')}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">{t.expires}</div>
            <div className="font-medium flex items-center gap-2">
              {new Date(subscription.expires_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ')}
              {isActive && daysRemaining <= 3 && <Badge variant="destructive" className="text-[10px] px-1">{daysRemaining} {t.days_remaining}</Badge>}
            </div>
          </div>
        </div>

        {isActive && (
          <EmergencyCredit subscription={subscription} onActivate={onEmergencyActivate} />
        )}
      </CardContent>
    </Card>
  );
}
