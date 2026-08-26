import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';

type RangeKey = 'today' | '7d' | '30d' | 'all';

type ProductRow = {
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  net_units: number;
  net_revenue_minor: number;
};

type CurrencyReport = {
  currency_code: string;
  currency_fraction_digits: number;
  sale_count: number;
  active_sale_count: number;
  voided_sale_count: number;
  return_count: number;
  gross_revenue_minor: number;
  refunds_minor: number;
  net_revenue_minor: number;
  sold_units: number;
  returned_units: number;
  net_units: number;
  average_ticket_minor: number;
  profit_status: 'available' | 'partial' | 'unavailable';
  gross_profit_minor?: number;
  cost_known_net_units: number;
  cost_unknown_net_units: number;
  top_products: ProductRow[];
};

type Report = {
  sale_count: number;
  by_currency: CurrencyReport[];
};

type StaffReport = {
  staff_id: string | null;
  staff_name: string;
  report: Report;
};

type StationReport = {
  station_id: string | null;
  station_name: string;
  branch_key?: string;
  branch_label?: string;
  report: Report;
};

type CentralReportResult = {
  generated_at: string;
  sales_scanned: number;
  report: Report;
  by_staff: StaffReport[];
  by_station: StationReport[];
};

type MoneyValue = {
  code: string;
  digits: number;
  value: number | null;
};

type Copy = {
  title: string;
  subtitle: string;
  back: string;
  today: string;
  seven: string;
  thirty: string;
  all: string;
  loading: string;
  failed: string;
  empty: string;
  netSales: string;
  profit: string;
  operations: string;
  units: string;
  refunds: string;
  average: string;
  voided: string;
  returns: string;
  partialProfit: string;
  unavailableProfit: string;
  topProducts: string;
  noTop: string;
  byStaff: string;
  byStation: string;
  noGroupSales: string;
  sales: string;
  branch: string;
  generated: string;
  source: string;
};

