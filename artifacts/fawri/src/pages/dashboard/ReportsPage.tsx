import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import CashierCentralReportsPage from './CashierCentralReportsPage';

type RangeKey = 'today' | '7d' | '30d' | 'all';

type OnlineChannel = {
  source_channel: string;
  order_count: number;
  active_order_count: number;
  delivered_order_count: number;
  delivered_sales_iqd: number;
};

type OnlineLocation = {
  location_id: string | null;
  location_name: string;
  delivered_order_count: number;
  delivered_sales_iqd: number;
};

type OnlineProduct = {
  product_id?: string;
  product_name: string;
  units: number;
  revenue_iqd: number;
};

type OnlineReport = {
  generated_at: string;
  received_order_count: number;
  active_order_count: number;
  delivered_order_count: number;
  cancelled_order_count: number;
  delivered_sales_iqd: number;
  average_delivered_order_iqd: number;
  paid_electronic_count: number;
  by_channel: OnlineChannel[];
  by_location: OnlineLocation[];
  top_products: OnlineProduct[];
};

type CashierCurrency = {
  currency_code: string;
  currency_fraction_digits: number;
  net_revenue_minor: number;
};

type CashierReport = {
  generated_at: string;
  report: {
    by_currency: CashierCurrency[];
  };
};

type Copy = {
  reports: string;
  subtitle: string;
  cashier: string;
  online: string;
  combined: string;
  today: string;
  seven: string;
  thirty: string;
  all: string;
  loading: string;
  failed: string;
  receivedOrders: string;
  activeOrders: string;
  deliveredOrders: string;
  cancelledOrders: string;
  deliveredSales: string;
  averageDelivered: string;
  paidElectronic: string;
  byChannel: string;
  byLocation: string;
  topProducts: string;
  noData: string;
  orders: string;
  delivered: string;
  units: string;
  sourceNote: string;
  combinedSales: string;
  cashierNetSales: string;
  onlineDeliveredSales: string;
  currency: string;
  combinedNote: string;
  generated: string;
};

