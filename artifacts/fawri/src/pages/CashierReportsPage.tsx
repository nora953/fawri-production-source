import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { CASHIER_REPORTS_COPY as COPY } from '@/lib/translations/features/pages/CashierReportsPage';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import { subscribeCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';
import {
  isCashierOperatorSessionEnded,
  publishCashierOperatorSessionInvalidated,
} from '@/lib/cashierOperatorSessionUi';
import {
  createCashierOperatorReportsRuntime,
  type CashierOperatorReportRuntimeResult,
  type CashierOperatorReportsRuntime,
} from '@/lib/cashierOperatorReportsRuntime';

type RangeKey = 'today' | '7d' | '30d' | 'all';

function startOfLocalDay(daysBack: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return date;
}

function rangeOptions(key: RangeKey) {
  if (key === 'today') return { from: startOfLocalDay(0) };
  if (key === '7d') return { from: startOfLocalDay(6) };
  if (key === '30d') return { from: startOfLocalDay(29) };
  return {};
}

export default function CashierReportsPage() {
  const { lang, dir } = useI18n();
  const labels = COPY[lang] || COPY.en;
  const [runtime, setRuntime] = useState<CashierOperatorReportsRuntime | null>(null);
  const [range, setRange] = useState<RangeKey>('today');
  const [result, setResult] = useState<CashierOperatorReportRuntimeResult | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    let stopped = false;
    let active: CashierOperatorReportsRuntime | null = null;
    void createCashierOperatorReportsRuntime()
      .then(created => {
        active = created;
        if (!stopped) setRuntime(created);
      })
      .catch(cause => {
        if (stopped) return;
        if (isCashierOperatorSessionEnded(cause)) {
          publishCashierOperatorSessionInvalidated();
          return;
        }
        setError(labels.loadFailed);
        setLoading(false);
      });
    return () => {
      stopped = true;
      if (active) void active.close().catch(() => undefined);
    };
  }, [labels.loadFailed]);

  const refresh = useCallback(async () => {
    if (!runtime) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const next = await runtime.buildReport(rangeOptions(range));
      if (requestId !== requestSequence.current) return;
      setResult(next);
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setResult(null);
      if (isCashierOperatorSessionEnded(cause)) {
        publishCashierOperatorSessionInvalidated();
        return;
      }
      setError(labels.loadFailed);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [labels.loadFailed, range, runtime]);

  useEffect(() => {
    if (runtime) void refresh();
  }, [refresh, runtime]);

  useEffect(() => {
    const handleConnectivityChange = () => {
      setOnline(navigator.onLine);
      if (runtime) void refresh();
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    const unsubscribeRefresh = subscribeCashierDashboardRefresh(() => {
      if (runtime) void refresh();
    });
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
      unsubscribeRefresh();
      requestSequence.current += 1;
    };
  }, [refresh, runtime]);

  const ranges: Array<[RangeKey, string]> = useMemo(() => [
    ['today', labels.today],
    ['7d', labels.seven],
    ['30d', labels.thirty],
    ['all', labels.all],
  ], [labels]);

  const hasData = Boolean(result && result.report.by_currency.length > 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900" dir={dir}>
      <div className="mx-auto max-w-[1500px] p-3 lg:p-4">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold">{labels.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
            </div>
            <span className={`inline-flex h-8 items-center justify-center rounded-[0.625rem] border px-3 text-xs font-bold shadow-sm ${online ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-700'}`}>
              {online ? labels.online : labels.offline}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a href="/cashier.html?history=1" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50">{labels.history}</a>
            <a href="/cashier.html" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50">{labels.back}</a>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {ranges.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setRange(key)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${range === key ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>

        {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{labels.loading}</div> : null}

        {!loading && !error && result && !hasData ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{labels.empty}</div>
        ) : null}

        {!loading && !error && result && hasData ? (
          <div className="space-y-5">
            {result.report.by_currency.map(currency => {
              const money = (value: number) => formatMerchantMoneyMinor(value, currency.currency_code, currency.currency_fraction_digits, lang);
              const profit = currency.profit_status === 'unavailable' ? null : currency.gross_profit_minor ?? null;
              const average = currency.sale_count > 0 ? money(currency.average_ticket_minor) : '—';
              return (
                <section key={`${currency.currency_code}:${currency.currency_fraction_digits}`} className="space-y-4">
                  <div className={`grid gap-3 sm:grid-cols-2 ${result.can_view_profit ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
                    <Metric title={labels.netSales} value={money(currency.net_revenue_minor)} />
                    {result.can_view_profit ? <Metric title={labels.profit} value={profit === null ? '—' : money(profit)} /> : null}
                    <Metric title={labels.operations} value={String(currency.sale_count)} />
                    <Metric title={labels.units} value={String(currency.net_units)} />
                    <Metric
                      title={labels.refunds}
                      value={money(currency.refunds_minor)}
                      meta={(
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                          <span>{labels.returns}: <bdi dir="ltr" className="font-bold text-slate-700">{currency.return_count}</bdi></span>
                          <span>{labels.voids}: <bdi dir="ltr" className="font-bold text-slate-700">{currency.voided_sale_count}</bdi></span>
                        </div>
                      )}
                    />
                    <Metric title={labels.average} value={average} />
                  </div>

                  {result.can_view_profit && currency.profit_status === 'partial' ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{labels.partialProfit}</div>
                  ) : null}
                  {result.can_view_profit && currency.profit_status === 'unavailable' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{labels.unavailableProfit}</div>
                  ) : null}

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-4 py-3"><h2 className="font-bold">{labels.topProducts}</h2></div>
                    {currency.top_products.length === 0 ? (
                      <p className="p-5 text-sm text-slate-500">{labels.noTop}</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {currency.top_products.map((product, index) => (
                          <div key={`${product.product_id}:${product.variant_id || ''}`} className="flex items-center justify-between gap-4 px-4 py-3">
                            <div className="min-w-0">
                              <p className="flex min-w-0 items-baseline gap-2 font-bold">
                                <span className="shrink-0 text-slate-400" dir="ltr">#{index + 1}</span>
                                <bdi dir="auto" className="min-w-0 break-words">{product.product_name}</bdi>
                              </p>
                              {product.variant_name ? <p className="mt-0.5 text-xs text-slate-500"><bdi dir="auto">{product.variant_name}</bdi></p> : null}
                            </div>
                            <div className="shrink-0 text-end">
                              <p className="font-bold">{product.net_units} {labels.sold}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{labels.revenue}: <bdi dir="ltr">{money(product.net_revenue_minor)}</bdi></p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
            <p className="text-center text-xs text-slate-400">
              {result.source === 'server_cashier' ? labels.serverSource : labels.localSource}
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ title, value, meta }: { title: string; value: string; meta?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-2 truncate text-xl font-extrabold"><bdi dir="ltr">{value}</bdi></p>
      {meta ? <div className="mt-2 border-t border-slate-100 pt-2">{meta}</div> : null}
    </div>
  );
}
