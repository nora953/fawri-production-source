import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SubscriptionCard } from '@/components/SubscriptionCard';
import { useI18n } from '@/lib/i18n';
import {
  getCurrentMerchant,
  getSubscriptions,
  saveSubscriptions,
} from '@/lib/store';
import { Subscription } from '@/lib/types';

function getSubscriptionTimestamp(subscription: Subscription): number {
  const startTimestamp = new Date(subscription.start_date).getTime();

  return Number.isFinite(startTimestamp) ? startTimestamp : 0;
}

function findCurrentSubscription(
  subscriptions: Subscription[],
  merchantId: string,
): Subscription | null {
  const merchantSubscriptions = subscriptions
    .filter(subscription => subscription.merchant_id === merchantId)
    .sort(
      (first, second) =>
        getSubscriptionTimestamp(second) -
        getSubscriptionTimestamp(first),
    );

  return (
    merchantSubscriptions.find(
      subscription => subscription.status === 'active',
    ) ??
    merchantSubscriptions[0] ??
    null
  );
}

export default function SubscriptionPage() {
  const { t } = useI18n();
  const merchant = getCurrentMerchant();
  const merchantId = merchant?.id ?? null;

  const [subscription, setSubscription] =
    useState<Subscription | null>(null);

  useEffect(() => {
    let active = true;

    if (!merchantId) {
      setSubscription(null);
      return () => {
        active = false;
      };
    }

    setSubscription(
      findCurrentSubscription(getSubscriptions(), merchantId),
    );

    fetch('/api/auth/subscription/current')
      .then(async response => ({
        response,
        data: await response.json().catch(() => null),
      }))
      .then(({ response, data }) => {
        if (!active || !response.ok || !data?.ok || !data.subscription) return;
        const serverSubscription = data.subscription as Subscription;
        const nextSubscriptions = [
          ...getSubscriptions().filter(item => item.merchant_id !== merchantId),
          serverSubscription,
        ];
        saveSubscriptions(nextSubscriptions);
        setSubscription(serverSubscription);
      })
      .catch(error => {
        console.error('Could not load the current subscription:', error);
      });

    return () => {
      active = false;
    };
  }, [merchantId]);

  const handleActivateEmergency = async () => {
    if (!merchantId || !subscription) return;

    try {
      const response = await fetch('/api/auth/subscription/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.subscription) {
        throw new Error(data?.error || 'Could not activate emergency credit');
      }

      const updatedSubscription = data.subscription as Subscription;
      const updatedSubscriptions = [
        ...getSubscriptions().filter(item => item.merchant_id !== merchantId),
        updatedSubscription,
      ];
      saveSubscriptions(updatedSubscriptions);
      setSubscription(updatedSubscription);
      toast.success(t.subscription_emergency_success);
    } catch (error) {
      console.error('Emergency credit activation failed:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t.subscription_emergency_unavailable,
      );
    }
  };

  if (!merchantId) return null;

  if (!subscription) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        {t.subscription_no_active}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t.subscription}</h1>

      <SubscriptionCard
        subscription={subscription}
        onEmergencyActivate={handleActivateEmergency}
      />
    </div>
  );
}
