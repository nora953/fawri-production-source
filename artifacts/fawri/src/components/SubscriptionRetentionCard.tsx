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
} from "@/lib/store";
import { Merchant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type RetentionStatus = NonNullable<Merchant["retention_status"]>;

function daysUntil(value?: string): number | undefined {
  if (!value) return undefined;

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return undefined;

  return Math.max(
    0,
    Math.ceil((time - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}

export default function SubscriptionRetentionCard() {
  const { t, lang, dir } = useI18n();
  const [, setLocation] = useLocation();
  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );
useEffect(() => {
    let active = true;

    refreshCurrentMerchantFromApi()
      .then((updated) => {
        if (active && updated) setMerchant(updated);
      })
      .catch((error) => {
        console.error("Merchant lifecycle refresh failed:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!merchant) return null;

  const status: RetentionStatus =
    merchant.retention_status || "protected";

  const config = {
    protected: {
      title: t.retention_protected_title,
      body: t.retention_protected_body,
      icon: CheckCircle2,
      classes:
        "border-green-500/40 bg-green-50 text-green-950 dark:bg-green-950/20 dark:text-green-100",
      button: t.retention_manage,
    },
    warning_1: {
      title: t.retention_warning_1_title,
      body: t.retention_warning_1_body,
      icon: AlertTriangle,
      classes:
        "border-yellow-500/50 bg-yellow-50 text-yellow-950 dark:bg-yellow-950/20 dark:text-yellow-100",
      button: t.retention_renew,
    },
    warning_2: {
      title: t.retention_warning_2_title,
      body: t.retention_warning_2_body,
      icon: AlertTriangle,
      classes:
        "border-yellow-500/50 bg-yellow-50 text-yellow-950 dark:bg-yellow-950/20 dark:text-yellow-100",
      button: t.retention_renew,
    },
    warning_3: {
      title: t.retention_warning_3_title,
      body: t.retention_warning_3_body,
      icon: AlertTriangle,
      classes:
        "border-yellow-500/50 bg-yellow-50 text-yellow-950 dark:bg-yellow-950/20 dark:text-yellow-100",
      button: t.retention_renew,
    },
    final_warning: {
      title: t.retention_final_title,
      body: t.retention_final_body,
      icon: ShieldAlert,
      classes:
        "border-red-500/50 bg-red-50 text-red-950 dark:bg-red-950/20 dark:text-red-100",
      button: t.retention_renew,
    },
    eligible_for_deletion: {
      title: t.retention_eligible_title,
      body: t.retention_eligible_body,
      icon: Clock,
      classes:
        "border-zinc-500/50 bg-zinc-100 text-zinc-950 dark:bg-zinc-900/40 dark:text-zinc-100",
      button: null,
    },
  }[status];

  const Icon = config.icon;
  const activeUntil = merchant.subscription_expires_at
    ? new Date(merchant.subscription_expires_at).toLocaleDateString(
        lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ",
      )
    : undefined;

  const remainingDays =
    status === "final_warning"
      ? daysUntil(merchant.grace_period_ends_at)
      : undefined;

  return (
    <Card className={`rounded-3xl ${config.classes}`} dir={dir}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-6 w-6 shrink-0" />

          <div className="min-w-0">
            <h2 className="text-base font-extrabold">{config.title}</h2>
            <p className="mt-1 text-sm leading-6 opacity-85">{config.body}</p>

            {status === "protected" && activeUntil && (
              <p className="mt-2 text-sm font-bold">
                {t.retention_active_until}: {activeUntil}
              </p>
            )}

            {status === "final_warning" &&
              remainingDays !== undefined && (
                <p className="mt-2 text-sm font-extrabold">
                  {t.retention_remaining_days}: {remainingDays} {t.retention_days}
                </p>
              )}
          </div>
        </div>

        {config.button && (
          <Button
            className="shrink-0"
            onClick={() => setLocation("/dashboard/subscription")}
          >
            {config.button}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
