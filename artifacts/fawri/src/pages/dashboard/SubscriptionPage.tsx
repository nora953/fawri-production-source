import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { SaasBillingPanel } from '@/components/SaasBillingPanel';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { loadCurrentSubscriptionAuthority } from '@/lib/currentSubscriptionAuthority';
import { saveSubscriptions } from '@/lib/store';
import { subscriptionStateMessages } from '@/lib/subscriptionStateMessages';
import { Subscription } from '@/lib/types';
import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

type SubscriptionAuthorityStatus =
  | 'loading'
  | 'ready'
  | 'missing'
  | 'unavailable';

export default function SubscriptionPage() {
  const { t, lang } = useI18n();
  const messages = subscriptionStateMessages[lang];

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [authorityStatus, setAuthorityStatus] =
    useState<SubscriptionAuthorityStatus>('loading');
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;

    const applySubscription = (nextSubscription: Subscription | null) => {
      if (!active) return;
      if (nextSubscription) {
        saveSubscriptions([nextSubscription]);
        setAuthorityStatus('ready');
      } else {
        saveSubscriptions([]);
        setAuthorityStatus('missing');
      }
      setSubscription(nextSubscription);
    };

    const loadSubscription = async () => {
      const result = await loadCurrentSubscriptionAuthority();
      if (!active) return;

      if (result.status === 'unavailable') {
        setSubscription(null);
        setAuthorityStatus('unavailable');
        return;
      }

      applySubscription(result.subscription);
    };

    const handleFocus = () => void loadSubscription();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      applySubscription(detail?.subscription ?? null);
    };

    setAuthorityStatus('loading');
    void loadSubscription();
    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [reloadVersion]);

  const handleActivateEmergency = async () => {
    const canRequestEmergency =
      authorityStatus === 'ready' &&
      (subscription?.status === 'active' ||
        subscription?.status === 'replies_exhausted');

    if (!subscription || !canRequestEmergency) return;

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
      setAuthorityStatus('ready');
      toast.success(t.subscription_emergency_success);
    } catch (error) {
      console.error('Emergency credit activation failed:', error);
      toast.error(
        error instanceof Error ? error.message : messages.emergencyUnavailable,
      );
    }
  };

  if (authorityStatus === 'loading') {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center text-muted-foreground">
        {t.overview_loading}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t.subscription}</h1>

      {authorityStatus === 'unavailable' ? (
        <div
          className="flex flex-col gap-4 rounded-xl border border-orange-500/70 p-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-orange-600"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <h2 className="font-bold">{messages.authorityUnavailableTitle}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {messages.authorityUnavailableBody}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => setReloadVersion((version) => version + 1)}
          >
            {messages.authorityRetry}
          </Button>
        </div>
      ) : (
        <>
          {!subscription && (
            <div className="space-y-2 rounded-xl border p-4">
              <h2 className="font-bold">{messages.noSubscriptionTitle}</h2>
              <p className="text-sm text-muted-foreground">
                {messages.noSubscriptionBody}
              </p>
            </div>
          )}

          {subscription && (
            <SubscriptionCard
              subscription={subscription}
              onEmergencyActivate={handleActivateEmergency}
            />
          )}

          <SaasBillingPanel subscription={subscription} />
        </>
      )}
    </div>
  );
}
