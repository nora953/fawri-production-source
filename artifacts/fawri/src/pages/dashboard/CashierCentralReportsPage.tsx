import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ReportToolbar, type AppliedDateRange, type ReportRangeKey } from '@/components/reports/ReportToolbar';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import { downloadWorkbook } from '@/lib/reportWorkbook';

type RangeKey = ReportRangeKey;
type OperationKind = 'sale' | 'return' | 'void';

type ProductRow = {
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  net_units: number;
  net_revenue_minor: number;
  profit_status: 'available' | 'partial' | 'unavailable';
  gross_profit_minor?: number;
  cost_known_affected_units: number;
  cost_unknown_affected_units: number;
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
  top_profitable_products: ProductRow[];
};

type Report = { sale_count: number; by_currency: CurrencyReport[] };
type StaffReport = { staff_id: string | null; staff_name: string; report: Report };
type StationReport = { station_id: string | null; station_name: string; branch_key?: string; branch_label?: string; report: Report };
type LocationReport = { location_id: string | null; location_name: string; report: Report };
type ActivityCounts = { operation_count: number; sale_count: number; return_count: number; void_count: number };
type StaffActivity = ActivityCounts & { staff_id: string; staff_name: string };
type StationActivity = ActivityCounts & { station_id: string; station_name: string; branch_key?: string; branch_label?: string };
type LocationActivity = ActivityCounts & { location_id: string | null; location_name: string };

type OperationActivity = {
  operation_id: string;
  sale_id: string;
  operation_kind: OperationKind;
  staff_id: string;
  staff_name: string;
  station_id: string;
  station_name: string;
  location_id?: string;
  location_name?: string;
  branch_key?: string;
  branch_label?: string;
  shift_id: string;
  occurred_at: string;
  amount_minor?: number;
  currency_code?: string;
  currency_fraction_digits?: number;
};

type CentralReportResult = {
  generated_at: string;
  sales_scanned: number;
  report: Report;
  by_staff: StaffReport[];
  by_station: StationReport[];
  by_location: LocationReport[];
  activity: {
    by_staff: StaffActivity[];
    by_station: StationActivity[];
    by_location: LocationActivity[];
    operations: OperationActivity[];
    operation_matching_count: number;
    operation_detail_limit: number;
  };
};

type MoneyValue = { code: string; digits: number; value: number | null };

type Copy = {
  title: string; subtitle: string; back: string; today: string; seven: string; thirty: string; all: string;
  loading: string; failed: string; empty: string; netSales: string; profit: string; operations: string; units: string;
  refunds: string; average: string; voided: string; returns: string; partialProfit: string; unavailableProfit: string;
  topProducts: string; topProfitable: string; noTop: string; noProfitable: string; revenueChart: string; unitsChart: string; profitChart: string; salesByStaff: string; salesByStation: string; salesByLocation: string; activityByStaff: string; activityByStation: string; activityByLocation: string;
  noGroupSales: string; sales: string; saleOps: string; returnOps: string; voidOps: string; totalOps: string; location: string; currency: string; period: string; profitStatus: string; metric: string; value: string;
  generated: string; source: string; operationDetails: string; operationDetailsHint: string; detailsLimited: string; employeeFilter: string; locationFilter: string; stationFilter: string;
  typeFilter: string; allEmployees: string; allLocations: string; allStations: string; allTypes: string; employee: string; station: string; shift: string;
  operationType: string; saleReference: string; dateTime: string; amount: string; noDetails: string; formerEmployee: string; formerStation: string; formerLocation: string;
};

