import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ReportToolbar, reportRangeQuery, type AppliedDateRange, type ReportRangeKey } from '@/components/reports/ReportToolbar';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import { downloadWorkbook } from '@/lib/reportWorkbook';
import CashierCentralReportsPage from './CashierCentralReportsPage';
import './reports-print.css';

type RangeKey = ReportRangeKey;

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
  delivered_delivery_fees_iqd: number;
  delivered_order_value_iqd: number;
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
  deliveryFees: string;
  deliveredOrderValue: string;
  salesChart: string;
  profitabilityUnavailable: string;
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
    deliveryFees: 'رسوم التوصيل للطلبات المسلّمة',
    deliveredOrderValue: 'إجمالي قيمة الطلبات المسلّمة',
    salesChart: 'رسم المبيعات الإلكترونية حسب المنتج',
    profitabilityUnavailable: 'ترتيب الربحية للطلبات الإلكترونية غير متاح حاليًا لأن تكلفة المنتج التاريخية وقت البيع غير محفوظة لكل طلب. لا يستخدم فوري التكلفة الحالية كبديل.',
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
    deliveryFees: 'کرێی گەیاندنی داواکاری گەیەنراو',
    deliveredOrderValue: 'کۆی بەهای داواکاری گەیەنراو',
    salesChart: 'هێڵکاری فرۆشتنی ئۆنلاین بەپێی بەرهەم',
    profitabilityUnavailable: 'ڕیزبەندی قازانجی داواکاری ئۆنلاین ئێستا بەردەست نییە چونکە تێچووی مێژوویی بەرهەم لە کاتی فرۆشتن بۆ هەر داواکارییەک تۆمار نەکراوە. فەوری تێچووی ئێستا وەک جێگرەوە بەکارناهێنێت.',
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
    topProducts: 'Top-selling online products',
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
    deliveryFees: 'Delivery fees on delivered orders',
    deliveredOrderValue: 'Total delivered order value',
    salesChart: 'Online product sales chart',
    profitabilityUnavailable: 'Online-order profitability ranking is currently unavailable because historical product cost at the time of sale is not stored for every order. Fawri does not substitute the current cost.',
  },
};

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

const ONLINE_REPORT_CHART_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
];

function arabicDigitText(value: string): string {
  return value.replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
}

function formatArabicGroupedInteger(value: number): string {
  return arabicDigitText(new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value));
}

