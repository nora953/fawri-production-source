import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { SaasBillingPanel } from '@/components/SaasBillingPanel';
import { CashierSubscriptionPanel } from '@/components/CashierSubscriptionPanel';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { loadCurrentSubscriptionAuthority } from '@/lib/currentSubscriptionAuthority';
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
  // The first commercial production build offers manual subscriptions only.
  // A forgotten Vite flag must not re-enable paid provider or POS controls.
  const manualCommercialOnly = import.meta.env.PROD ||
    import.meta.env.VITE_FAWRI_V1_MANUAL_COMMERCE === '1';
  const firstCommercialPosDisabled = import.meta.env.PROD ||
    import.meta.env.VITE_FAWRI_V1_POS_DISABLED === '1';

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [authorityStatus, setAuthorityStatus] =
    useState<SubscriptionAuthorityStatus>('loading');
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;

    const applySubscription = (nextSubscription: Subscription | null) => {
      if (!active) return;
      setAuthorityStatus(nextSubscription ? 'ready' : 'missing');
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
    if (manualCommercialOnly) return;
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t.subscription}</h1>

      {authorityStatus === 'loading' ? (
        <div className="rounded-xl border p-4 text-sm text-muted-foreground">
          {t.overview_loading}
        </div>
      ) : authorityStatus === 'unavailable' ? (
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

          {
            manualCommercialOnly
              ? <p className="rounded-xl border p-4">{{
                  ar: 'تفعّل إدارة فوري الاشتراك وتجدّده يدويًا.',
                  ku: 'بەڕێوەبەرایەتی فۆری بە دەستی بەشداریکردن چالاک و نوێ دەکاتەوە.',
                  en: 'Fawri administrators activate and renew subscriptions manually.',
                }[lang]}</p>
              : <SaasBillingPanel subscription={subscription} />
          }
        </>
      )}

      {!firstCommercialPosDisabled ? <CashierSubscriptionPanel /> : null}
    </div>
  );
}
