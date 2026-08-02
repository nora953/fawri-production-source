import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  getCurrentMerchant,
  refreshCurrentMerchantFromApi,
  saveSubscriptions,
} from "@/lib/store";
import { Merchant, Subscription } from "@/lib/types";
import { subscriptionStateMessages } from "@/lib/subscriptionStateMessages";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from "@/hooks/useMerchantRealtime";

type RetentionStatus = NonNullable<Merchant["retention_status"]>;

type SubscriptionRetentionCardProps = {
  compact?: boolean;
};

function daysUntil(value?: string): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, Math.ceil((time - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function SubscriptionRetentionCard({ compact = false }: SubscriptionRetentionCardProps) {
  const { t, lang, dir } = useI18n();
  const [, setLocation] = useLocation();
  const [merchant, setMerchant] = useState<Merchant | undefined>(getCurrentMerchant());
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const applySubscription = (nextSubscription: Subscription | null) => {
      if (!active) return;
      if (nextSubscription) saveSubscriptions([nextSubscription]);
      else saveSubscriptions([]);
      setSubscription(nextSubscription);
      setLoading(false);
    };

    const loadState = async () => {
      try {
        const [updatedMerchant, subscriptionResult] = await Promise.all([
          refreshCurrentMerchantFromApi(),
          fetch('/api/auth/subscription/current', { cache: 'no-store' }).then(
            async response => ({
              response,
              data: await response.json().catch(() => null),
            }),
          ),
        ]);
        if (!active) return;
        if (updatedMerchant) setMerchant(updatedMerchant);

        applySubscription(
          subscriptionResult.response.ok &&
            subscriptionResult.data?.ok &&
            subscriptionResult.data.subscription
            ? (subscriptionResult.data.subscription as Subscription)
            : null,
        );
      } catch (error) {
        console.error("Merchant subscription state refresh failed:", error);
        if (active) setLoading(false);
      }
    };

    const handleFocus = () => void loadState();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      const nextSubscription = detail?.subscription ?? null;
      if (
        nextSubscription &&
        merchant?.id &&
        nextSubscription.merchant_id !== merchant.id
      ) {
        return;
      }
      applySubscription(nextSubscription);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    void loadState();

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [merchant?.id]);

  if (!merchant || loading) return null;

  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";
  const messages = subscriptionStateMessages[lang];
  const retentionStatus: RetentionStatus = merchant.retention_status || "protected";
  const subscriptionIsActive =
    subscription?.status === "active" &&
    new Date(subscription.expires_at).getTime() > Date.now();

  let title: string;
  let body: string;
  let classes: string;
  let Icon = CheckCircle2;
  let button: string | null = t.retention_manage;

  if (subscriptionIsActive && subscription) {
    title = t.retention_protected_title;
    body = t.retention_protected_body;
    classes = "border-green-500/40 bg-green-50 text-green-950 dark:bg-green-950/20 dark:text-green-100";
  } else if (subscription?.status === "suspended") {
    title = messages.suspendedTitle;
    body = messages.suspendedBody;
    Icon = ShieldAlert;
    classes = "border-red-500/50 bg-red-50 text-red-950 dark:bg-red-950/20 dark:text-red-100";
    button = t.retention_renew;
  } else if (subscription?.status === "pending_activation") {
    title = messages.pendingTitle;
    body = messages.pendingBody;
    Icon = Clock;
    classes = "border-yellow-500/50 bg-yellow-50 text-yellow-950 dark:bg-yellow-950/20 dark:text-yellow-100";
  } else if (subscription?.status === "replies_exhausted") {
    title = messages.repliesExhaustedTitle;
    body = messages.repliesExhaustedBody;
    Icon = AlertTriangle;
    classes = "border-orange-500/50 bg-orange-50 text-orange-950 dark:bg-orange-950/20 dark:text-orange-100";
    button = t.retention_renew;
  } else if (retentionStatus === "warning_1") {
    title = t.retention_warning_1_title;
    body = t.retention_warning_1_body;
    Icon = AlertTriangle;
    classes = "border-yellow-500/50 bg-yellow-50 text-yellow-950 dark:bg-yellow-950/20 dark:text-yellow-100";
    button = t.retention_renew;
  } else if (retentionStatus === "warning_2") {
    title = t.retention_warning_2_title;
    body = t.retention_warning_2_body;
    Icon = AlertTriangle;
    classes = "border-yellow-500/50 bg-yellow-50 text-yellow-950 dark:bg-yellow-950/20 dark:text-yellow-100";
    button = t.retention_renew;
  } else if (retentionStatus === "warning_3") {
    title = t.retention_warning_3_title;
    body = t.retention_warning_3_body;
    Icon = AlertTriangle;
    classes = "border-yellow-500/50 bg-yellow-50 text-yellow-950 dark:bg-yellow-950/20 dark:text-yellow-100";
    button = t.retention_renew;
  } else if (retentionStatus === "final_warning") {
    title = t.retention_final_title;
    body = t.retention_final_body;
    Icon = ShieldAlert;
    classes = "border-red-500/50 bg-red-50 text-red-950 dark:bg-red-950/20 dark:text-red-100";
    button = t.retention_renew;
  } else if (retentionStatus === "eligible_for_deletion") {
    title = t.retention_eligible_title;
    body = t.retention_eligible_body;
    Icon = Clock;
    classes = "border-zinc-500/50 bg-zinc-100 text-zinc-950 dark:bg-zinc-900/40 dark:text-zinc-100";
    button = null;
  } else if (subscription) {
    title = messages.expiredProtectedTitle;
    body = messages.expiredProtectedBody;
    Icon = Clock;
    classes = "border-orange-500/50 bg-orange-50 text-orange-950 dark:bg-orange-950/20 dark:text-orange-100";
    button = t.retention_renew;
  } else {
    title = messages.noSubscriptionTitle;
    body = messages.noSubscriptionBody;
    Icon = Clock;
    classes = "border-zinc-400/50 bg-zinc-50 text-zinc-950 dark:bg-zinc-900/40 dark:text-zinc-100";
  }

  const activeUntil = subscriptionIsActive && subscription
    ? new Date(subscription.expires_at).toLocaleDateString(locale)
    : undefined;
  const remainingDays = retentionStatus === "final_warning"
    ? daysUntil(merchant.grace_period_ends_at)
    : undefined;

  return (
    <Card className={`${compact ? "rounded-2xl" : "rounded-3xl"} ${classes}`} dir={dir}>
      <CardContent
        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${
          compact ? "gap-3 p-4" : "gap-4 p-5"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={`${compact ? "h-5 w-5" : "h-6 w-6"} mt-0.5 shrink-0`} />
          <div className="min-w-0">
            <h2 className={`${compact ? "text-sm" : "text-base"} font-extrabold`}>{title}</h2>
            <p className={`${compact ? "mt-0.5 text-xs leading-5" : "mt-1 text-sm leading-6"} opacity-85`}>{body}</p>
            {activeUntil && (
              <p className={`${compact ? "mt-1 text-xs" : "mt-2 text-sm"} font-bold`}>
                {t.retention_active_until}: {activeUntil}
              </p>
            )}
            {retentionStatus === "final_warning" && remainingDays !== undefined && (
              <p className="mt-2 text-sm font-extrabold">
                {t.retention_remaining_days}: {remainingDays} {t.retention_days}
              </p>
            )}
          </div>
        </div>

        {button && (
          <Button
            className={`shrink-0 ${compact ? "h-9 px-4 text-xs" : ""}`}
            onClick={() => setLocation("/dashboard/subscription")}
          >
            {button}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
