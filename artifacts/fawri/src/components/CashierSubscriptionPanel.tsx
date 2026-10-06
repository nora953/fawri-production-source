import React from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { CASHIER_SUBSCRIPTION_PANEL_COPY } from '@/lib/translations/features/components/CashierSubscriptionPanel';

type EntitlementState = 'inactive' | 'active' | 'grace' | 'restricted' | 'suspended';

type CashierEntitlement = {
  subscription_id?: string;
  merchant_id?: string;
  state: EntitlementState;
  licensed_seats: number;
  price_per_seat_iqd?: number;
  billing_period_start?: string;
  billing_period_end?: string;
  grace_until?: string;
  scheduled_licensed_seats?: number;
  scheduled_change_at?: string;
  version?: number;
  server_time: string;
};

type LicensedStation = {
  station_id: string;
  station_name: string;
  station_status: string;
  assignment_status: 'active' | 'release_scheduled';
  release_effective_at?: string;
};

type ProviderState = {
  provider: string;
  display_name?: string;
  checkout_available?: boolean;
  production_ready?: boolean;
  test_only?: boolean;
  status?: string;
};

type Catalog = {
  currency: 'IQD';
  seat_price_iqd: number;
  grace_seconds: number;
  provider: ProviderState;
};

type BillingOrder = {
  id: string;
  operation: 'activate' | 'renew' | 'add_seats';
  current_seats: number;
  requested_seats: number;
  resulting_seats: number;
  unit_price_iqd: number;
  amount_iqd: number;
  currency: 'IQD';
  billing_period_end: string;
  status: string;
  created_at: string;
};

type Quote = {
  operation: 'activate' | 'renew' | 'add_seats';
  current_seats: number;
  requested_seats: number;
  resulting_seats: number;
  unit_price_iqd: number;
  amount_iqd: number;
  currency: 'IQD';
  billing_period_start: string;
  billing_period_end: string;
  subscription_version: number;
  next_full_renewal_amount_iqd: number;
  quoted_at: string;
};

type SubscriptionPayload = {
  entitlement: CashierEntitlement;
  licensed_stations: LicensedStation[];
};



function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

async function jsonApi(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true) {
    const error = new Error(String(payload.error || 'Cashier billing request failed'));
    (error as Error & { code?: string }).code = String(payload.code || '');
    throw error;
  }
  return payload;
}

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cashier-billing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusTone(state: EntitlementState) {
  if (state === 'active') return 'border-emerald-300 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100';
  if (state === 'grace') return 'border-amber-300 bg-amber-50/70 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100';
  if (state === 'restricted' || state === 'suspended') return 'border-red-300 bg-red-50/70 text-red-950 dark:bg-red-950/20 dark:text-red-100';
  return 'border-slate-300 bg-slate-50/70 text-slate-900 dark:bg-slate-950/20 dark:text-slate-100';
}

