import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Subscription } from '@/lib/types';
import { AlertTriangle, ChevronDown, Clock } from 'lucide-react';
import { EmergencyCredit } from './EmergencyCredit';
import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';

interface SubscriptionCardProps {
  subscription: Subscription;
  onEmergencyActivate: () => void;
}

export function SubscriptionCard({ subscription, onEmergencyActivate }: SubscriptionCardProps) {
  const { t, lang } = useI18n();
  const [isAddonExpanded, setIsAddonExpanded] = React.useState(false);
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
  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + addonRepliesRemaining;
  const usagePercent = baseReplyLimit > 0
    ? (baseRepliesUsed / baseReplyLimit) * 100
    : 0;
  const lowBaseBalanceThreshold = Math.ceil(baseReplyLimit * 0.15);
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(subscription.expires_at).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  const isActive = subscription.status === 'active';
  const isBaseBalanceLow =
    isActive &&
    baseReplyLimit > 0 &&
    baseRepliesRemaining > 0 &&
    baseRepliesRemaining <= lowBaseBalanceThreshold;
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
  const addonReplyBatches = [...(subscription.addon_reply_batches ?? [])]
    .filter((batch) => batch.remaining > 0)
    .sort(
      (left, right) =>
        new Date(left.expires_at).getTime() -
        new Date(right.expires_at).getTime(),
    );
  const hasAddonReplyBatches = addonReplyBatches.length > 0;

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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              if (hasAddonReplyBatches) {
                setIsAddonExpanded((current) => !current);
              }
            }}
            aria-expanded={hasAddonReplyBatches ? isAddonExpanded : undefined}
            className={`flex min-h-[86px] w-full flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-3 py-3 text-center shadow-sm transition hover:border-primary/45 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              isAddonExpanded ? 'sm:col-span-2' : ''
            } ${hasAddonReplyBatches ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex min-h-8 w-full items-center justify-center gap-2 text-xs font-medium leading-4 text-muted-foreground">
              <span>{t.subscription_addon_balance}</span>
              {hasAddonReplyBatches && (
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${
                    isAddonExpanded ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground" dir="ltr">
              {addonRepliesRemaining.toLocaleString(locale)}
            </p>

            {isAddonExpanded && hasAddonReplyBatches && (
              <div className="mt-4 w-full border-t border-border/70 pt-3 text-start">
                <h3 className="mb-2 text-sm font-bold text-foreground">
                  {t.subscription_addon_batches_title}
                </h3>
                <div className="space-y-2">
                  {addonReplyBatches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {batch.source === 'emergency'
                            ? t.subscription_addon_batch_emergency
                            : t.subscription_addon_batch_purchase}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{t.subscription_addon_batch_expires}</span>
                          <strong className="font-semibold text-foreground" dir="ltr">
                            {new Date(batch.expires_at).toLocaleDateString(locale)}
                          </strong>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t.subscription_addon_batch_remaining}:{' '}
                        <strong className="text-base font-extrabold text-foreground" dir="ltr">
                          {batch.remaining.toLocaleString(locale)}
                        </strong>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </button>

          <div className="flex min-h-[86px] flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-3 py-3 text-center shadow-sm">
            <p className="flex min-h-8 items-center justify-center text-xs font-medium leading-4 text-muted-foreground">
              {t.subscription_total_available}
            </p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground" dir="ltr">
              {totalRepliesAvailable.toLocaleString(locale)}
            </p>
          </div>
        </div>

        {canShowEmergency && (
          <EmergencyCredit subscription={subscription} onActivate={onEmergencyActivate} />
        )}
      </CardContent>
    </Card>
  );
}