const COPY: Record<Lang, Copy> = {
  ar: {
    reports: 'التقارير',
    subtitle: 'تقارير الكاشير والطلبات الإلكترونية مع عرض شامل يفصل مصدر كل رقم.',
    cashier: 'تقارير الكاشير',
    online: 'تقارير الطلبات الإلكترونية',
    combined: 'التقرير الشامل',
    today: 'اليوم',
    seven: '7 أيام',
    thirty: '30 يوم',
    all: 'الكل',
    loading: 'جارٍ إعداد التقرير...',
    failed: 'تعذر تحميل التقرير.',
    receivedOrders: 'الطلبات المستلمة',
    activeOrders: 'الطلبات النشطة',
    deliveredOrders: 'الطلبات المسلّمة',
    cancelledOrders: 'الطلبات الملغاة',
    deliveredSales: 'قيمة المبيعات المسلّمة',
    averageDelivered: 'متوسط الطلب المسلّم',
    paidElectronic: 'دفعات إلكترونية مؤكدة',
    byChannel: 'حسب القناة',
    byLocation: 'المبيعات المسلّمة حسب الموقع',
    topProducts: 'الأكثر مبيعًا إلكترونيًا',
    noData: 'لا توجد بيانات ضمن هذه الفترة.',
    orders: 'طلبات',
    delivered: 'مسلّمة',
    units: 'قطعة',
    sourceNote: 'الطلبات المستلمة تُحسب بتاريخ إنشاء الطلب، والمبيعات المسلّمة بتاريخ التسليم، والإلغاءات بتاريخ الإلغاء. طلبات الكاشير مستبعدة من هذا التقرير.',
    combinedSales: 'إجمالي قيمة المبيعات المعروفة',
    cashierNetSales: 'صافي مبيعات الكاشير',
    onlineDeliveredSales: 'مبيعات إلكترونية مسلّمة',
    currency: 'العملة',
    combinedNote: 'يجمع هذا العرض صافي مبيعات الكاشير بعد الإرجاعات والإلغاءات مع قيمة الطلبات الإلكترونية المسلّمة. لا يتم تحويل العملات أو دمج عملتين مختلفتين.',
    generated: 'آخر تحديث',
  },
  ku: {
    reports: 'ڕاپۆرتەکان',
    subtitle: 'ڕاپۆرتی کاشێر و داواکارییە ئۆنلاینەکان لەگەڵ پیشاندانی گشتی کە سەرچاوەی هەر ژمارەیەک جیا دەکاتەوە.',
    cashier: 'ڕاپۆرتی کاشێر',
    online: 'ڕاپۆرتی داواکاری ئۆنلاین',
    combined: 'ڕاپۆرتی گشتی',
    today: 'ئەمڕۆ',
    seven: '7 ڕۆژ',
    thirty: '30 ڕۆژ',
    all: 'هەموو',
    loading: 'ڕاپۆرت ئامادە دەکرێت...',
    failed: 'بارکردنی ڕاپۆرت سەرکەوتوو نەبوو.',
    receivedOrders: 'داواکاری وەرگیراو',
    activeOrders: 'داواکاری چالاک',
    deliveredOrders: 'داواکاری گەیەنراو',
    cancelledOrders: 'داواکاری هەڵوەشێنراو',
    deliveredSales: 'بەهای فرۆشتنی گەیەنراو',
    averageDelivered: 'تێکڕای داواکاری گەیەنراو',
    paidElectronic: 'پارەدانی ئەلیکترۆنی پشتڕاستکراو',
    byChannel: 'بەپێی کەناڵ',
    byLocation: 'فرۆشتنی گەیەنراو بەپێی شوێن',
    topProducts: 'زۆرترین فرۆشراوی ئۆنلاین',
    noData: 'لەو ماوەیەدا داتا نییە.',
    orders: 'داواکاری',
    delivered: 'گەیەنراو',
    units: 'دانە',
    sourceNote: 'داواکاری وەرگیراو بە کاتی دروستکردن، فرۆشتنی گەیەنراو بە کاتی گەیاندن و هەڵوەشاندنەوە بە کاتی هەڵوەشاندنەوە هەژمار دەکرێت. داواکاری کاشێر لەم ڕاپۆرتەدا نییە.',
    combinedSales: 'کۆی بەهای فرۆشتنی ناسراو',
    cashierNetSales: 'فرۆشتنی خاوێنی کاشێر',
    onlineDeliveredSales: 'فرۆشتنی ئۆنلاین گەیەنراو',
    currency: 'دراو',
    combinedNote: 'ئەم پیشاندانە فرۆشتنی خاوێنی کاشێر دوای گەڕاندنەوە و هەڵوەشاندنەوە لەگەڵ بەهای داواکاری ئۆنلاینە گەیەنراوەکان کۆدەکاتەوە. دراوە جیاوازەکان ناگۆڕدرێن و تێکەڵ ناکرێن.',
    generated: 'دوایین نوێکردنەوە',
  },
  en: {
    reports: 'Reports',
    subtitle: 'Cashier and online-order reporting with a combined view that keeps every figure attributable to its source.',
    cashier: 'Cashier Reports',
    online: 'Online Order Reports',
    combined: 'Combined Report',
    today: 'Today',
    seven: '7 days',
    thirty: '30 days',
    all: 'All',
    loading: 'Building report...',
    failed: 'Could not load the report.',
    receivedOrders: 'Orders received',
    activeOrders: 'Active orders',
    deliveredOrders: 'Delivered orders',
    cancelledOrders: 'Cancelled orders',
    deliveredSales: 'Delivered sales value',
    averageDelivered: 'Average delivered order',
    paidElectronic: 'Confirmed electronic payments',
    byChannel: 'By channel',
    byLocation: 'Delivered sales by location',
    topProducts: 'Top online products',
    noData: 'No data in this period.',
    orders: 'orders',
    delivered: 'delivered',
    units: 'units',
    sourceNote: 'Received orders use order creation time, delivered sales use delivery time, and cancellations use cancellation time. Cashier orders are excluded from this report.',
    combinedSales: 'Combined known sales value',
    cashierNetSales: 'Cashier net sales',
    onlineDeliveredSales: 'Delivered online sales',
    currency: 'Currency',
    combinedNote: 'This view combines cashier net sales after returns and voids with delivered online-order value. Different currencies are never converted or merged.',
    generated: 'Last updated',
  },
};

function startOfLocalDay(daysBack: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return date;
}

function rangeQuery(range: RangeKey): string {
  const params = new URLSearchParams();
  if (range === 'today') params.set('from', startOfLocalDay(0).toISOString());
  if (range === '7d') params.set('from', startOfLocalDay(6).toISOString());
  if (range === '30d') params.set('from', startOfLocalDay(29).toISOString());
  const query = params.toString();
  return query ? `?${query}` : '';
}