function formatArabicIqd(value: number): string {
  const formatted = formatMerchantMoneyMinor(value, 'IQD', 0, 'ar');
  const [numberPart, ...currencyParts] = formatted.split('\u00a0');
  const ascii = numberPart.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const sign = ascii.startsWith('-') ? '-' : '';
  const unsigned = sign ? ascii.slice(1) : ascii;
  const groupedWhole = unsigned.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${arabicDigitText(`${sign}${groupedWhole}`)}\u00a0${currencyParts.join('\u00a0')}`;
}

function arabicVisualDateFromIso(value: string): string {
  const [year, month, day] = value.split('-');
  return arabicDigitText(`${year}/${month}/${day}`);
}

function arabicVisualDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return arabicDigitText(`${year}/${month}/${day}`);
}

function arabicOnlinePrintPeriod(
  range: RangeKey,
  customRange: AppliedDateRange | null,
): { start: string; end?: string } | null {
  if (range === 'all') return null;
  if (range === 'custom' && customRange) {
    return {
      start: arabicVisualDateFromIso(customRange.from),
      end: arabicVisualDateFromIso(customRange.to),
    };
  }

  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  if (range === '7d') from.setDate(from.getDate() - 6);
  if (range === '30d') from.setDate(from.getDate() - 29);
  return range === 'today'
    ? { start: arabicVisualDate(to) }
    : { start: arabicVisualDate(from), end: arabicVisualDate(to) };
}

function arabicOnlinePercent(value: number, total: number): string {
  if (total <= 0) return '٠٪';
  return new Intl.NumberFormat('ar-IQ', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / total);
}

function ArabicOnlineMetric({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="report-print-online-metric rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-center text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="report-print-metric-value mt-2 text-xl font-extrabold">{children}</div>
    </div>
  );
}

function ArabicOnlineProductChart({ products, copy }: { products: OnlineProduct[]; copy: Copy }) {
  const visibleProducts = products.slice(0, 8);
  const totalRevenue = visibleProducts.reduce((sum, product) => sum + Math.max(0, product.revenue_iqd), 0);

  return (
    <div className="report-print-chart-card mt-3 rounded-xl border bg-background p-3">
      <p className="report-print-chart-title text-center text-xs font-semibold text-muted-foreground">{copy.salesChart}</p>
      <div className="report-print-chart-canvas mx-auto mt-1 flex h-48 w-full items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visibleProducts}
              dataKey="revenue_iqd"
              nameKey="product_name"
              cx="50%"
              cy="50%"
              innerRadius="48%"
              outerRadius="88%"
              paddingAngle={2}
              strokeWidth={1}
            >
              {visibleProducts.map((product, index) => (
                <Cell
                  key={product.product_id || product.product_name}
                  fill={ONLINE_REPORT_CHART_COLORS[index % ONLINE_REPORT_CHART_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="report-print-chart-legend mt-2 divide-y">
        {visibleProducts.map((product, index) => (
          <div
            key={product.product_id || product.product_name}
            className="report-print-chart-legend-row flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0 flex items-center gap-2">
              <span
                className="report-print-chart-dot inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: ONLINE_REPORT_CHART_COLORS[index % ONLINE_REPORT_CHART_COLORS.length] }}
              />
              <span className="min-w-0 font-semibold">
                <span className="me-1.5 whitespace-nowrap" dir="ltr">#{formatArabicGroupedInteger(index + 1)}</span>
                <span>{product.product_name}</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-end">
              <span className="report-print-chart-percent rounded-full border px-2 py-0.5 text-xs font-bold" dir="ltr">
                {arabicOnlinePercent(product.revenue_iqd, totalRevenue)}
              </span>
              <span className="flex flex-col items-end text-xs leading-tight" dir="ltr">
                <b>{formatArabicGroupedInteger(product.units)} {copy.units}</b>
                <span className="text-muted-foreground">{formatArabicIqd(product.revenue_iqd)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArabicOnlineReportsContent({
  report,
  copy,
  range,
  customRange,
}: {
  report: OnlineReport;
  copy: Copy;
  range: RangeKey;
  customRange: AppliedDateRange | null;
}) {
  const period = arabicOnlinePrintPeriod(range, customRange);
  const generated = new Date(report.generated_at).toLocaleString('ar-IQ');

  return (
    <div className="report-print-content space-y-5">
      <div className="report-print-only border-b pb-3">
        <h1 className="text-xl font-extrabold">{copy.online}</h1>
        <p className="report-print-period-row mt-1 text-sm" dir="rtl">
          <span className="font-semibold">الفترة:</span>
          {period ? (
            <>
              <span dir="ltr">{period.start}</span>
              {period.end ? <><span>–</span><span dir="ltr">{period.end}</span></> : null}
            </>
          ) : <span>{copy.all}</span>}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">المصدر: سجل الطلبات الإلكترونية الموثوق على السيرفر</p>
      </div>

      <div className="report-print-online-metrics report-print-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ArabicOnlineMetric title={copy.receivedOrders}><span dir="ltr">{formatArabicGroupedInteger(report.received_order_count)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.activeOrders}><span dir="ltr">{formatArabicGroupedInteger(report.active_order_count)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveredOrders}><span dir="ltr">{formatArabicGroupedInteger(report.delivered_order_count)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.cancelledOrders}><span dir="ltr">{formatArabicGroupedInteger(report.cancelled_order_count)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveredSales}><span dir="ltr">{formatArabicIqd(report.delivered_sales_iqd)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveryFees}><span dir="ltr">{formatArabicIqd(report.delivered_delivery_fees_iqd)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveredOrderValue}><span dir="ltr">{formatArabicIqd(report.delivered_order_value_iqd)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.averageDelivered}><span dir="ltr">{formatArabicIqd(report.average_delivered_order_iqd)}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.paidElectronic}><span dir="ltr">{formatArabicGroupedInteger(report.paid_electronic_count)}</span></ArabicOnlineMetric>
      </div>

      <p className="report-print-online-note rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
        {copy.sourceNote}
      </p>

      <div className="report-print-online-groups report-print-two-column grid gap-5 xl:grid-cols-2">
        <section className="report-print-online-group-section rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{copy.byChannel}</h2>
            <span className="text-sm text-muted-foreground">{formatArabicGroupedInteger(report.by_channel.length)}</span>
          </div>
          <div className="space-y-2">
            {report.by_channel.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noData}</p> : report.by_channel.map(channel => (
              <div key={channel.source_channel} className="report-print-online-group-card rounded-xl border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold" dir="ltr">{channel.source_channel}</p>
                  <span className="text-xs text-muted-foreground">{formatArabicGroupedInteger(channel.order_count)} {copy.orders}</span>
                </div>
                <div className="report-print-online-group-stats mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border bg-card px-2 py-2">
                    <p className="text-muted-foreground">{copy.activeOrders}</p>
                    <p className="mt-1 font-bold" dir="ltr">{formatArabicGroupedInteger(channel.active_order_count)}</p>
                  </div>
                  <div className="rounded-lg border bg-card px-2 py-2">
                    <p className="text-muted-foreground">{copy.delivered}</p>
                    <p className="mt-1 font-bold" dir="ltr">{formatArabicGroupedInteger(channel.delivered_order_count)}</p>
                  </div>
                  <div className="rounded-lg border bg-card px-2 py-2">
                    <p className="text-muted-foreground">{copy.deliveredSales}</p>
                    <p className="mt-1 font-bold" dir="ltr">{formatArabicIqd(channel.delivered_sales_iqd)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="report-print-online-group-section rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{copy.byLocation}</h2>
            <span className="text-sm text-muted-foreground">{formatArabicGroupedInteger(report.by_location.length)}</span>
          </div>
          <div className="space-y-2">
            {report.by_location.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noData}</p> : report.by_location.map(location => (
              <div key={location.location_id || location.location_name} className="report-print-online-group-card flex items-center justify-between gap-4 rounded-xl border bg-background p-3">
                <div>
                  <p className="font-bold">{location.location_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatArabicGroupedInteger(location.delivered_order_count)} {copy.delivered}</p>
                </div>
                <p className="font-bold" dir="ltr">{formatArabicIqd(location.delivered_sales_iqd)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="report-print-online-products rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="report-print-chart-section-title text-center text-lg font-bold">{copy.topProducts}</h2>
        {report.top_products.length === 0
          ? <p className="mt-3 text-center text-sm text-muted-foreground">{copy.noData}</p>
          : <ArabicOnlineProductChart products={report.top_products} copy={copy} />}
        <p className="report-print-online-profit-note mt-3 rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
          {copy.profitabilityUnavailable}
        </p>
      </section>

      <p className="report-print-footer-note text-center text-xs text-muted-foreground">
        المصدر: سجل الطلبات الإلكترونية الموثوق على السيرفر · {copy.generated}: <span dir="ltr">{generated}</span>
      </p>
    </div>
  );
}


function englishVisualDateFromIso(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function englishVisualDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

function englishOnlinePrintPeriod(
  range: RangeKey,
  customRange: AppliedDateRange | null,
): { start: string; end?: string } | null {
  if (range === 'all') return null;
  if (range === 'custom' && customRange) {
    return {
      start: englishVisualDateFromIso(customRange.from),
      end: englishVisualDateFromIso(customRange.to),
    };
  }

  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  if (range === '7d') from.setDate(from.getDate() - 6);
  if (range === '30d') from.setDate(from.getDate() - 29);
  return range === 'today'
    ? { start: englishVisualDate(to) }
    : { start: englishVisualDate(from), end: englishVisualDate(to) };
}

function englishCountText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function englishOnlinePercent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / total);
}

function EnglishOnlineProductChart({ products, copy }: { products: OnlineProduct[]; copy: Copy }) {
  const visibleProducts = products.slice(0, 8);
  const totalRevenue = visibleProducts.reduce((sum, product) => sum + Math.max(0, product.revenue_iqd), 0);

  return (
    <div className="report-print-chart-card mt-3 rounded-xl border bg-background p-3">
      <p className="report-print-chart-title text-center text-xs font-semibold text-muted-foreground">{copy.salesChart}</p>
      <div className="report-print-chart-canvas mx-auto mt-1 flex h-48 w-full items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visibleProducts}
              dataKey="revenue_iqd"
              nameKey="product_name"
              cx="50%"
              cy="50%"
              innerRadius="48%"
              outerRadius="88%"
              paddingAngle={2}
              strokeWidth={1}
            >
              {visibleProducts.map((product, index) => (
                <Cell
                  key={product.product_id || product.product_name}
                  fill={ONLINE_REPORT_CHART_COLORS[index % ONLINE_REPORT_CHART_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="report-print-chart-legend mt-2 divide-y">
        {visibleProducts.map((product, index) => (
          <div
            key={product.product_id || product.product_name}
            className="report-print-chart-legend-row flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0 flex items-center gap-2">
              <span
                className="report-print-chart-dot inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: ONLINE_REPORT_CHART_COLORS[index % ONLINE_REPORT_CHART_COLORS.length] }}
              />
              <span className="min-w-0 font-semibold">
                <span className="me-1.5 whitespace-nowrap" dir="ltr">#{index + 1}</span>
                <span>{product.product_name}</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-end">
              <span className="report-print-chart-percent rounded-full border px-2 py-0.5 text-xs font-bold" dir="ltr">
                {englishOnlinePercent(product.revenue_iqd, totalRevenue)}
              </span>
              <span className="flex flex-col items-end text-xs leading-tight" dir="ltr">
                <b>{englishCountText(product.units, 'unit', 'units')}</b>
                <span className="text-muted-foreground">{iqMoney(product.revenue_iqd, 'en')}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnglishOnlineReportsContent({
  report,
  copy,
  range,
  customRange,
}: {
  report: OnlineReport;
  copy: Copy;
  range: RangeKey;
  customRange: AppliedDateRange | null;
}) {
  const period = englishOnlinePrintPeriod(range, customRange);
  const generated = new Date(report.generated_at).toLocaleString('en-GB');

  return (
    <div className="report-print-content space-y-5">
      <div className="report-print-only border-b pb-3">
        <h1 className="text-xl font-extrabold">{copy.online}</h1>
        <p className="report-print-period-row mt-1 text-sm">
          <span className="font-semibold">Period:</span>
          {period ? (
            <>
              <span dir="ltr">{period.start}</span>
              {period.end ? <><span>–</span><span dir="ltr">{period.end}</span></> : null}
            </>
          ) : <span>{copy.all}</span>}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Source: trusted online-order record on the server</p>
      </div>

      <div className="report-print-online-metrics report-print-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ArabicOnlineMetric title={copy.receivedOrders}><span dir="ltr">{report.received_order_count}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.activeOrders}><span dir="ltr">{report.active_order_count}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveredOrders}><span dir="ltr">{report.delivered_order_count}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.cancelledOrders}><span dir="ltr">{report.cancelled_order_count}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveredSales}><span dir="ltr">{iqMoney(report.delivered_sales_iqd, 'en')}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveryFees}><span dir="ltr">{iqMoney(report.delivered_delivery_fees_iqd, 'en')}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.deliveredOrderValue}><span dir="ltr">{iqMoney(report.delivered_order_value_iqd, 'en')}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.averageDelivered}><span dir="ltr">{iqMoney(report.average_delivered_order_iqd, 'en')}</span></ArabicOnlineMetric>
        <ArabicOnlineMetric title={copy.paidElectronic}><span dir="ltr">{report.paid_electronic_count}</span></ArabicOnlineMetric>
      </div>

      <p className="report-print-online-note rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
        {copy.sourceNote}
      </p>

      <div className="report-print-online-groups report-print-two-column grid gap-5 xl:grid-cols-2">
        <section className="report-print-online-group-section rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{copy.byChannel}</h2>
            <span className="text-sm text-muted-foreground">{report.by_channel.length}</span>
          </div>
          <div className="space-y-2">
            {report.by_channel.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noData}</p> : report.by_channel.map(channel => (
              <div key={channel.source_channel} className="report-print-online-group-card rounded-xl border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold" dir="ltr">{channel.source_channel}</p>
                  <span className="text-xs text-muted-foreground">{englishCountText(channel.order_count, 'order', 'orders')}</span>
                </div>
                <div className="report-print-online-group-stats mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border bg-card px-2 py-2">
                    <p className="text-muted-foreground">{copy.activeOrders}</p>
                    <p className="mt-1 font-bold" dir="ltr">{channel.active_order_count}</p>
                  </div>
                  <div className="rounded-lg border bg-card px-2 py-2">
                    <p className="text-muted-foreground">{copy.delivered}</p>
                    <p className="mt-1 font-bold" dir="ltr">{channel.delivered_order_count}</p>
                  </div>
                  <div className="rounded-lg border bg-card px-2 py-2">
                    <p className="text-muted-foreground">{copy.deliveredSales}</p>
                    <p className="mt-1 font-bold" dir="ltr">{iqMoney(channel.delivered_sales_iqd, 'en')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="report-print-online-group-section rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{copy.byLocation}</h2>
            <span className="text-sm text-muted-foreground">{report.by_location.length}</span>
          </div>
          <div className="space-y-2">
            {report.by_location.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noData}</p> : report.by_location.map(location => (
              <div key={location.location_id || location.location_name} className="report-print-online-group-card flex items-center justify-between gap-4 rounded-xl border bg-background p-3">
                <div>
                  <p className="font-bold">{location.location_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{location.delivered_order_count} {copy.delivered}</p>
                </div>
                <p className="font-bold" dir="ltr">{iqMoney(location.delivered_sales_iqd, 'en')}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="report-print-online-products rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="report-print-chart-section-title text-center text-lg font-bold">{copy.topProducts}</h2>
        {report.top_products.length === 0
          ? <p className="mt-3 text-center text-sm text-muted-foreground">{copy.noData}</p>
          : <EnglishOnlineProductChart products={report.top_products} copy={copy} />}
        <p className="report-print-online-profit-note mt-3 rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-6 text-muted-foreground">
          {copy.profitabilityUnavailable}
        </p>
      </section>

      <p className="report-print-footer-note text-center text-xs text-muted-foreground">
        Source: trusted online-order record on the server · {copy.generated}: <span dir="ltr">{generated}</span>
      </p>
    </div>
  );
}

function useOnlineReport(range: RangeKey, customRange: AppliedDateRange | null) {
  const [report, setReport] = useState<OnlineReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++sequence.current;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/reports/online${reportRangeQuery(range, customRange)}`, {
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
  }, [customRange, range]);

  useEffect(() => {
    void load();
  }, [load]);

  return { report, loading, failed };
}

