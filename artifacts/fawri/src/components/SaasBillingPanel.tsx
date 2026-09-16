import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import React from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { saasBillingCopy } from '@/lib/translations/saasBilling';
import type { Subscription } from '@/lib/types';

type Plan = 'silver' | 'gold' | 'diamond';
type BillingPlan = {
  plan: Plan;
  monthly_price_iqd: number;
  base_reply_limit: number;
  emergency_credit_amount: number;
  billing_period_months: 1;
};
type ProviderState = {
  provider: 'disabled' | 'test_fake' | 'superqi_sandbox' | 'fastpay' | 'unsupported';
  display_name: string;
  checkout_available: boolean;
  production_ready: boolean;
  test_only: boolean;
  status:
    | 'available'
    | 'disabled'
    | 'merchant_setup_required'
    | 'production_forbidden'
    | 'configuration_incomplete'
    | 'unsupported';
};
type BillingOrder = {
  id: string;
  operation: 'activate' | 'renew' | 'change';
  requested_plan: Plan;
  amount_iqd: number;
  status:
    | 'pending'
    | 'paid'
    | 'paid_reconciliation_required'
    | 'failed'
    | 'cancelled'
    | 'expired'
    | 'refunded';
  created_at: string;
};

type CatalogResponse = {
  ok: true;
  catalog_version: string;
  currency: 'IQD';
  plans: BillingPlan[];
  provider: ProviderState;
  providers: ProviderState[];
};

type AuthorityStatus = 'loading' | 'ready' | 'unavailable';