const COPY: Record<Lang, Copy> = {
  ar: {
    title: 'تقرير الكاشير المركزي', subtitle: 'المبيعات والإرجاعات والإلغاءات حسب المواقع والموظفين والمحطات من السجل المركزي الموثوق.', back: 'إدارة الكاشيرات',
    today: 'اليوم', seven: '7 أيام', thirty: '30 يوم', all: 'الكل', loading: 'جارٍ إعداد التقرير المركزي...', failed: 'تعذر تحميل تقرير الكاشير المركزي.', empty: 'لا توجد عمليات كاشير ضمن هذه الفترة.',
    netSales: 'صافي المبيعات', profit: 'الربح الإجمالي', operations: 'عمليات البيع', units: 'صافي القطع المباعة', refunds: 'قيمة الإرجاعات والإلغاءات', average: 'متوسط قيمة عملية البيع', voided: 'عمليات الإلغاء', returns: 'عمليات الإرجاع',
    partialProfit: 'الربح الظاهر جزئي لأن تكلفة بعض القطع غير مسجلة.', unavailableProfit: 'بيانات الربح غير متاحة لهذا النطاق. لا يفترض فوري أن التكلفة صفر.', topProducts: 'الأكثر مبيعًا', topProfitable: 'الأكثر ربحية', noTop: 'لا توجد منتجات بصافي بيع موجب في هذه الفترة.', noProfitable: 'لا توجد منتجات يمكن ترتيب ربحيتها بدقة ضمن هذه الفترة؛ لا يتم افتراض تكلفة مفقودة.', revenueChart: 'رسم المبيعات حسب المنتج', unitsChart: 'القطع المباعة حسب المنتج', profitChart: 'رسم الربح حسب المنتج',
    salesByStaff: 'الأثر المالي حسب موظف البيع', salesByStation: 'الأثر المالي حسب محطة البيع', salesByLocation: 'الأثر المالي حسب الموقع', activityByStaff: 'العمليات المنفذة حسب الموظف', activityByStation: 'العمليات المنفذة حسب المحطة', activityByLocation: 'العمليات المنفذة حسب الموقع', noGroupSales: 'لا يوجد أثر مالي ضمن هذه الفترة.',
    sales: 'عمليات بيع', saleOps: 'بيع', returnOps: 'إرجاع', voidOps: 'إلغاء', totalOps: 'الإجمالي', location: 'الموقع', currency: 'العملة', period: 'الفترة', profitStatus: 'حالة الربح', metric: 'المؤشر', value: 'القيمة', generated: 'آخر تحديث', source: 'المصدر: سجل الكاشير المركزي الموثوق على السيرفر',
    operationDetails: 'تفاصيل العمليات', operationDetailsHint: 'يعرض من نفّذ كل بيع أو إرجاع أو إلغاء، مع الوقت والموقع والمحطة والمناوبة.', detailsLimited: 'يعرض جدول التفاصيل أحدث {limit} عملية كحد أقصى؛ الملخصات أعلاه تشمل كامل الفترة.', employeeFilter: 'الموظف', locationFilter: 'الموقع', stationFilter: 'المحطة', typeFilter: 'نوع العملية', allEmployees: 'كل الموظفين', allLocations: 'كل المواقع', allStations: 'كل المحطات', allTypes: 'كل العمليات',
    employee: 'الموظف', station: 'المحطة', shift: 'المناوبة', operationType: 'العملية', saleReference: 'مرجع البيع', dateTime: 'التاريخ والوقت', amount: 'المبلغ', noDetails: 'لا توجد عمليات تطابق عوامل التصفية.', formerEmployee: 'موظف سابق', formerStation: 'محطة سابقة', formerLocation: 'موقع غير منسوب',
  },
  ku: {
    title: 'ڕاپۆرتی ناوەندی کاشێر', subtitle: 'فرۆشتن و گەڕاندنەوە و هەڵوەشاندنەوە بەپێی شوێن و کارمەند و وێستگە لە تۆماری ناوەندی متمانەپێکراو.', back: 'بەڕێوەبردنی کاشێر',
    today: 'ئەمڕۆ', seven: '7 ڕۆژ', thirty: '30 ڕۆژ', all: 'هەموو', loading: 'ڕاپۆرتی ناوەندی ئامادە دەکرێت...', failed: 'بارکردنی ڕاپۆرتی ناوەندی کاشێر سەرکەوتوو نەبوو.', empty: 'لەو ماوەیەدا هیچ کرداری کاشێر نییە.',
    netSales: 'فرۆشتنی خاوێن', profit: 'قازانجی گشتی', operations: 'مامەڵەکانی فرۆشتن', units: 'دانەی فرۆشراوی خاوێن', refunds: 'بەهای گەڕاندنەوە و هەڵوەشاندنەوە', average: 'تێکڕای بەهای مامەڵەی فرۆشتن', voided: 'کرداری هەڵوەشاندنەوە', returns: 'کرداری گەڕاندنەوە',
    partialProfit: 'قازانجی پیشاندراو بەشێکییە چونکە تێچووی هەندێک دانە تۆمار نەکراوە.', unavailableProfit: 'زانیاری قازانج بۆ ئەم مەودایە بەردەست نییە. فەوری تێچوو بە سفر دانانێت.', topProducts: 'زۆرترین فرۆشراو', topProfitable: 'زۆرترین قازانج', noTop: 'لەو ماوەیەدا هیچ بەرهەمێک بە فرۆشتنی خاوێنی پۆزەتیڤ نییە.', noProfitable: 'هیچ بەرهەمێک نییە کە بتوانرێت قازانجەکەی بە دڵنیایی ڕیزبەندی بکرێت؛ تێچووی ونبوو بە سفر دانانرێت.', revenueChart: 'هێڵکاری فرۆشتن بەپێی بەرهەم', unitsChart: 'دانە فرۆشراوەکان بەپێی بەرهەم', profitChart: 'هێڵکاری قازانج بەپێی بەرهەم',
    salesByStaff: 'کاریگەری دارایی بەپێی کارمەندی فرۆشیار', salesByStation: 'کاریگەری دارایی بەپێی وێستگەی فرۆشتن', salesByLocation: 'کاریگەری دارایی بەپێی شوێن', activityByStaff: 'کردارە جێبەجێکراوەکان بەپێی کارمەند', activityByStation: 'کردارە جێبەجێکراوەکان بەپێی وێستگە', activityByLocation: 'کردارە جێبەجێکراوەکان بەپێی شوێن', noGroupSales: 'لەو ماوەیەدا کاریگەری دارایی نییە.',
    sales: 'فرۆشتن', saleOps: 'فرۆشتن', returnOps: 'گەڕاندنەوە', voidOps: 'هەڵوەشاندنەوە', totalOps: 'کۆی گشتی', location: 'شوێن', currency: 'دراو', period: 'ماوە', profitStatus: 'دۆخی قازانج', metric: 'پێوەر', value: 'بەها', generated: 'دوایین نوێکردنەوە', source: 'سەرچاوە: تۆماری ناوەندی متمانەپێکراوی کاشێر لە سێرڤەر',
    operationDetails: 'وردەکاری کردارەکان', operationDetailsHint: 'کارمەند و کات و شوێن و وێستگە و مناوبەی هەر فرۆشتن و گەڕاندنەوە و هەڵوەشاندنەوە پیشان دەدات.', detailsLimited: 'خشتەی وردەکاری تەنها نوێترین {limit} کردار پیشان دەدات؛ کورتەکانی سەرەوە هەموو ماوەکە دەگرنەوە.', employeeFilter: 'کارمەند', locationFilter: 'شوێن', stationFilter: 'وێستگە', typeFilter: 'جۆری کردار', allEmployees: 'هەموو کارمەندان', allLocations: 'هەموو شوێنەکان', allStations: 'هەموو وێستگەکان', allTypes: 'هەموو کردارەکان',
    employee: 'کارمەند', station: 'وێستگە', shift: 'مناوبە', operationType: 'کردار', saleReference: 'ژمارەی فرۆشتن', dateTime: 'بەروار و کات', amount: 'بڕ', noDetails: 'هیچ کردارێک لەگەڵ پاڵێوەرەکان ناگونجێت.', formerEmployee: 'کارمەندی پێشوو', formerStation: 'وێستگەی پێشوو', formerLocation: 'شوێنی دیارینەکراو',
  },
  en: {
    title: 'Central Cashier Report', subtitle: 'Sales, returns and voids by location, employee and station from the trusted central record.', back: 'Cashier management',
    today: 'Today', seven: '7 days', thirty: '30 days', all: 'All', loading: 'Building central cashier report...', failed: 'Could not load the central cashier report.', empty: 'No cashier operations in this period.',
    netSales: 'Net sales', profit: 'Gross profit', operations: 'Sales operations', units: 'Net units sold', refunds: 'Returns & voids value', average: 'Average sale ticket', voided: 'Void operations', returns: 'Return operations',
    partialProfit: 'Shown profit is partial because cost is missing for some units.', unavailableProfit: 'Profit data is unavailable for this scope. Fawri does not assume missing cost is zero.', topProducts: 'Top-selling products', topProfitable: 'Most profitable products', noTop: 'No products have positive net sales in this period.', noProfitable: 'No products can be ranked by profit truthfully in this period; missing cost is never treated as zero.', revenueChart: 'Product sales chart', unitsChart: 'Units sold by product', profitChart: 'Product profit chart',
    salesByStaff: 'Financial impact by selling employee', salesByStation: 'Financial impact by selling station', salesByLocation: 'Financial impact by location', activityByStaff: 'Executed operations by employee', activityByStation: 'Executed operations by station', activityByLocation: 'Executed operations by location', noGroupSales: 'No financial impact in this period.',
    sales: 'sales', saleOps: 'Sales', returnOps: 'Returns', voidOps: 'Voids', totalOps: 'Total', location: 'Location', currency: 'Currency', period: 'Period', profitStatus: 'Profit status', metric: 'Metric', value: 'Value', generated: 'Last updated', source: 'Source: trusted central cashier record on the server',
    operationDetails: 'Operation details', operationDetailsHint: 'Shows who executed each sale, return or void together with its time, location, station and shift.', detailsLimited: 'The detail table shows at most the latest {limit} operations; the summaries above cover the full period.', employeeFilter: 'Employee', locationFilter: 'Location', stationFilter: 'Station', typeFilter: 'Operation type', allEmployees: 'All employees', allLocations: 'All locations', allStations: 'All stations', allTypes: 'All operations',
    employee: 'Employee', station: 'Station', shift: 'Shift', operationType: 'Operation', saleReference: 'Sale reference', dateTime: 'Date & time', amount: 'Amount', noDetails: 'No operations match these filters.', formerEmployee: 'Former employee', formerStation: 'Former station', formerLocation: 'Unattributed location',
  },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function startOfLocalDay(daysBack: number): Date {
  const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - daysBack); return date;
}

function localDateStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function localDateEndExclusive(value: string): Date {
  const date = localDateStart(value);
  date.setDate(date.getDate() + 1);
  return date;
}

function queryForRange(range: RangeKey, custom: AppliedDateRange | null, filters: {
  staff: string;
  location: string;
  station: string;
  kind: 'all' | OperationKind;
}): string {
  const params = new URLSearchParams();
  if (range === 'today') params.set('from', startOfLocalDay(0).toISOString());
  if (range === '7d') params.set('from', startOfLocalDay(6).toISOString());
  if (range === '30d') params.set('from', startOfLocalDay(29).toISOString());
  if (range === 'custom' && custom) {
    params.set('from', localDateStart(custom.from).toISOString());
    params.set('to', localDateEndExclusive(custom.to).toISOString());
  }
  if (filters.staff !== 'all') params.set('detail_staff_id', filters.staff);
  if (filters.location !== 'all') params.set('detail_location_id', filters.location);
  if (filters.station !== 'all') params.set('detail_station_id', filters.station);
  if (filters.kind !== 'all') params.set('detail_operation_kind', filters.kind);
  const query = params.toString(); return query ? `?${query}` : '';
}

function parseResult(value: unknown): CentralReportResult {
  const raw = record(value); const activity = record(raw.activity);
  return {
    generated_at: String(raw.generated_at || ''), sales_scanned: Number(raw.sales_scanned || 0), report: raw.report as Report,
    by_staff: Array.isArray(raw.by_staff) ? raw.by_staff as StaffReport[] : [], by_station: Array.isArray(raw.by_station) ? raw.by_station as StationReport[] : [], by_location: Array.isArray(raw.by_location) ? raw.by_location as LocationReport[] : [],
    activity: {
      by_staff: Array.isArray(activity.by_staff) ? activity.by_staff as StaffActivity[] : [],
      by_station: Array.isArray(activity.by_station) ? activity.by_station as StationActivity[] : [],
      by_location: Array.isArray(activity.by_location) ? activity.by_location as LocationActivity[] : [],
      operations: Array.isArray(activity.operations) ? activity.operations as OperationActivity[] : [],
      operation_matching_count: Number(activity.operation_matching_count || 0),
      operation_detail_limit: Number(activity.operation_detail_limit || 0),
    },
  };
}

