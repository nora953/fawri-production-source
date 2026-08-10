import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SaasBillingPanel } from '@/components/SaasBillingPanel';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant, saveSubscriptions } from '@/lib/store';
import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';
import { Subscription } from '@/lib/types';
import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

export default function SubscriptionPage() {
  const { t, lang } = useI18n();
  const merchant = getCurrentMerchant();
  const merchantId = merchant?.id ?? null;
  const messages = subscriptionStateMessages[lang];

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!merchantId) {
      setSubscription(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const applySubscription = (nextSubscription: Subscription | null) => {
      if (!active) return;
      if (nextSubscription) saveSubscriptions([nextSubscription]);
      else saveSubscriptions([]);
      setSubscription(nextSubscription);
      setLoading(false);
    };

    const loadSubscription = async () => {
      try {
        const response = await fetch('/api/auth/subscription/current', {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        if (!active) return;
        applySubscription(
          response.ok && data?.ok && data.subscription
            ? (data.subscription as Subscription)
            : null,
        );
      } catch (error) {
        console.error('Could not load the current subscription:', error);
        if (active) setLoading(false);
      }
    };

    const handleFocus = () => void loadSubscription();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      const nextSubscription = detail?.subscription ?? null;
      if (nextSubscription && nextSubscription.merchant_id !== merchantId) return;
      applySubscription(nextSubscription);
    };

    setLoading(true);
    void loadSubscription();
    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [merchantId]);

  const handleActivateEmergency = async () => {
    const canRequestEmergency =
      subscription?.status === 'active' ||
      subscription?.status === 'replies_exhausted';

    if (!merchantId || !subscription || !canRequestEmergency) return;

    try {
      const response = await fetch('/api/auth/subscription/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || !data.subscription) {
        throw new Error(data?.error || messages.emergencyUnavailable);
      }

      const updatedSubscription = data.subscription as Subscription;
      saveSubscriptions([updatedSubscription]);
      setSubscription(updatedSubscription);
      toast.success(t.subscription_emergency_success);
    } catch (error) {
      console.error('Emergency credit activation failed:', error);
      toast.error(
        error instanceof Error ? error.message : messages.emergencyUnavailable,
      );
    }
  };

  if (!merchantId) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center text-muted-foreground">
        {t.overview_loading}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t.subscription}</h1>

      {!subscription && (
        <div className="space-y-2 rounded-xl border p-4">
          <h2 className="font-bold">{messages.noSubscriptionTitle}</h2>
          <p className="text-sm text-muted-foreground">{messages.noSubscriptionBody}</p>
        </div>
      )}

      {subscription && (
        <SubscriptionCard
          subscription={subscription}
          onEmergencyActivate={handleActivateEmergency}
        />
      )}

      <SaasBillingPanel subscription={subscription} />
    </div>
  );
}
