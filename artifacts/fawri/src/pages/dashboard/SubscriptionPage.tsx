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
    if (!merchantId) {
      setSubscription(null);
      return;
    }

    setSubscription(
      findCurrentSubscription(getSubscriptions(), merchantId),
    );
  }, [merchantId]);

  const handleActivateEmergency = () => {
    if (!merchantId || !subscription) return;

    const subscriptions = getSubscriptions();
    const storedSubscription = subscriptions.find(
      item =>
        item.id === subscription.id &&
        item.merchant_id === merchantId,
    );

    if (
      !storedSubscription ||
      storedSubscription.status !== 'active' ||
      storedSubscription.emergency_credit_activated ||
      storedSubscription.emergency_credit_amount <= 0
    ) {
      return;
    }

    const updatedSubscription: Subscription = {
      ...storedSubscription,
      emergency_credit_activated: true,
      emergency_credit_used: 0,
      emergency_credit_remaining:
        storedSubscription.emergency_credit_amount,
      replies_remaining:
        storedSubscription.replies_remaining +
        storedSubscription.emergency_credit_amount,
      pending_next_cycle_deduction:
        storedSubscription.emergency_credit_amount,
    };

    const updatedSubscriptions = subscriptions.map(item =>
      item.id === storedSubscription.id
        ? updatedSubscription
        : item,
    );

    saveSubscriptions(updatedSubscriptions);
    setSubscription(updatedSubscription);
    toast.success(t.subscription_emergency_success);
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