type BillingOrdersResponse = {
  ok?: unknown;
  orders?: unknown;
};

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `billing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchBillingCatalog(): Promise<CatalogResponse> {
  const response = await fetch('/api/auth/billing/catalog', {
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => null);

  if (
    !response.ok ||
    data?.ok !== true ||
    typeof data.catalog_version !== 'string' ||
    data.currency !== 'IQD' ||
    !Array.isArray(data.plans) ||
    !data.provider ||
    !Array.isArray(data.providers)
  ) {
    throw new Error('Billing catalog authority unavailable');
  }

  return data as CatalogResponse;
}

async function fetchBillingOrders(): Promise<BillingOrder[]> {
  const response = await fetch('/api/auth/billing/orders', {
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const data = (await response.json().catch(() => null)) as BillingOrdersResponse | null;

  if (!response.ok || data?.ok !== true || !Array.isArray(data.orders)) {
    throw new Error('Billing orders authority unavailable');
  }

  return data.orders as BillingOrder[];
}

export function SaasBillingPanel({ subscription }: { subscription: Subscription | null }) {
  const { lang, t } = useI18n();
  const text = saasBillingCopy[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const [catalog, setCatalog] = React.useState<CatalogResponse | null>(null);
  const [orders, setOrders] = React.useState<BillingOrder[]>([]);
  const [catalogStatus, setCatalogStatus] = React.useState<AuthorityStatus>('loading');
  const [ordersStatus, setOrdersStatus] = React.useState<AuthorityStatus>('loading');
  const [submitting, setSubmitting] = React.useState<string | null>(null);
  const loadSequence = React.useRef(0);

  const load = React.useCallback(async () => {
    const sequence = ++loadSequence.current;
    setCatalogStatus('loading');
    setOrdersStatus('loading');
    setCatalog(null);
    setOrders([]);

    const [catalogResult, ordersResult] = await Promise.allSettled([
      fetchBillingCatalog(),
      fetchBillingOrders(),
    ]);

    if (sequence !== loadSequence.current) return;

    if (catalogResult.status === 'fulfilled') {
      setCatalog(catalogResult.value);
      setCatalogStatus('ready');
    } else {
      setCatalog(null);
      setCatalogStatus('unavailable');
    }

    if (ordersResult.status === 'fulfilled') {
      setOrders(ordersResult.value);
      setOrdersStatus('ready');
    } else {
      setOrders([]);
      setOrdersStatus('unavailable');
    }
  }, []);

  React.useEffect(() => {
    void load();
    return () => {
      loadSequence.current += 1;
    };
  }, [load]);

  if (catalogStatus === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{text.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" role="status">
            {t.overview_loading}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (catalogStatus === 'unavailable' || !catalog) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{text.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-orange-500/70" role="alert">
            <AlertTitle>{text.authorityUnavailableTitle}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{text.authorityUnavailableBody}</p>
              <Button type="button" variant="outline" onClick={() => void load()}>
                {text.retry}
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const baseRemaining = subscription?.base_replies_remaining ?? subscription?.replies_remaining ?? 0;
  const expired = subscription
    ? new Date(subscription.expires_at).getTime() <= Date.now()
    : true;
  const canStartCycle = !subscription || expired || baseRemaining <= 0;

  const providers = Array.isArray(catalog.providers) ? catalog.providers : [catalog.provider];
  const checkoutAvailable = providers.some((provider) => provider.checkout_available);
  const fastPayPending = providers.some(
    (provider) => provider.provider === 'fastpay' && provider.status === 'merchant_setup_required',
  );

  const beginCheckout = async (plan: Plan, provider: ProviderState) => {
    if (!provider.checkout_available || !canStartCycle || catalogStatus !== 'ready') return;
    const operation: 'activate' | 'renew' | 'change' = !subscription
      ? 'activate'
      : subscription.plan_name === plan
        ? 'renew'
        : 'change';
    const submittingKey = `${plan}:${provider.provider}`;
    setSubmitting(submittingKey);
    try {
      const response = await fetch('/api/auth/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation,
          plan,
          provider: provider.provider,
          idempotency_key: makeIdempotencyKey(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || text.checkoutUnavailable);
      }
      const redirectUrl =
        typeof data?.checkout?.redirect_url === 'string'
          ? data.checkout.redirect_url.trim()
          : '';
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }
      toast.success(text.checkoutCreated);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.checkoutUnavailable);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!checkoutAvailable && (
          <Alert>
            <AlertTitle>{text.checkoutUnavailable}</AlertTitle>
            <AlertDescription>{text.providerDisabled}</AlertDescription>
          </Alert>
        )}
        {providers.some(
          (provider) => provider.provider === 'superqi_sandbox' && provider.checkout_available,
        ) && (
          <Alert>
            <AlertDescription>{text.sandboxNotice}</AlertDescription>
          </Alert>
        )}
        {fastPayPending && (
          <Alert>
            <AlertDescription>{text.fastPayNotice}</AlertDescription>
          </Alert>
        )}
        {checkoutAvailable && subscription && !canStartCycle && (
          <Alert>
            <AlertDescription>{text.cycleActive}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {catalog.plans.map((plan) => {
            const isCurrent = subscription?.plan_name === plan.plan;
            return (
              <div key={plan.plan} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">
                    {{ silver: t.plan_silver, gold: t.plan_gold, diamond: t.plan_diamond }[plan.plan]}
                  </h3>
                  {isCurrent && <Badge variant="secondary">{text.current}</Badge>}
                </div>
                <p className="mt-3 text-xl font-extrabold" dir="ltr">
                  {plan.monthly_price_iqd.toLocaleString(locale)} {text.perMonth}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.base_reply_limit.toLocaleString(locale)} {text.replies}
                </p>
                <div className="mt-4 space-y-2">
                  {providers
                    .filter((provider) => provider.provider !== 'disabled' && provider.provider !== 'unsupported')
                    .map((provider) => {
                      const key = `${plan.plan}:${provider.provider}`;
                      return (
                        <Button
                          key={provider.provider}
                          className="w-full"
                          variant={provider.checkout_available ? 'default' : 'outline'}
                          disabled={!provider.checkout_available || !canStartCycle || submitting !== null}
                          onClick={() => void beginCheckout(plan.plan, provider)}
                        >
                          {submitting === key
                            ? t.overview_loading
                            : `${text.choose} · ${provider.display_name}${
                                provider.status === 'merchant_setup_required'
                                  ? ` · ${text.merchantSetupRequired}`
                                  : ''
                              }`}
                        </Button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-bold">{text.recent}</h3>
          {ordersStatus === 'loading' && (
            <p className="text-sm text-muted-foreground" role="status">
              {t.overview_loading}
            </p>
          )}
          {ordersStatus === 'unavailable' && (
            <Alert className="border-orange-500/70" role="alert">
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{text.recentUnavailable}</span>
                <Button type="button" variant="outline" className="shrink-0" onClick={() => void load()}>
                  {text.retry}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {ordersStatus === 'ready' && orders.length === 0 && (
            <p className="text-sm text-muted-foreground">{text.recentEmpty}</p>
          )}
          {ordersStatus === 'ready' && orders.length > 0 &&
            orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>
                  {order.requested_plan.toUpperCase()} · {order.amount_iqd.toLocaleString(locale)} {COMMON_UI_LABELS.technical.currencyIqd}
                </span>
                <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                  {order.status === 'paid_reconciliation_required' ? text.reconciliation : order.status}
                </Badge>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
