import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import {
  createCashierReportsRuntime,
  type CashierReportRuntimeResult,
  type CashierReportsRuntime,
} from '@/lib/cashierReportsRuntime';

type RangeKey = 'today' | '7d' | '30d' | 'all';

const COPY: Record<Lang, {
  title: string;
  subtitle: string;
  back: string;
  history: string;
  today: string;
  seven: string;
  thirty: string;
  all: string;
  loading: string;
  empty: string;
  loadFailed: string;
  netSales: string;
  profit: string;
  operations: string;
  units: string;
  refunds: string;
  average: string;
  topProducts: string;
  noTop: string;
  sold: string;
  revenue: string;
  partialProfit: string;
  unavailableProfit: string;
  localSource: string;
}> = {
  ar: {
    title: 'تقارير المبيعات والأرباح',
    subtitle: 'تقارير مبنية على عمليات الكاشير الفعلية والمرتجعات والإلغاءات.',
    back: 'العودة للكاشير',
    history: 'سجل المبيعات',
    today: 'اليوم',
    seven: '7 أيام',
    thirty: '30 يوم',
    all: 'الكل',
    loading: 'جارٍ حساب التقرير...',
    empty: 'لا توجد مبيعات ضمن هذه الفترة.',
    loadFailed: 'تعذر قراءة تقرير الكاشير على هذا الجهاز.',
    netSales: 'صافي المبيعات',
    profit: 'الربح الإجمالي',
    operations: 'عمليات البيع',
    units: 'صافي القطع المباعة',
    refunds: 'المرتجعات والإلغاءات',
    average: 'متوسط العملية',
    topProducts: 'الأكثر مبيعًا',
    noTop: 'لا توجد منتجات مباعة في هذه الفترة.',
    sold: 'قطعة',
    revenue: 'صافي المبيعات',
    partialProfit: 'الربح الظاهر جزئي لأن تكلفة بعض القطع غير مسجلة.',
    unavailableProfit: 'أدخل تكلفة المنتجات لعرض الربح. لن يفترض فوري أن التكلفة صفر.',
    localSource: 'المصدر: سجل الكاشير المحلي الموثوق',
  },
  ku: {
    title: 'ڕاپۆرتی فرۆشتن و قازانج',
    subtitle: 'ڕاپۆرتەکان لە فرۆشتن و گەڕاندنەوە و هەڵوەشاندنەوەی ڕاستەقینەی کاشێر دروست دەبن.',
    back: 'گەڕانەوە بۆ کاشێر',
    history: 'تۆماری فرۆشتن',
    today: 'ئەمڕۆ',
    seven: '7 ڕۆژ',
    thirty: '30 ڕۆژ',
    all: 'هەموو',
    loading: 'ڕاپۆرت هەژمار دەکرێت...',
    empty: 'لەو ماوەیەدا هیچ فرۆشتنێک نییە.',
    loadFailed: 'خوێندنەوەی ڕاپۆرتی کاشێر لەم ئامێرە سەرکەوتوو نەبوو.',
    netSales: 'فرۆشتنی خاوێن',
    profit: 'قازانجی گشتی',
    operations: 'مامەڵەکانی فرۆشتن',
    units: 'دانەی فرۆشراوی خاوێن',
    refunds: 'گەڕاندنەوە و هەڵوەشاندنەوە',
    average: 'ناوەندی مامەڵە',
    topProducts: 'زۆرترین فرۆشراو',
    noTop: 'لەو ماوەیەدا هیچ بەرهەمێک نەفرۆشراوە.',
    sold: 'دانە',
    revenue: 'فرۆشتنی خاوێن',
    partialProfit: 'قازانجی پیشاندراو بەشێکییە چونکە تێچووی هەندێک دانە تۆمار نەکراوە.',
    unavailableProfit: 'تێچووی بەرهەمەکان داخڵ بکە بۆ پیشاندانی قازانج. فەوری تێچوو بە سفر دانانێت.',
    localSource: 'سەرچاوە: تۆماری متمانەپێکراوی کاشێری ناوخۆیی',
  },
  en: {
    title: 'Sales & Profit Reports',
    subtitle: 'Reports derived from actual cashier sales, returns, and voids.',
    back: 'Back to cashier',
    history: 'Sales history',
    today: 'Today',
    seven: '7 days',
    thirty: '30 days',
    all: 'All',
    loading: 'Calculating report...',
    empty: 'No sales in this period.',
    loadFailed: 'Could not read the cashier report on this device.',
    netSales: 'Net sales',
    profit: 'Gross profit',
    operations: 'Sales operations',
    units: 'Net units sold',
    refunds: 'Returns & voids',
    average: 'Average ticket',
    topProducts: 'Top products',
    noTop: 'No products were sold in this period.',
    sold: 'units',
    revenue: 'Net sales',
    partialProfit: 'Shown profit is partial because cost is missing for some units.',
    unavailableProfit: 'Enter product costs to show profit. Fawri will not assume missing cost is zero.',
    localSource: 'Source: trusted local cashier sale history',
  },
};

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
  const [runtime, setRuntime] = useState<CashierReportsRuntime | null>(null);
  const [range, setRange] = useState<RangeKey>('today');
  const [result, setResult] = useState<CashierReportRuntimeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    let active: CashierReportsRuntime | null = null;
    void createCashierReportsRuntime()
      .then(created => {
        active = created;
        if (!stopped) setRuntime(created);
      })
      .catch(() => {
        if (!stopped) {
          setError(labels.loadFailed);
          setLoading(false);
        }
      });
    return () => {
      stopped = true;
      if (active) void active.close().catch(() => undefined);
    };
  }, [labels.loadFailed]);

  const refresh = useCallback(async () => {
    if (!runtime) return;
    setLoading(true);
    setError('');
    try {
      setResult(await runtime.buildReport(rangeOptions(range)));
    } catch {
      setResult(null);
      setError(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed, range, runtime]);

  useEffect(() => {
    if (runtime) void refresh();
  }, [refresh, runtime]);

  const ranges: Array<[RangeKey, string]> = useMemo(() => [
    ['today', labels.today],
    ['7d', labels.seven],
    ['30d', labels.thirty],
    ['all', labels.all],
  ], [labels]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900" dir={dir}>
      <div className="mx-auto max-w-[1450px] p-3 lg:p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold">{labels.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a href="/cashier.html?history=1" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50">{labels.history}</a>
            <a href="/cashier.html" className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white transition hover:bg-slate-800">{labels.back}</a>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {ranges.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${range === key ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{labels.loading}</div> : null}

        {!loading && !error && result && result.report.sale_count === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{labels.empty}</div>
        ) : null}

        {!loading && !error && result && result.report.sale_count > 0 ? (
          <div className="space-y-5">
            {result.report.by_currency.map(currency => {
              const money = (value: number) => formatMerchantMoneyMinor(value, currency.currency_code, currency.currency_fraction_digits, lang);
              const profit = currency.profit_status === 'unavailable'
                ? null
                : currency.gross_profit_minor ?? 0;
              return (
                <section key={`${currency.currency_code}:${currency.currency_fraction_digits}`} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <Metric title={labels.netSales} value={money(currency.net_revenue_minor)} />
                    <Metric title={labels.profit} value={profit === null ? '—' : money(profit)} />
                    <Metric title={labels.operations} value={String(currency.active_sale_count)} />
                    <Metric title={labels.units} value={String(currency.net_units)} />
                    <Metric title={labels.refunds} value={money(currency.refunds_minor)} />
                    <Metric title={labels.average} value={money(currency.average_ticket_minor)} />
                  </div>

                  {currency.profit_status === 'partial' ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{labels.partialProfit}</div>
                  ) : null}
                  {currency.profit_status === 'unavailable' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{labels.unavailableProfit}</div>
                  ) : null}

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <h2 className="font-bold">{labels.topProducts}</h2>
                    </div>
                    {currency.top_products.length === 0 ? (
                      <p className="p-5 text-sm text-slate-500">{labels.noTop}</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {currency.top_products.map((product, index) => (
                          <div key={`${product.product_id}:${product.variant_id || ''}`} className="flex items-center justify-between gap-4 px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-bold"><span className="me-2 text-slate-400">#{index + 1}</span>{product.product_name}</p>
                              {product.variant_name ? <p className="mt-0.5 text-xs text-slate-500">{product.variant_name}</p> : null}
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
            <p className="text-center text-xs text-slate-400">{labels.localSource}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-2 truncate text-xl font-extrabold" dir="ltr">{value}</p>
    </div>
  );
}