function RangeSelector({
  value,
  onChange,
  copy,
}: {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
  copy: Copy;
}) {
  const ranges: Array<[RangeKey, string]> = [
    ['today', copy.today],
    ['7d', copy.seven],
    ['30d', copy.thirty],
    ['all', copy.all],
  ];
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-sm">
      {ranges.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            value === key
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
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

function iqMoney(value: number, lang: Lang): string {
  return formatMerchantMoneyMinor(value, 'IQD', 0, lang);
}

function useOnlineReport(range: RangeKey) {
  const [report, setReport] = useState<OnlineReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++sequence.current;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/reports/online${rangeQuery(range)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload?.report) {
        throw new Error('online report failed');
      }
      if (requestId !== sequence.current) return;
      setReport(payload.report as OnlineReport);
    } catch {
      if (requestId !== sequence.current) return;
      setReport(null);
      setFailed(true);
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return { report, loading, failed };
}

function OnlineReports() {
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const [range, setRange] = useState<RangeKey>('today');
  const { report, loading, failed } = useOnlineReport(range);

  return (
    <div className="space-y-5">
      <RangeSelector value={range} onChange={setRange} copy={copy} />
      {failed ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          {copy.failed}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {copy.loading}
        </div>
      ) : null}
      {!loading && !failed && report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title={copy.receivedOrders}><span dir="ltr">{report.received_order_count}</span></Metric>
            <Metric title={copy.activeOrders}><span dir="ltr">{report.active_order_count}</span></Metric>
            <Metric title={copy.deliveredOrders}><span dir="ltr">{report.delivered_order_count}</span></Metric>
            <Metric title={copy.cancelledOrders}><span dir="ltr">{report.cancelled_order_count}</span></Metric>
            <Metric title={copy.deliveredSales}><span dir="ltr">{iqMoney(report.delivered_sales_iqd, lang)}</span></Metric>
            <Metric title={copy.averageDelivered}><span dir="ltr">{iqMoney(report.average_delivered_order_iqd, lang)}</span></Metric>
            <Metric title={copy.paidElectronic}><span dir="ltr">{report.paid_electronic_count}</span></Metric>
          </div>

          <p className="rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
            {copy.sourceNote}
          </p>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <h2 className="text-lg font-bold">{copy.byChannel}</h2>
              <div className="mt-3 space-y-2">
                {report.by_channel.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noData}</p> : report.by_channel.map(channel => (
                  <div key={channel.source_channel} className="rounded-xl border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold" dir="ltr">{channel.source_channel}</p>
                      <span className="text-xs text-muted-foreground">{channel.order_count} {copy.orders}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{copy.delivered}: <b dir="ltr">{channel.delivered_order_count}</b></span>
                      <span dir="ltr">{iqMoney(channel.delivered_sales_iqd, lang)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <h2 className="text-lg font-bold">{copy.byLocation}</h2>
              <div className="mt-3 space-y-2">
                {report.by_location.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noData}</p> : report.by_location.map(location => (
                  <div key={location.location_id || location.location_name} className="flex items-center justify-between gap-4 rounded-xl border bg-background p-3">
                    <div>
                      <p className="font-bold">{location.location_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{location.delivered_order_count} {copy.delivered}</p>
                    </div>
                    <p className="font-bold" dir="ltr">{iqMoney(location.delivered_sales_iqd, lang)}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-bold">{copy.topProducts}</h2>
            <div className="mt-3 divide-y rounded-xl border bg-background">
              {report.top_products.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{copy.noData}</p> : report.top_products.map((product, index) => (
                <div key={product.product_id || product.product_name} className="flex items-center justify-between gap-4 p-3">
                  <p className="font-semibold"><span className="me-2 text-muted-foreground">#{index + 1}</span>{product.product_name}</p>
                  <div className="text-end text-sm">
                    <p className="font-bold" dir="ltr">{product.units} {copy.units}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{iqMoney(product.revenue_iqd, lang)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-center text-xs text-muted-foreground">
            {copy.generated}: <span dir="ltr">{new Date(report.generated_at).toLocaleString(lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ku' : 'en')}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}

type CombinedCurrency = {
  code: string;
  digits: number;
  cashier: number;
  online: number;
};

function CombinedReports() {
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const [range, setRange] = useState<RangeKey>('today');
  const [cashier, setCashier] = useState<CashierReport | null>(null);
  const [online, setOnline] = useState<OnlineReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++sequence.current;
    setLoading(true);
    setFailed(false);
    try {
      const query = rangeQuery(range);
      const [cashierResponse, onlineResponse] = await Promise.all([
        fetch(`/api/cashier/management/report${query}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
        fetch(`/api/reports/online${query}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      ]);
      const [cashierPayload, onlinePayload] = await Promise.all([
        cashierResponse.json().catch(() => null),
        onlineResponse.json().catch(() => null),
      ]);
      if (!cashierResponse.ok || cashierPayload?.ok !== true || !cashierPayload?.report) {
        throw new Error('cashier report failed');
      }
      if (!onlineResponse.ok || onlinePayload?.ok !== true || !onlinePayload?.report) {
        throw new Error('online report failed');
      }
      if (requestId !== sequence.current) return;
      setCashier(cashierPayload as CashierReport);
      setOnline(onlinePayload.report as OnlineReport);
    } catch {
      if (requestId !== sequence.current) return;
      setCashier(null);
      setOnline(null);
      setFailed(true);
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const currencies = useMemo<CombinedCurrency[]>(() => {
    if (!cashier || !online) return [];
    const map = new Map<string, CombinedCurrency>();
    for (const item of cashier.report.by_currency || []) {
      const key = `${item.currency_code}:${item.currency_fraction_digits}`;
      map.set(key, {
        code: item.currency_code,
        digits: item.currency_fraction_digits,
        cashier: item.net_revenue_minor,
        online: 0,
      });
    }
    const iqKey = 'IQD:0';
    const iq = map.get(iqKey) || { code: 'IQD', digits: 0, cashier: 0, online: 0 };
    iq.online += online.delivered_sales_iqd;
    map.set(iqKey, iq);
    return [...map.values()].sort((left, right) => left.code.localeCompare(right.code));
  }, [cashier, online]);

  return (
    <div className="space-y-5">
      <RangeSelector value={range} onChange={setRange} copy={copy} />
      {failed ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          {copy.failed}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {copy.loading}
        </div>
      ) : null}
      {!loading && !failed && cashier && online ? (
        <>
          <p className="rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
            {copy.combinedNote}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric title={copy.onlineDeliveredSales}><span dir="ltr">{iqMoney(online.delivered_sales_iqd, lang)}</span></Metric>
            <Metric title={copy.deliveredOrders}><span dir="ltr">{online.delivered_order_count}</span></Metric>
            <Metric title={copy.receivedOrders}><span dir="ltr">{online.received_order_count}</span></Metric>
          </div>

          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-bold">{copy.combinedSales}</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start">{copy.currency}</th>
                    <th className="px-3 py-2 text-end">{copy.cashierNetSales}</th>
                    <th className="px-3 py-2 text-end">{copy.onlineDeliveredSales}</th>
                    <th className="px-3 py-2 text-end">{copy.combinedSales}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {currencies.map(row => (
                    <tr key={`${row.code}:${row.digits}`}>
                      <td className="px-3 py-3 font-bold" dir="ltr">{row.code}</td>
                      <td className="px-3 py-3 text-end font-semibold" dir="ltr">{formatMerchantMoneyMinor(row.cashier, row.code, row.digits, lang)}</td>
                      <td className="px-3 py-3 text-end font-semibold" dir="ltr">{row.online ? formatMerchantMoneyMinor(row.online, row.code, row.digits, lang) : '—'}</td>
                      <td className="px-3 py-3 text-end font-extrabold" dir="ltr">{formatMerchantMoneyMinor(row.cashier + row.online, row.code, row.digits, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-center text-xs text-muted-foreground">
            {copy.generated}: <span dir="ltr">{new Date(Math.max(new Date(cashier.generated_at).getTime(), new Date(online.generated_at).getTime())).toLocaleString(lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ku' : 'en')}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const { lang, dir } = useI18n();
  const [location] = useLocation();
  const copy = COPY[lang] || COPY.en;
  const section = location.includes('/online')
    ? 'online'
    : location.includes('/combined')
      ? 'combined'
      : 'cashier';

  const tabs = [
    { key: 'cashier', href: '/dashboard/reports/cashier', label: copy.cashier },
    { key: 'online', href: '/dashboard/reports/online', label: copy.online },
    { key: 'combined', href: '/dashboard/reports/combined', label: copy.combined },
  ] as const;

  return (
    <div className="space-y-5 pb-8" dir={dir}>
      <header>
        <h1 className="text-2xl font-bold text-foreground">{copy.reports}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.subtitle}</p>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-sm" aria-label={copy.reports}>
        {tabs.map(tab => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={section === tab.key ? 'page' : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              section === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {section === 'cashier' ? <CashierCentralReportsPage embedded /> : null}
      {section === 'online' ? <OnlineReports /> : null}
      {section === 'combined' ? <CombinedReports /> : null}
    </div>
  );
}