const COPY: Record<Lang, Copy> = {
  ar: {
    title: 'تقرير الكاشير المركزي',
    subtitle: 'جميع مبيعات الكاشيرات والموظفين والمحطات من سجل PostgreSQL المركزي.',
    back: 'إدارة الكاشيرات',
    today: 'اليوم',
    seven: '7 أيام',
    thirty: '30 يوم',
    all: 'الكل',
    loading: 'جارٍ إعداد التقرير المركزي...',
    failed: 'تعذر تحميل تقرير الكاشير المركزي.',
    empty: 'لا توجد مبيعات كاشير ضمن هذه الفترة.',
    netSales: 'صافي المبيعات',
    profit: 'الربح الإجمالي',
    operations: 'عمليات البيع',
    units: 'صافي القطع',
    refunds: 'المرتجعات والإلغاءات',
    average: 'متوسط العملية',
    voided: 'ملغاة',
    returns: 'مرتجعات',
    partialProfit: 'الربح جزئي لأن تكلفة بعض الوحدات غير مسجلة.',
    unavailableProfit: 'الربح غير متاح لأن تكلفة الوحدات غير مسجلة. لن يفترض فوري أن التكلفة صفر.',
    topProducts: 'الأكثر مبيعًا',
    noTop: 'لا توجد منتجات صافية مباعة.',
    byStaff: 'حسب الموظف',
    byStation: 'حسب محطة الكاشير',
    noGroupSales: 'لا توجد مبيعات.',
    sales: 'مبيعات',
    branch: 'الفرع',
    generated: 'آخر تحديث',
    source: 'المصدر: سجل الكاشير المركزي الموثوق على السيرفر',
  },
  ku: {
    title: 'ڕاپۆرتی ناوەندی کاشێر',
    subtitle: 'هەموو فرۆشتنەکانی کاشێر و کارمەند و وێستگەکان لە تۆماری ناوەندی PostgreSQL.',
    back: 'بەڕێوەبردنی کاشێر',
    today: 'ئەمڕۆ',
    seven: '7 ڕۆژ',
    thirty: '30 ڕۆژ',
    all: 'هەموو',
    loading: 'ڕاپۆرتی ناوەندی ئامادە دەکرێت...',
    failed: 'بارکردنی ڕاپۆرتی ناوەندی کاشێر سەرکەوتوو نەبوو.',
    empty: 'لەو ماوەیەدا هیچ فرۆشتنی کاشێر نییە.',
    netSales: 'فرۆشتنی خاوێن',
    profit: 'قازانجی گشتی',
    operations: 'مامەڵەکانی فرۆشتن',
    units: 'دانەی خاوێن',
    refunds: 'گەڕاندنەوە و هەڵوەشاندنەوە',
    average: 'ناوەندی مامەڵە',
    voided: 'هەڵوەشاوە',
    returns: 'گەڕاندنەوە',
    partialProfit: 'قازانج بەشێکییە چونکە تێچووی هەندێک دانە تۆمار نەکراوە.',
    unavailableProfit: 'قازانج بەردەست نییە چونکە تێچووی دانەکان تۆمار نەکراوە. فەوری تێچوو بە سفر دانانێت.',
    topProducts: 'زۆرترین فرۆشراو',
    noTop: 'هیچ بەرهەمێکی خاوێن نەفرۆشراوە.',
    byStaff: 'بەپێی کارمەند',
    byStation: 'بەپێی وێستگەی کاشێر',
    noGroupSales: 'هیچ فرۆشتنێک نییە.',
    sales: 'فرۆشتن',
    branch: 'لق',
    generated: 'دوایین نوێکردنەوە',
    source: 'سەرچاوە: تۆماری ناوەندی متمانەپێکراوی کاشێر لە سێرڤەر',
  },
  en: {
    title: 'Central Cashier Report',
    subtitle: 'All cashier, employee and station sales from the central PostgreSQL record.',
    back: 'Cashier management',
    today: 'Today',
    seven: '7 days',
    thirty: '30 days',
    all: 'All',
    loading: 'Building central cashier report...',
    failed: 'Could not load the central cashier report.',
    empty: 'No cashier sales in this period.',
    netSales: 'Net sales',
    profit: 'Gross profit',
    operations: 'Sales operations',
    units: 'Net units',
    refunds: 'Returns & voids',
    average: 'Average ticket',
    voided: 'Voided',
    returns: 'Returns',
    partialProfit: 'Profit is partial because cost is missing for some units.',
    unavailableProfit: 'Profit is unavailable because unit cost is missing. Fawri will not assume missing cost is zero.',
    topProducts: 'Top products',
    noTop: 'No net product sales.',
    byStaff: 'By employee',
    byStation: 'By cashier station',
    noGroupSales: 'No sales.',
    sales: 'sales',
    branch: 'Branch',
    generated: 'Last updated',
    source: 'Source: trusted central cashier record on the server',
  },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function startOfLocalDay(daysBack: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return date;
}

function queryForRange(range: RangeKey): string {
  const params = new URLSearchParams();
  if (range === 'today') params.set('from', startOfLocalDay(0).toISOString());
  if (range === '7d') params.set('from', startOfLocalDay(6).toISOString());
  if (range === '30d') params.set('from', startOfLocalDay(29).toISOString());
  const query = params.toString();
  return query ? `?${query}` : '';
}

function parseResult(value: unknown): CentralReportResult {
  const raw = record(value);
  return {
    generated_at: String(raw.generated_at || ''),
    sales_scanned: Number(raw.sales_scanned || 0),
    report: raw.report as Report,
    by_staff: Array.isArray(raw.by_staff) ? raw.by_staff as StaffReport[] : [],
    by_station: Array.isArray(raw.by_station) ? raw.by_station as StationReport[] : [],
  };
}

function moneyValues(
  report: Report,
  field: 'net_revenue_minor' | 'refunds_minor' | 'average_ticket_minor',
): MoneyValue[] {
  return report.by_currency.map(currency => ({
    code: currency.currency_code,
    digits: currency.currency_fraction_digits,
    value: currency[field],
  }));
}

function profitValues(report: Report): MoneyValue[] {
  return report.by_currency.map(currency => ({
    code: currency.currency_code,
    digits: currency.currency_fraction_digits,
    value: currency.profit_status === 'unavailable'
      ? null
      : currency.gross_profit_minor ?? null,
  }));
}

function MoneyStack({ values, lang }: { values: MoneyValue[]; lang: Lang }) {
  if (values.length === 0) return <span>—</span>;
  return (
    <span className="flex flex-col gap-0.5" dir="ltr">
      {values.map(value => (
        <span key={`${value.code}:${value.digits}`}>
          {value.value === null
            ? `— ${value.code}`
            : formatMerchantMoneyMinor(value.value, value.code, value.digits, lang)}
        </span>
      ))}
    </span>
  );
}

function Metric({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="mt-2 text-xl font-extrabold">{children}</div>
    </div>
  );
}

function GroupCard({
  name,
  secondary,
  report,
  lang,
  labels,
}: {
  name: string;
  secondary?: string;
  report: Report;
  lang: Lang;
  labels: Copy;
}) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{name}</p>
          {secondary ? <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p> : null}
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
          {report.sale_count} {labels.sales}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{labels.netSales}</p>
          <div className="mt-1 text-sm font-bold">
            <MoneyStack values={moneyValues(report, 'net_revenue_minor')} lang={lang} />
          </div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{labels.profit}</p>
          <div className="mt-1 text-sm font-bold">
            <MoneyStack values={profitValues(report)} lang={lang} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CashierCentralReportsPage() {
  const { lang, dir } = useI18n();
  const labels = COPY[lang] || COPY.en;
  const [range, setRange] = useState<RangeKey>('today');
  const [result, setResult] = useState<CentralReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/cashier/management/report${queryForRange(range)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = record(await response.json().catch(() => null));
      if (!response.ok || payload.ok !== true) {
        throw new Error(String(payload.error || payload.code || labels.failed));
      }
      setResult(parseResult(payload));
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : labels.failed);
    } finally {
      setLoading(false);
    }
  }, [labels.failed, range]);

  useEffect(() => { void load(); }, [load]);

  const ranges = useMemo<Array<[RangeKey, string]>>(() => [
    ['today', labels.today],
    ['7d', labels.seven],
    ['30d', labels.thirty],
    ['all', labels.all],
  ], [labels]);

  const currencies = result?.report.by_currency || [];
  const hasSales = Boolean(result && result.report.sale_count > 0);
  const totalNet = result ? moneyValues(result.report, 'net_revenue_minor') : [];
  const totalRefunds = result ? moneyValues(result.report, 'refunds_minor') : [];
  const totalProfit = result ? profitValues(result.report) : [];
  const netUnits = currencies.reduce((sum, currency) => sum + currency.net_units, 0);
  const activeSales = currencies.reduce((sum, currency) => sum + currency.active_sale_count, 0);
  const voidedSales = currencies.reduce((sum, currency) => sum + currency.voided_sale_count, 0);
  const returnCount = currencies.reduce((sum, currency) => sum + currency.return_count, 0);

  return (
    <div className="space-y-5 pb-8" dir={dir}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{labels.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <Link href="/dashboard/cashiers" className="rounded-xl border bg-card px-4 py-2 text-sm font-bold hover:bg-accent">
          {labels.back}
        </Link>
      </header>

      <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-sm">
        {ranges.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRange(key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${range === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">{error}</div> : null}
      {loading ? <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">{labels.loading}</div> : null}
      {!loading && !error && result && !hasSales ? <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">{labels.empty}</div> : null}

      {!loading && !error && result && hasSales ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric title={labels.netSales}><MoneyStack values={totalNet} lang={lang} /></Metric>
            <Metric title={labels.profit}><MoneyStack values={totalProfit} lang={lang} /></Metric>
            <Metric title={labels.operations}><span dir="ltr">{activeSales}</span></Metric>
            <Metric title={labels.units}><span dir="ltr">{netUnits}</span></Metric>
            <Metric title={labels.refunds}><MoneyStack values={totalRefunds} lang={lang} /></Metric>
            <Metric title={labels.average}><MoneyStack values={moneyValues(result.report, 'average_ticket_minor')} lang={lang} /></Metric>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
            <span className="rounded-full border bg-card px-3 py-1.5">{labels.voided}: <b dir="ltr">{voidedSales}</b></span>
            <span className="rounded-full border bg-card px-3 py-1.5">{labels.returns}: <b dir="ltr">{returnCount}</b></span>
          </div>

          {currencies.map(currency => (
            <section key={`${currency.currency_code}:${currency.currency_fraction_digits}`} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold" dir="ltr">{currency.currency_code}</h2>
                <span className="text-xs text-muted-foreground">{currency.sale_count} {labels.sales}</span>
              </div>
              {currency.profit_status === 'partial' ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{labels.partialProfit}</div> : null}
              {currency.profit_status === 'unavailable' ? <div className="rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground">{labels.unavailableProfit}</div> : null}
              <div>
                <h3 className="font-bold">{labels.topProducts}</h3>
                {currency.top_products.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{labels.noTop}</p> : (
                  <div className="mt-2 divide-y rounded-xl border bg-background">
                    {currency.top_products.map((product, index) => (
                      <div key={`${product.product_id}:${product.variant_id || ''}`} className="flex items-center justify-between gap-4 px-3 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold"><span className="me-2 text-muted-foreground">#{index + 1}</span>{product.product_name}</p>
                          {product.variant_name ? <p className="text-xs text-muted-foreground">{product.variant_name}</p> : null}
                        </div>
                        <div className="shrink-0 text-end text-sm">
                          <p className="font-bold" dir="ltr">{product.net_units}</p>
                          <p className="text-xs text-muted-foreground" dir="ltr">{formatMerchantMoneyMinor(product.net_revenue_minor, currency.currency_code, currency.currency_fraction_digits, lang)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.byStaff}</h2><span className="text-sm text-muted-foreground">{result.by_staff.length}</span></div>
              <div className="space-y-2">
                {result.by_staff.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.by_staff.map(group => (
                  <GroupCard key={group.staff_id || '__legacy_staff__'} name={group.staff_name} report={group.report} lang={lang} labels={labels} />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.byStation}</h2><span className="text-sm text-muted-foreground">{result.by_station.length}</span></div>
              <div className="space-y-2">
                {result.by_station.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.by_station.map(group => (
                  <GroupCard
                    key={group.station_id || '__legacy_station__'}
                    name={group.station_name}
                    secondary={group.branch_label || (group.branch_key ? `${labels.branch}: ${group.branch_key}` : undefined)}
                    report={group.report}
                    lang={lang}
                    labels={labels}
                  />
                ))}
              </div>
            </section>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {labels.source} · {labels.generated}: <span dir="ltr">{new Date(result.generated_at).toLocaleString()}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}