export function CashierSubscriptionPanel() {
  const { lang } = useI18n();
  const text = CASHIER_SUBSCRIPTION_PANEL_COPY[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';

  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [subscription, setSubscription] = React.useState<SubscriptionPayload | null>(null);
  const [orders, setOrders] = React.useState<BillingOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [requestedSeats, setRequestedSeats] = React.useState(1);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [downgradeTarget, setDowngradeTarget] = React.useState(1);
  const [keepStations, setKeepStations] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [catalogPayload, subscriptionPayload, ordersPayload] = await Promise.all([
        jsonApi('/api/cashier/subscription/catalog'),
        jsonApi('/api/cashier/subscription'),
        jsonApi('/api/cashier/billing/orders'),
      ]);

      const entitlement = record(subscriptionPayload.entitlement) as CashierEntitlement;
      const licensedStations = Array.isArray(subscriptionPayload.licensed_stations)
        ? subscriptionPayload.licensed_stations as LicensedStation[]
        : [];
      setCatalog({
        currency: 'IQD',
        seat_price_iqd: integer(catalogPayload.seat_price_iqd),
        grace_seconds: integer(catalogPayload.grace_seconds),
        provider: record(catalogPayload.provider) as ProviderState,
      });
      setSubscription({ entitlement, licensed_stations: licensedStations });
      setOrders(Array.isArray(ordersPayload.orders) ? ordersPayload.orders as BillingOrder[] : []);
      const current = Math.max(1, integer(entitlement.licensed_seats, 0));
      setRequestedSeats(entitlement.state === 'active' ? current + 1 : current);
      setDowngradeTarget(Math.max(1, current - 1));
      setQuote(null);
      setKeepStations(new Set(
        licensedStations
          .filter((station) => station.assignment_status === 'active')
          .map((station) => station.station_id),
      ));
    } catch {
      setFailed(true);
      setCatalog(null);
      setSubscription(null);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const entitlement = subscription?.entitlement;
  const state = entitlement?.state || 'inactive';
  const stateLabel = text[state];
  const canCheckout = catalog?.provider?.checkout_available === true;
  const configuredPrice = catalog?.seat_price_iqd || entitlement?.price_per_seat_iqd || 0;

  const operation: Quote['operation'] =
    state === 'inactive'
      ? 'activate'
      : state === 'grace' || state === 'restricted'
        ? 'renew'
        : 'add_seats';

  const quoteSeats =
    operation === 'renew'
      ? entitlement?.scheduled_licensed_seats || entitlement?.licensed_seats || 1
      : requestedSeats;

  const requestQuote = async () => {
    setBusy(true);
    try {
      const payload = await jsonApi('/api/cashier/billing/quote', {
        method: 'POST',
        body: JSON.stringify({
          operation,
          requested_seats: quoteSeats,
        }),
      });
      setQuote(record(payload.quote) as Quote);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const startCheckout = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      const payload = await jsonApi('/api/cashier/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({
          operation: quote.operation,
          requested_seats: quote.requested_seats,
          idempotency_key: makeIdempotencyKey(),
        }),
      });
      const checkout = record(payload.checkout);
      toast.success(text.paymentStarted);
      const redirectUrl = String(checkout.redirect_url || '').trim();
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }
      toast.info(text.paidTestHint);
      setQuote(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const scheduleDowngrade = async () => {
    if (!entitlement || state !== 'active') return;
    const activeAssigned = (subscription?.licensed_stations || [])
      .filter((station) => station.assignment_status === 'active');
    const requiredKeepCount = Math.min(downgradeTarget, activeAssigned.length);
    const selected = activeAssigned
      .filter((station) => keepStations.has(station.station_id))
      .map((station) => station.station_id)
      .slice(0, requiredKeepCount);
    if (selected.length !== requiredKeepCount) {
      toast.error(text.keepStations);
      return;
    }

    setBusy(true);
    try {
      await jsonApi('/api/cashier/subscription/downgrade', {
        method: 'POST',
        body: JSON.stringify({
          target_seats: downgradeTarget,
          keep_station_ids: selected,
          expected_version: entitlement.version,
        }),
      });
      toast.success(text.downgradeScheduled);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.unavailable);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>{text.title}</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">{text.loading}</p></CardContent>
      </Card>
    );
  }

  if (failed || !catalog || !subscription || !entitlement) {
    return (
      <Card>
        <CardHeader><CardTitle>{text.title}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">{text.unavailable}</p>
          <Button type="button" variant="outline" onClick={() => void load()}>{text.retry}</Button>
        </CardContent>
      </Card>
    );
  }

  const activeAssigned = subscription.licensed_stations.filter(
    (station) => station.assignment_status === 'active',
  );
  const requiredKeepCount = Math.min(downgradeTarget, activeAssigned.length);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{text.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{text.subtitle}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(state)}`}>
            {stateLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {state === 'grace' ? (
          <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{text.graceWarning}</p>
          </div>
        ) : null}
        {state === 'restricted' ? (
          <div className="flex gap-3 rounded-xl border border-red-300 bg-red-50/70 p-4 text-sm text-red-950 dark:bg-red-950/20 dark:text-red-100">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{text.restrictedWarning}</p>
          </div>
        ) : null}
        {state === 'suspended' ? (
          <div className="flex gap-3 rounded-xl border border-red-300 bg-red-50/70 p-4 text-sm text-red-950 dark:bg-red-950/20 dark:text-red-100">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{text.suspendedWarning}</p>
          </div>
        ) : null}
        {state === 'inactive' ? (
          <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{text.inactiveHint}</p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{text.seats}</p>
            <p className="mt-1 text-xl font-black">{entitlement.licensed_seats}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{text.seatPrice}</p>
            <p className="mt-1 text-xl font-black">{configuredPrice.toLocaleString(locale)} {text.currencyIqd}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{text.renewalDate}</p>
            <p className="mt-1 text-sm font-bold">{formatDate(entitlement.billing_period_end, locale)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{text.graceEnds}</p>
            <p className="mt-1 text-sm font-bold">{formatDate(entitlement.grace_until, locale)}</p>
          </div>
        </div>

        {entitlement.scheduled_licensed_seats !== undefined ? (
          <div className="rounded-xl border border-blue-300 bg-blue-50/60 p-3 text-sm dark:bg-blue-950/20">
            <strong>{text.scheduledSeats}: </strong>
            {entitlement.scheduled_licensed_seats}
          </div>
        ) : null}

        {state !== 'suspended' ? (
          <section className="space-y-3 rounded-xl border p-4">
            <h3 className="font-bold">
              {operation === 'activate' ? text.activate : operation === 'renew' ? text.renew : text.addSeats}
            </h3>
            {operation !== 'renew' ? (
              <label className="block text-sm font-semibold">
                {text.requestedSeats}
                <input
                  type="number"
                  min={operation === 'add_seats' ? entitlement.licensed_seats + 1 : 1}
                  step={1}
                  value={requestedSeats}
                  onChange={(event) => {
                    setRequestedSeats(Math.max(1, Number(event.target.value) || 1));
                    setQuote(null);
                  }}
                  className="mt-1.5 h-11 w-full max-w-xs rounded-lg border bg-background px-3"
                  dir="ltr"
                />
              </label>
            ) : null}
            <Button type="button" onClick={() => void requestQuote()} disabled={busy}>
              {text.quote}
            </Button>

            {quote ? (
              <div className="space-y-3 rounded-xl border bg-muted/25 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{text.dueNow}</p>
                    <p className="font-black">{quote.amount_iqd.toLocaleString(locale)} {text.currencyIqd}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{text.periodEnd}</p>
                    <p className="font-bold">{formatDate(quote.billing_period_end, locale)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{text.nextRenewal}</p>
                    <p className="font-black">{quote.next_full_renewal_amount_iqd.toLocaleString(locale)} {text.currencyIqd}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{text.exactServerAmount}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void startCheckout()} disabled={busy || !canCheckout}>
                    <CreditCard className="me-2 h-4 w-4" />
                    {text.confirmPayment}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setQuote(null)} disabled={busy}>
                    {text.cancelQuote}
                  </Button>
                </div>
                {!canCheckout ? <p className="text-xs font-semibold text-destructive">{text.providerUnavailable}</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {state === 'active' && entitlement.licensed_seats > 1 ? (
          <section className="space-y-3 rounded-xl border p-4">
            <h3 className="font-bold">{text.downgrade}</h3>
            <label className="block text-sm font-semibold">
              {text.downgradeTarget}
              <input
                type="number"
                min={1}
                max={Math.max(1, entitlement.licensed_seats - 1)}
                value={downgradeTarget}
                onChange={(event) => {
                  const target = Math.min(
                    Math.max(1, Number(event.target.value) || 1),
                    entitlement.licensed_seats - 1,
                  );
                  setDowngradeTarget(target);
                }}
                className="mt-1.5 h-11 w-full max-w-xs rounded-lg border bg-background px-3"
                dir="ltr"
              />
            </label>

            {requiredKeepCount > 0 ? (
              <div>
                <p className="text-sm font-semibold">{text.keepStations}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {activeAssigned.map((station) => (
                    <label key={station.station_id} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={keepStations.has(station.station_id)}
                        onChange={(event) => {
                          setKeepStations((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(station.station_id);
                            else next.delete(station.station_id);
                            return next;
                          });
                        }}
                      />
                      <span className="font-semibold">{station.station_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <Button type="button" variant="outline" onClick={() => void scheduleDowngrade()} disabled={busy}>
              {text.applyDowngrade}
            </Button>
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground">{text.seatLimitHint}</p>

        <section className="space-y-2">
          <h3 className="font-bold">{text.pendingOrders}</h3>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{text.noOrders}</p>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <span className="font-semibold">{order.operation} · {order.resulting_seats} {text.seatUnit}</span>
                  <span>{order.amount_iqd.toLocaleString(locale)} {text.currencyIqd} · {order.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
