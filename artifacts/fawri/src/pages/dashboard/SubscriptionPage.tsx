import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SubscriptionCard } from '@/components/SubscriptionCard';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant, saveSubscriptions } from '@/lib/store';
import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';
import { Subscription } from '@/lib/types';

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

    setLoading(true);

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
          setSubscription(serverSubscription);
        } else {
          saveSubscriptions([]);
          setSubscription(null);
        }
      })
      .catch(error => {
        console.error('Could not load the current subscription:', error);
        if (active) setSubscription(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
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

  if (!subscription) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-8">
        <h1 className="text-2xl font-bold">{messages.noSubscriptionTitle}</h1>
        <p className="text-muted-foreground">{messages.noSubscriptionBody}</p>
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