function OnlineReports() {
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const [range, setRange] = useState<RangeKey>('today');
  const [customRange, setCustomRange] = useState<AppliedDateRange | null>(null);
  const { report, loading, failed } = useOnlineReport(range, customRange);

  const downloadReport = async () => {
    if (!report) return;
    await downloadWorkbook(`fawri-online-report-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: 'Summary',
        rows: [
          [copy.receivedOrders, report.received_order_count],
          [copy.activeOrders, report.active_order_count],
          [copy.deliveredOrders, report.delivered_order_count],
          [copy.cancelledOrders, report.cancelled_order_count],
          [copy.deliveredSales, report.delivered_sales_iqd],
          [copy.deliveryFees, report.delivered_delivery_fees_iqd],
          [copy.deliveredOrderValue, report.delivered_order_value_iqd],
          [copy.averageDelivered, report.average_delivered_order_iqd],
          [copy.paidElectronic, report.paid_electronic_count],
        ],
      },
      {
        name: 'Channels',
        rows: [
          [copy.byChannel, copy.orders, copy.delivered, copy.deliveredSales],
          ...report.by_channel.map(row => [
            row.source_channel,
            row.order_count,
            row.delivered_order_count,
            row.delivered_sales_iqd,
          ]),
        ],
      },
      {
        name: 'Locations',
        rows: [
          [copy.byLocation, copy.delivered, copy.deliveredSales],
          ...report.by_location.map(row => [
            row.location_name,
            row.delivered_order_count,
            row.delivered_sales_iqd,
          ]),
        ],
      },
      {
        name: 'Top selling',
        rows: [
          [copy.topProducts, copy.units, copy.deliveredSales],
          ...report.top_products.map(row => [row.product_name, row.units, row.revenue_iqd]),
        ],
      },
      {
        name: 'Profitability',
        rows: [[copy.profitabilityUnavailable]],
      },
    ]);
  };

  return (
    <div className="space-y-5">
      <ReportToolbar
        range={range}
        customRange={customRange}
        onRangeChange={value => {
          setCustomRange(null);
          setRange(value);
        }}
        onCustomApply={value => {
          setCustomRange(value);
          setRange('custom');
        }}
        onDownload={downloadReport}
        onPrint={() => window.print()}
        exportDisabled={loading || failed || !report}
      />
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
        lang === 'ar' ? (
          <ArabicOnlineReportsContent
            report={report}
            copy={copy}
            range={range}
            customRange={customRange}
          />
        ) : lang === 'en' ? (
          <EnglishOnlineReportsContent
            report={report}
            copy={copy}
            range={range}
            customRange={customRange}
          />
        ) : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title={copy.receivedOrders}><span dir="ltr">{report.received_order_count}</span></Metric>
            <Metric title={copy.activeOrders}><span dir="ltr">{report.active_order_count}</span></Metric>
            <Metric title={copy.deliveredOrders}><span dir="ltr">{report.delivered_order_count}</span></Metric>
            <Metric title={copy.cancelledOrders}><span dir="ltr">{report.cancelled_order_count}</span></Metric>
            <Metric title={copy.deliveredSales}><span dir="ltr">{iqMoney(report.delivered_sales_iqd, lang)}</span></Metric>
            <Metric title={copy.deliveryFees}><span dir="ltr">{iqMoney(report.delivered_delivery_fees_iqd, lang)}</span></Metric>
            <Metric title={copy.deliveredOrderValue}><span dir="ltr">{iqMoney(report.delivered_order_value_iqd, lang)}</span></Metric>
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

          <section className="report-print-break-avoid rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-bold">{copy.topProducts}</h2>
            {report.top_products.length > 0 ? (
              <div className="mt-3 h-64 rounded-xl border bg-background p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">{copy.salesChart}</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart
                    data={report.top_products.slice(0, 8).map(product => ({ name: product.product_name, value: product.revenue_iqd }))}
                    layout="vertical"
                    margin={{ left: 8, right: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => iqMoney(Number(value), lang)} />
                    <Bar dataKey="value" fill="currentColor" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
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
            <p className="mt-3 rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-6 text-muted-foreground">{copy.profitabilityUnavailable}</p>
          </section>

          <p className="text-center text-xs text-muted-foreground">
            {copy.generated}: <span dir="ltr">{new Date(report.generated_at).toLocaleString(lang === 'ku' ? 'ku' : 'en-GB')}</span>
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

function combinedDisplayMoney(value: number, row: CombinedCurrency, lang: Lang): string {
  if (lang === 'ar' && row.code === 'IQD' && row.digits === 0) return formatArabicIqd(value);
  const formatted = formatMerchantMoneyMinor(value, row.code, row.digits, lang);
  return lang === 'ar' ? arabicDigitText(formatted) : formatted;
}

function ArabicCombinedChart({ currencies, copy }: { currencies: CombinedCurrency[]; copy: Copy }) {
  return <div className="mt-3 space-y-3">
    {currencies.map(row => {
      const sources = [
        { label: copy.cashierNetSales, value: row.cashier, color: '#2563eb' },
        ...(row.code === 'IQD' && row.digits === 0
          ? [{ label: copy.onlineDeliveredSales, value: row.online, color: '#ea580c' }]
          : []),
      ];
      const maximum = Math.max(...sources.map(source => Math.abs(source.value)), 1);
      const signed = sources.some(source => source.value < 0);
      return <div key={`${row.code}:${row.digits}`} className="report-combined-chart rounded-xl border bg-background p-4">
        <h3 className="mb-4 text-center text-sm font-bold"><bdi>{row.code}</bdi></h3>
        <div className="space-y-4">
          {sources.map(source => {
            const width = Math.abs(source.value) / maximum * (signed ? 50 : 100);
            return <div key={source.label}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: source.color }} />{source.label}</span>
                <bdi dir="ltr" className="font-bold tabular-nums">{combinedDisplayMoney(source.value, row, 'ar')}</bdi>
              </div>
              <div aria-hidden="true" dir="ltr" className="relative h-5 overflow-hidden rounded bg-muted">
                {signed ? <span className="absolute inset-y-0 left-1/2 border-l border-foreground/40" /> : null}
                <span className="absolute inset-y-0 rounded" style={{ backgroundColor: source.color, width: `${width}%`, left: `${signed ? (source.value < 0 ? 50 - width : 50) : 0}%` }} />
              </div>
            </div>;
          })}
        </div>
        {sources.every(source => source.value === 0) ? <p className="mt-3 text-center text-xs text-muted-foreground">لا توجد قيمة مبيعات خلال الفترة المحددة.</p> : null}
      </div>;
    })}
  </div>;
}


function EnglishCombinedChart({ currencies, copy }: { currencies: CombinedCurrency[]; copy: Copy }) {
  return <div className="mt-3 space-y-3">
    {currencies.map(row => {
      const sources = [
        { label: copy.cashierNetSales, value: row.cashier, color: '#2563eb' },
        ...(row.code === 'IQD' && row.digits === 0
          ? [{ label: copy.onlineDeliveredSales, value: row.online, color: '#ea580c' }]
          : []),
      ];
      const maximum = Math.max(...sources.map(source => Math.abs(source.value)), 1);
      const signed = sources.some(source => source.value < 0);
      return <div key={`${row.code}:${row.digits}`} className="report-combined-chart rounded-xl border bg-background p-4">
        <h3 className="mb-4 text-center text-sm font-bold"><bdi>{row.code}</bdi></h3>
        <div className="space-y-4">
          {sources.map(source => {
            const width = Math.abs(source.value) / maximum * (signed ? 50 : 100);
            return <div key={source.label}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: source.color }} />{source.label}</span>
                <bdi dir="ltr" className="font-bold tabular-nums">{combinedDisplayMoney(source.value, row, 'en')}</bdi>
              </div>
              <div aria-hidden="true" dir="ltr" className="relative h-5 overflow-hidden rounded bg-muted">
                {signed ? <span className="absolute inset-y-0 left-1/2 border-l border-foreground/40" /> : null}
                <span className="absolute inset-y-0 rounded" style={{ backgroundColor: source.color, width: `${width}%`, left: `${signed ? (source.value < 0 ? 50 - width : 50) : 0}%` }} />
              </div>
            </div>;
          })}
        </div>
        {sources.every(source => source.value === 0) ? <p className="mt-3 text-center text-xs text-muted-foreground">No sales value in the selected period.</p> : null}
      </div>;
    })}
  </div>;
}

function CombinedReports() {
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const SummaryMetric = lang === 'ar' || lang === 'en' ? ArabicOnlineMetric : Metric;
  const [range, setRange] = useState<RangeKey>('today');
  const [customRange, setCustomRange] = useState<AppliedDateRange | null>(null);
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
      const query = reportRangeQuery(range, customRange);
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
  }, [customRange, range]);

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

  const downloadReport = async () => {
    if (!cashier || !online) return;
    await downloadWorkbook(`fawri-combined-report-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: 'Combined sales',
        rows: [
          [copy.currency, copy.cashierNetSales, copy.onlineDeliveredSales, copy.combinedSales],
          ...currencies.map(row => [
            row.code,
            row.cashier,
            row.online,
            row.cashier + row.online,
          ]),
        ],
      },
      {
        name: 'Online summary',
        rows: [
          [copy.receivedOrders, online.received_order_count],
          [copy.deliveredOrders, online.delivered_order_count],
          [copy.onlineDeliveredSales, online.delivered_sales_iqd],
        ],
      },
    ]);
  };

  return (
    <div className="space-y-5">
      <ReportToolbar
        range={range}
        customRange={customRange}
        onRangeChange={value => {
          setCustomRange(null);
          setRange(value);
        }}
        onCustomApply={value => {
          setCustomRange(value);
          setRange('custom');
        }}
        onDownload={downloadReport}
        onPrint={() => window.print()}
        exportDisabled={loading || failed || !cashier || !online}
      />
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
            <SummaryMetric title={copy.onlineDeliveredSales}><bdi dir="ltr">{lang === 'ar' ? formatArabicIqd(online.delivered_sales_iqd) : iqMoney(online.delivered_sales_iqd, lang)}</bdi></SummaryMetric>
            <SummaryMetric title={lang === 'ar' ? 'الطلبات الإلكترونية المسلّمة' : lang === 'en' ? 'Delivered online orders' : copy.deliveredOrders}><bdi dir="ltr">{lang === 'ar' ? formatArabicGroupedInteger(online.delivered_order_count) : online.delivered_order_count}</bdi></SummaryMetric>
            <SummaryMetric title={lang === 'ar' ? 'الطلبات الإلكترونية المستلمة' : lang === 'en' ? 'Online orders received' : copy.receivedOrders}><bdi dir="ltr">{lang === 'ar' ? formatArabicGroupedInteger(online.received_order_count) : online.received_order_count}</bdi></SummaryMetric>
          </div>

          <section className="report-print-break-avoid rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-bold">{copy.combinedSales}</h2>
            {lang === 'ar' ? <ArabicCombinedChart currencies={currencies} copy={copy} /> : lang === 'en' ? <EnglishCombinedChart currencies={currencies} copy={copy} /> : <div className="mt-3 h-56 rounded-xl border bg-background p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={currencies.flatMap(row => [
                    { name: `${row.code} · ${copy.cashier}`, value: row.cashier },
                    { name: `${row.code} · ${copy.online}`, value: row.online },
                  ])}
                  layout="vertical"
                  margin={{ left: 8, right: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="currentColor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>}
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
                      <td className="px-3 py-3 text-end font-semibold" dir="ltr">{combinedDisplayMoney(row.cashier, row, lang)}</td>
                      <td className="px-3 py-3 text-end font-semibold" dir="ltr">{lang === 'ar'
  ? (row.code === 'IQD' && row.digits === 0 ? combinedDisplayMoney(row.online, row, lang) : 'غير منطبق')
  : lang === 'en'
    ? (row.code === 'IQD' && row.digits === 0 ? formatMerchantMoneyMinor(row.online, row.code, row.digits, lang) : '—')
    : (row.online ? formatMerchantMoneyMinor(row.online, row.code, row.digits, lang) : '—')}</td>
                      <td className="px-3 py-3 text-end font-extrabold" dir="ltr">{combinedDisplayMoney(row.cashier + row.online, row, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-center text-xs text-muted-foreground">
            {copy.generated}: <span dir="ltr">{new Date(Math.max(new Date(cashier.generated_at).getTime(), new Date(online.generated_at).getTime())).toLocaleString(lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ku' : 'en-GB')}</span>
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
    <div className="report-print-root space-y-5 pb-8" dir={dir}>
      <header className="report-no-print">
        <h1 className="text-2xl font-bold text-foreground">{copy.reports}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.subtitle}</p>
      </header>

      <nav className="report-no-print flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-sm" aria-label={copy.reports}>
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