function moneyValues(report: Report, field: 'net_revenue_minor' | 'refunds_minor' | 'average_ticket_minor'): MoneyValue[] {
  return report.by_currency.map(currency => ({ code: currency.currency_code, digits: currency.currency_fraction_digits, value: field === 'average_ticket_minor' && currency.sale_count === 0 ? null : currency[field] }));
}

function profitValues(report: Report): MoneyValue[] {
  return report.by_currency.map(currency => ({ code: currency.currency_code, digits: currency.currency_fraction_digits, value: currency.profit_status === 'unavailable' ? null : currency.gross_profit_minor ?? null }));
}

function MoneyStack({ values, lang }: { values: MoneyValue[]; lang: Lang }) {
  if (values.length === 0) return <span>—</span>;
  return <span className="flex flex-col gap-0.5" dir="ltr">{values.map(value => <span key={`${value.code}:${value.digits}`}>{value.value === null ? `— ${value.code}` : formatMerchantMoneyMinor(value.value, value.code, value.digits, lang)}</span>)}</span>;
}

function Metric({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs font-semibold text-muted-foreground">{title}</p><div className="mt-2 text-xl font-extrabold">{children}</div></div>;
}

function GroupCard({ name, secondary, report, lang, labels }: { name: string; secondary?: string; report: Report; lang: Lang; labels: Copy }) {
  return <div className="rounded-xl border bg-background p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{name}</p>{secondary ? <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p> : null}</div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{report.sale_count} {labels.sales}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-lg border bg-card px-3 py-2"><p className="text-[11px] font-semibold text-muted-foreground">{labels.netSales}</p><div className="mt-1 text-sm font-bold"><MoneyStack values={moneyValues(report, 'net_revenue_minor')} lang={lang} /></div></div><div className="rounded-lg border bg-card px-3 py-2"><p className="text-[11px] font-semibold text-muted-foreground">{labels.profit}</p><div className="mt-1 text-sm font-bold"><MoneyStack values={profitValues(report)} lang={lang} /></div></div></div></div>;
}

function ActivityCard({ name, secondary, activity, labels }: { name: string; secondary?: string; activity: ActivityCounts; labels: Copy }) {
  return <div className="rounded-xl border bg-background p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{name}</p>{secondary ? <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p> : null}</div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{labels.totalOps}: <b dir="ltr">{activity.operation_count}</b></span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg border bg-card px-2 py-2"><p className="text-muted-foreground">{labels.saleOps}</p><p className="mt-1 text-base font-bold" dir="ltr">{activity.sale_count}</p></div><div className="rounded-lg border bg-card px-2 py-2"><p className="text-muted-foreground">{labels.returnOps}</p><p className="mt-1 text-base font-bold" dir="ltr">{activity.return_count}</p></div><div className="rounded-lg border bg-card px-2 py-2"><p className="text-muted-foreground">{labels.voidOps}</p><p className="mt-1 text-base font-bold" dir="ltr">{activity.void_count}</p></div></div></div>;
}

function activityTotal(result: CentralReportResult): number {
  return result.activity.by_staff.reduce((sum, item) => sum + item.operation_count, 0);
}

function operationLabel(kind: OperationKind, labels: Copy): string {
  return kind === 'sale' ? labels.saleOps : kind === 'return' ? labels.returnOps : labels.voidOps;
}

function shortReference(value: string, prefix: string): string {
  const clean = value.replace(/^sale:/, ''); return `${prefix}${clean.slice(0, 8).toUpperCase()}`;
}

function operationMoney(item: OperationActivity, lang: Lang): string {
  if (item.amount_minor === undefined || !item.currency_code || item.currency_fraction_digits === undefined) return '—';
  return formatMerchantMoneyMinor(item.amount_minor, item.currency_code, item.currency_fraction_digits, lang);
}

function formatDayFirst(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDayFirstDateTime(value: Date): string {
  return value.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function exportPeriodText(
  range: RangeKey,
  customRange: AppliedDateRange | null,
  labels: Copy,
): string {
  if (range === 'all') return labels.all;
  if (range === 'custom' && customRange) {
    return `${customRange.from.split('-').reverse().join('/')} – ${customRange.to.split('-').reverse().join('/')}`;
  }
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  if (range === '7d') from.setDate(from.getDate() - 6);
  if (range === '30d') from.setDate(from.getDate() - 29);
  return range === 'today'
    ? formatDayFirst(to)
    : `${formatDayFirst(from)} – ${formatDayFirst(to)}`;
}

function cashierExportSheetNames(lang: Lang): {
  summary: string;
  topSelling: string;
  topProfitable: string;
  operations: string;
} {
  if (lang === 'ar') {
    return {
      summary: 'الملخص',
      topSelling: 'الأكثر مبيعًا',
      topProfitable: 'الأكثر ربحية',
      operations: 'العمليات',
    };
  }
  if (lang === 'ku') {
    return {
      summary: 'پوختە',
      topSelling: 'زۆرترین فرۆشراو',
      topProfitable: 'زۆرترین قازانج',
      operations: 'کردارەکان',
    };
  }
  return {
    summary: 'Summary',
    topSelling: 'Top selling',
    topProfitable: 'Top profitable',
    operations: 'Operations',
  };
}

function profitStatusLabel(
  status: CurrencyReport['profit_status'],
  lang: Lang,
): string {
  if (lang === 'ar') {
    if (status === 'available') return 'متاح';
    if (status === 'partial') return 'جزئي';
    return 'غير متاح';
  }
  if (lang === 'ku') {
    if (status === 'available') return 'بەردەستە';
    if (status === 'partial') return 'بەشێکی';
    return 'بەردەست نییە';
  }
  if (status === 'available') return 'Available';
  if (status === 'partial') return 'Partial';
  return 'Unavailable';
}

function productDisplayName(product: ProductRow): string {
  return product.variant_name
    ? `${product.product_name} — ${product.variant_name}`
    : product.product_name;
}

function chartRows(products: ProductRow[], field: 'net_units' | 'gross_profit_minor') {
  return products.slice(0, 8).map(product => ({
    name: productDisplayName(product),
    value: field === 'gross_profit_minor' ? product.gross_profit_minor ?? 0 : product.net_units,
  }));
}

export default function CashierCentralReportsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { lang, dir } = useI18n(); const labels = COPY[lang] || COPY.en;
  const [range, setRange] = useState<RangeKey>('today'); const [customRange, setCustomRange] = useState<AppliedDateRange | null>(null); const [result, setResult] = useState<CentralReportResult | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [staffFilter, setStaffFilter] = useState('all'); const [locationFilter, setLocationFilter] = useState('all'); const [stationFilter, setStationFilter] = useState('all'); const [kindFilter, setKindFilter] = useState<'all' | OperationKind>('all');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/cashier/management/report${queryForRange(range, customRange, { staff: staffFilter, location: locationFilter, station: stationFilter, kind: kindFilter })}`, { credentials: 'same-origin', cache: 'no-store' });
      const payload = record(await response.json().catch(() => null));
      if (!response.ok || payload.ok !== true) throw new Error(labels.failed);
      if (requestId !== requestSequence.current) return;
      setResult(parseResult(payload));
    } catch {
      if (requestId !== requestSequence.current) return;
      setResult(null); setError(labels.failed);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [customRange, kindFilter, labels.failed, locationFilter, range, staffFilter, stationFilter]);

  useEffect(() => { void load(); }, [load]);

  const resetDetailFilters = () => {
    setStaffFilter('all');
    setLocationFilter('all');
    setStationFilter('all');
    setKindFilter('all');
  };

  const selectRange = (nextRange: Exclude<RangeKey, 'custom'>) => {
    resetDetailFilters();
    setCustomRange(null);
    setRange(nextRange);
  };

  const applyCustomRange = (nextRange: AppliedDateRange) => {
    resetDetailFilters();
    setCustomRange(nextRange);
    setRange('custom');
  };

  const downloadReport = async () => {
    if (!result) return;

    const periodText = exportPeriodText(range, customRange, labels);
    const generatedText = formatDayFirstDateTime(new Date(result.generated_at));
    const sheetNames = cashierExportSheetNames(lang);
    const metadataRows: Array<Array<string | number>> = [
      [labels.title],
      [labels.period, periodText],
      [labels.generated, generatedText],
      [labels.source],
      [],
    ];

    const summaryRows: Array<Array<string | number>> = [
      ...metadataRows,
      [labels.currency, labels.metric, labels.value, labels.profitStatus],
    ];
    for (const currency of result.report.by_currency) {
      const code = currency.currency_code;
      summaryRows.push(
        [code, labels.netSales, currency.net_revenue_minor, ''],
        [code, labels.profit, currency.profit_status === 'unavailable' ? '' : currency.gross_profit_minor ?? '', profitStatusLabel(currency.profit_status, lang)],
        [code, labels.operations, currency.sale_count, ''],
        [code, labels.units, currency.net_units, ''],
        [code, labels.refunds, currency.refunds_minor, ''],
        [code, labels.average, currency.average_ticket_minor, ''],
        [code, labels.voided, currency.voided_sale_count, ''],
        [code, labels.returns, currency.return_count, ''],
      );
    }

    const topSellingRows: Array<Array<string | number>> = [
      ...metadataRows,
      [labels.currency, labels.topProducts, labels.units, labels.netSales],
    ];
    const profitableRows: Array<Array<string | number>> = [
      ...metadataRows,
      [labels.currency, labels.topProfitable, labels.netSales, labels.profit],
    ];

    result.report.by_currency.forEach(currency => {
      currency.top_products.forEach(product => {
        topSellingRows.push([
          currency.currency_code,
          productDisplayName(product),
          product.net_units,
          product.net_revenue_minor,
        ]);
      });
      currency.top_profitable_products.forEach(product => {
        profitableRows.push([
          currency.currency_code,
          productDisplayName(product),
          product.net_revenue_minor,
          product.gross_profit_minor ?? '',
        ]);
      });
    });

    const operationRows: Array<Array<string | number>> = [
      ...metadataRows,
      ...(detailsAreLimited
        ? [[labels.detailsLimited.replace('{limit}', String(result.activity.operation_detail_limit))]]
        : []),
      detailsAreLimited ? [] : [],
      [
        labels.dateTime,
        labels.employee,
        labels.operationType,
        labels.location,
        labels.station,
        labels.amount,
        labels.currency,
        labels.saleReference,
        labels.shift,
      ],
    ];
    const operationHeaderRow = operationRows.length - 1;

    filteredOperations.forEach(item => {
      operationRows.push([
        formatDayFirstDateTime(new Date(item.occurred_at)),
        item.staff_name || labels.formerEmployee,
        operationLabel(item.operation_kind, labels),
        item.location_name || labels.formerLocation,
        item.station_name || labels.formerStation,
        item.amount_minor ?? '',
        item.currency_code ?? '',
        item.sale_id,
        item.shift_id,
      ]);
    });

    const fileRange =
      range === 'custom' && customRange
        ? `${customRange.from}-to-${customRange.to}`
        : `${range}-${new Date().toISOString().slice(0, 10)}`;

    await downloadWorkbook(`fawri-cashier-report-${fileRange}`, [
      {
        name: sheetNames.summary,
        rows: summaryRows,
        columnWidths: [14, 28, 20, 18],
        rowHeights: [24, 22, 22, 22, 10, 24],
        headerRow: metadataRows.length,
        autoFilter: true,
        rtlText: lang !== 'en',
        mergeRanges: [
          { startRow: 0, startColumn: 0, endRow: 0, endColumn: 3 },
          { startRow: 1, startColumn: 1, endRow: 1, endColumn: 3 },
          { startRow: 2, startColumn: 1, endRow: 2, endColumn: 3 },
          { startRow: 3, startColumn: 0, endRow: 3, endColumn: 3 },
        ],
      },
      {
        name: sheetNames.topSelling,
        rows: topSellingRows,
        columnWidths: [14, 42, 16, 18],
        rowHeights: [24, 22, 22, 22, 10, 24],
        headerRow: metadataRows.length,
        autoFilter: true,
        rtlText: lang !== 'en',
        mergeRanges: [
          { startRow: 0, startColumn: 0, endRow: 0, endColumn: 3 },
          { startRow: 1, startColumn: 1, endRow: 1, endColumn: 3 },
          { startRow: 2, startColumn: 1, endRow: 2, endColumn: 3 },
          { startRow: 3, startColumn: 0, endRow: 3, endColumn: 3 },
        ],
      },
      {
        name: sheetNames.topProfitable,
        rows: profitableRows,
        columnWidths: [14, 42, 18, 18],
        rowHeights: [24, 22, 22, 22, 10, 24],
        headerRow: metadataRows.length,
        autoFilter: true,
        rtlText: lang !== 'en',
        mergeRanges: [
          { startRow: 0, startColumn: 0, endRow: 0, endColumn: 3 },
          { startRow: 1, startColumn: 1, endRow: 1, endColumn: 3 },
          { startRow: 2, startColumn: 1, endRow: 2, endColumn: 3 },
          { startRow: 3, startColumn: 0, endRow: 3, endColumn: 3 },
        ],
      },
      {
        name: sheetNames.operations,
        rows: operationRows,
        columnWidths: [22, 18, 12, 16, 18, 14, 10, 28, 30],
        rowHeights: [24, 22, 22, 22, 10],
        headerRow: operationHeaderRow,
        autoFilter: true,
        rtlText: lang !== 'en',
        mergeRanges: [
          { startRow: 0, startColumn: 0, endRow: 0, endColumn: 8 },
          { startRow: 1, startColumn: 1, endRow: 1, endColumn: 8 },
          { startRow: 2, startColumn: 1, endRow: 2, endColumn: 8 },
          { startRow: 3, startColumn: 0, endRow: 3, endColumn: 8 },
        ],
      },
    ]);
  };
  const currencies = result?.report.by_currency || [];
  const hasData = Boolean(result && (currencies.length > 0 || activityTotal(result) > 0));
  const totalNet = result ? moneyValues(result.report, 'net_revenue_minor') : []; const totalRefunds = result ? moneyValues(result.report, 'refunds_minor') : []; const totalProfit = result ? profitValues(result.report) : [];
  const netUnits = currencies.reduce((sum, currency) => sum + currency.net_units, 0); const voidedSales = currencies.reduce((sum, currency) => sum + currency.voided_sale_count, 0); const returnCount = currencies.reduce((sum, currency) => sum + currency.return_count, 0);

  const operationStaff = useMemo(() => (result?.activity.by_staff || []).map(item => [item.staff_id, item.staff_name || labels.formerEmployee] as const), [labels.formerEmployee, result]);
  const operationLocations = useMemo(() => (result?.activity.by_location || []).map(item => [item.location_id || '__legacy_location__', item.location_name || labels.formerLocation] as const), [labels.formerLocation, result]);
  const operationStations = useMemo(() => (result?.activity.by_station || []).map(item => [item.station_id, item.station_name || labels.formerStation] as const), [labels.formerStation, result]);
  const filteredOperations = result?.activity.operations || [];
  const detailsAreLimited = Boolean(result && result.activity.operations.length < result.activity.operation_matching_count && result.activity.operation_detail_limit > 0);
  const dateLocale = lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ku' : 'en';

  return (
    <div className="report-print-content space-y-5 pb-8" dir={dir}>
      {!embedded ? <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-foreground">{labels.title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{labels.subtitle}</p></div><Link href="/dashboard/cashiers" className="rounded-xl border bg-card px-4 py-2 text-sm font-bold hover:bg-accent">{labels.back}</Link></header> : null}
      <ReportToolbar
        range={range}
        customRange={customRange}
        onRangeChange={selectRange}
        onCustomApply={applyCustomRange}
        onDownload={downloadReport}
        onPrint={() => window.print()}
        exportDisabled={loading || Boolean(error) || !result}
      />
      {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">{error}</div> : null}
      {loading ? <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">{labels.loading}</div> : null}
      {!loading && !error && result && !hasData ? <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">{labels.empty}</div> : null}

      {!loading && !error && result && hasData ? <>
        <div className="report-print-only border-b pb-3">
          <h1 className="text-xl font-extrabold">{labels.title}</h1>
          <p className="mt-1 text-sm"><span className="font-semibold">{labels.period}:</span> <span dir="ltr">{exportPeriodText(range, customRange, labels)}</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.source}</p>
        </div>
        <div className="report-print-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric title={labels.netSales}><MoneyStack values={totalNet} lang={lang} /></Metric><Metric title={labels.profit}><MoneyStack values={totalProfit} lang={lang} /></Metric><Metric title={labels.operations}><span dir="ltr">{result.report.sale_count}</span></Metric><Metric title={labels.units}><span dir="ltr">{netUnits}</span></Metric><Metric title={labels.refunds}><MoneyStack values={totalRefunds} lang={lang} /></Metric><Metric title={labels.average}><MoneyStack values={moneyValues(result.report, 'average_ticket_minor')} lang={lang} /></Metric></div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground"><span className="rounded-full border bg-card px-3 py-1.5">{labels.voided}: <b dir="ltr">{voidedSales}</b></span><span className="rounded-full border bg-card px-3 py-1.5">{labels.returns}: <b dir="ltr">{returnCount}</b></span></div>

        {currencies.map(currency => {
          const sellingChart = chartRows(currency.top_products, 'net_units');
          const profitChart = chartRows(currency.top_profitable_products, 'gross_profit_minor');
          return (
            <section key={`${currency.currency_code}:${currency.currency_fraction_digits}`} className="report-print-break-avoid report-print-currency-section space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold" dir="ltr">{currency.currency_code}</h2>
                <span className="text-xs text-muted-foreground">{currency.sale_count} {labels.sales}</span>
              </div>
              {currency.profit_status === 'partial' ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{labels.partialProfit}</div> : null}
              {currency.profit_status === 'unavailable' ? <div className="rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground">{labels.unavailableProfit}</div> : null}

              <div className="report-print-two-column grid gap-5 xl:grid-cols-2">
                <div>
                  <h3 className="font-bold">{labels.topProducts}</h3>
                  {currency.top_products.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{labels.noTop}</p> : (
                    <>
                      <div className="report-print-chart mt-2 h-64 rounded-xl border bg-background p-3">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">{labels.unitsChart}</p>
                        <ResponsiveContainer width="100%" height="90%">
                          <BarChart data={sellingChart} layout="vertical" margin={{ left: 8, right: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(value) => [Number(value), labels.units]} />
                            <Bar dataKey="value" fill="currentColor" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="report-print-product-list mt-2 divide-y rounded-xl border bg-background">
                        {currency.top_products.map((product, index) => <div key={`${product.product_id}:${product.variant_id || ''}`} className="flex items-center justify-between gap-4 px-3 py-3"><div className="min-w-0"><p className="font-semibold"><span className="me-2 text-muted-foreground">#{index + 1}</span>{product.product_name}</p>{product.variant_name ? <p className="text-xs text-muted-foreground">{product.variant_name}</p> : null}</div><div className="shrink-0 text-end text-sm"><p className="font-bold" dir="ltr">{product.net_units}</p><p className="text-xs text-muted-foreground" dir="ltr">{formatMerchantMoneyMinor(product.net_revenue_minor, currency.currency_code, currency.currency_fraction_digits, lang)}</p></div></div>)}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <h3 className="font-bold">{labels.topProfitable}</h3>
                  {currency.top_profitable_products.length === 0 ? <p className="mt-2 rounded-xl border bg-background p-4 text-sm text-muted-foreground">{labels.noProfitable}</p> : (
                    <>
                      <div className="report-print-chart mt-2 h-64 rounded-xl border bg-background p-3">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">{labels.profitChart}</p>
                        <ResponsiveContainer width="100%" height="90%">
                          <BarChart data={profitChart} layout="vertical" margin={{ left: 8, right: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(value) => formatMerchantMoneyMinor(Number(value), currency.currency_code, currency.currency_fraction_digits, lang)} />
                            <Bar dataKey="value" fill="currentColor" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="report-print-product-list mt-2 divide-y rounded-xl border bg-background">
                        {currency.top_profitable_products.map((product, index) => <div key={`${product.product_id}:${product.variant_id || ''}`} className="flex items-center justify-between gap-4 px-3 py-3"><div className="min-w-0"><p className="font-semibold"><span className="me-2 text-muted-foreground">#{index + 1}</span>{product.product_name}</p>{product.variant_name ? <p className="text-xs text-muted-foreground">{product.variant_name}</p> : null}</div><div className="shrink-0 text-end text-sm"><p className="text-xs text-muted-foreground" dir="ltr">{formatMerchantMoneyMinor(product.net_revenue_minor, currency.currency_code, currency.currency_fraction_digits, lang)}</p><p className="font-bold" dir="ltr">{formatMerchantMoneyMinor(product.gross_profit_minor ?? 0, currency.currency_code, currency.currency_fraction_digits, lang)}</p></div></div>)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          );
        })}

        <div className="report-print-three-column grid gap-5 xl:grid-cols-3">
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.salesByLocation}</h2><span className="text-sm text-muted-foreground">{result.by_location.length}</span></div><div className="space-y-2">{result.by_location.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.by_location.map(group => <GroupCard key={group.location_id || '__legacy_location__'} name={group.location_name || labels.formerLocation} report={group.report} lang={lang} labels={labels} />)}</div></section>
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.salesByStaff}</h2><span className="text-sm text-muted-foreground">{result.by_staff.length}</span></div><div className="space-y-2">{result.by_staff.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.by_staff.map(group => <GroupCard key={group.staff_id || '__legacy_staff__'} name={group.staff_name || labels.formerEmployee} report={group.report} lang={lang} labels={labels} />)}</div></section>
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.salesByStation}</h2><span className="text-sm text-muted-foreground">{result.by_station.length}</span></div><div className="space-y-2">{result.by_station.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.by_station.map(group => <GroupCard key={group.station_id || '__legacy_station__'} name={group.station_name || labels.formerStation} report={group.report} lang={lang} labels={labels} />)}</div></section>
        </div>

        <div className="report-print-three-column grid gap-5 xl:grid-cols-3">
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.activityByLocation}</h2><span className="text-sm text-muted-foreground">{result.activity.by_location.length}</span></div><div className="space-y-2">{result.activity.by_location.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.activity.by_location.map(group => <ActivityCard key={group.location_id || '__legacy_location_activity__'} name={group.location_name || labels.formerLocation} activity={group} labels={labels} />)}</div></section>
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.activityByStaff}</h2><span className="text-sm text-muted-foreground">{result.activity.by_staff.length}</span></div><div className="space-y-2">{result.activity.by_staff.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.activity.by_staff.map(group => <ActivityCard key={group.staff_id} name={group.staff_name || labels.formerEmployee} activity={group} labels={labels} />)}</div></section>
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{labels.activityByStation}</h2><span className="text-sm text-muted-foreground">{result.activity.by_station.length}</span></div><div className="space-y-2">{result.activity.by_station.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noGroupSales}</p> : result.activity.by_station.map(group => <ActivityCard key={group.station_id} name={group.station_name || labels.formerStation} activity={group} labels={labels} />)}</div></section>
        </div>

        <section className="report-print-operation-details rounded-2xl border bg-card p-4 shadow-sm sm:p-5" data-testid="cashier-operation-details">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{labels.operationDetails}</h2><p className="mt-1 text-sm text-muted-foreground">{labels.operationDetailsHint}</p></div><span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">{filteredOperations.length}</span></div>
          <div className="report-no-print mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold">{labels.employeeFilter}<select value={staffFilter} onChange={event => setStaffFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal"><option value="all">{labels.allEmployees}</option>{operationStaff.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label className="text-sm font-semibold">{labels.locationFilter}<select value={locationFilter} onChange={event => setLocationFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal"><option value="all">{labels.allLocations}</option>{operationLocations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label className="text-sm font-semibold">{labels.stationFilter}<select value={stationFilter} onChange={event => setStationFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal"><option value="all">{labels.allStations}</option>{operationStations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label className="text-sm font-semibold">{labels.typeFilter}<select value={kindFilter} onChange={event => setKindFilter(event.target.value as 'all' | OperationKind)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal"><option value="all">{labels.allTypes}</option><option value="sale">{labels.saleOps}</option><option value="return">{labels.returnOps}</option><option value="void">{labels.voidOps}</option></select></label>
          </div>
          {detailsAreLimited ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{labels.detailsLimited.replace('{limit}', String(result.activity.operation_detail_limit))}</p> : null}
          {filteredOperations.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{labels.noDetails}</p> : (
            <div className="mt-4 overflow-x-auto rounded-xl border xl:overflow-x-visible">
              <table className="w-full min-w-[860px] table-fixed text-[13px] xl:min-w-0">
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead className="bg-muted/60 text-[11px] text-muted-foreground">
                  <tr><th className="px-2 py-2 text-start">{labels.dateTime}</th><th className="px-2 py-2 text-start">{labels.employee}</th><th className="px-2 py-2 text-start">{labels.operationType}</th><th className="px-2 py-2 text-start">{labels.saleReference}</th><th className="px-2 py-2 text-start">{labels.location}</th><th className="px-2 py-2 text-start">{labels.station}</th><th className="px-2 py-2 text-start">{labels.shift}</th><th className="px-2 py-2 text-end">{labels.amount}</th></tr>
                </thead>
                <tbody className="divide-y">{filteredOperations.map(item => {
                  const instant = new Date(item.occurred_at);
                  const datePart = instant.toLocaleDateString(dateLocale);
                  const timePart = instant.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
                  const employeeName = item.staff_name || labels.formerEmployee;
                  const locationName = item.location_name || labels.formerLocation;
                  const stationName = item.station_name || labels.formerStation;
                  return <tr key={item.operation_id}>
                    <td className="px-2 py-2.5"><span className="block whitespace-nowrap">{datePart}</span><span className="block whitespace-nowrap text-[11px] text-muted-foreground">{timePart}</span></td>
                    <td className="truncate px-2 py-2.5 font-semibold" title={employeeName}>{employeeName}</td>
                    <td className="px-2 py-2.5"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${item.operation_kind === 'sale' ? 'bg-emerald-50 text-emerald-700' : item.operation_kind === 'return' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>{operationLabel(item.operation_kind, labels)}</span></td>
                    <td className="px-2 py-2.5 font-mono text-[11px]" dir="ltr">{shortReference(item.sale_id, '#')}</td>
                    <td className="truncate px-2 py-2.5" title={locationName}>{locationName}</td>
                    <td className="truncate px-2 py-2.5" title={stationName}>{stationName}</td>
                    <td className="truncate px-2 py-2.5 font-mono text-[11px]" dir="ltr" title={item.shift_id}>{shortReference(item.shift_id, '')}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-end font-bold" dir="ltr">{operationMoney(item, lang)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </section>

        <p className="report-print-footer-note text-center text-xs text-muted-foreground">{labels.source} · {labels.generated}: <span dir="ltr">{new Date(result.generated_at).toLocaleString(dateLocale)}</span></p>
      </> : null}
    </div>
  );
}
