import type { Lang } from '@/lib/types';

export type CashierReportsCopy = {
  title: string;
  subtitle: string;
  back: string;
  history: string;
  online: string;
  offline: string;
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
  returns: string;
  voids: string;
  topProducts: string;
  noTop: string;
  sold: string;
  revenue: string;
  partialProfit: string;
  unavailableProfit: string;
  localSource: string;
  serverSource: string;
};

export const CASHIER_REPORTS_COPY: Record<Lang, CashierReportsCopy> = {
  ar: {
    title: 'تقارير المبيعات',
    subtitle: 'تقارير مبنية على وقت تنفيذ عمليات البيع والإرجاع والإلغاء ضمن نطاق صلاحيات الموظف.',
    back: 'العودة للكاشير',
    history: 'سجل المبيعات',
    online: 'متصل',
    offline: 'غير متصل',
    today: 'اليوم',
    seven: '7 أيام',
    thirty: '30 يوم',
    all: 'الكل',
    loading: 'جارٍ حساب التقرير...',
    empty: 'لا توجد عمليات كاشير ضمن هذه الفترة.',
    loadFailed: 'تعذر قراءة تقرير الكاشير.',
    netSales: 'صافي المبيعات',
    profit: 'الربح الإجمالي',
    operations: 'عمليات البيع',
    units: 'صافي القطع المباعة',
    refunds: 'قيمة الإرجاعات والإلغاءات',
    average: 'متوسط قيمة عملية البيع',
    returns: 'عمليات الإرجاع',
    voids: 'عمليات الإلغاء',
    topProducts: 'الأكثر مبيعًا',
    noTop: 'لا توجد منتجات بصافي بيع موجب في هذه الفترة.',
    sold: 'قطعة',
    revenue: 'صافي المبيعات',
    partialProfit: 'الربح الظاهر جزئي لأن تكلفة بعض القطع غير مسجلة.',
    unavailableProfit: 'بيانات الربح غير متاحة لهذا النطاق. لا يفترض فوري أن التكلفة صفر.',
    localSource: 'المصدر: سجل الكاشير المحلي الموثوق — وضع عدم الاتصال',
    serverSource: 'المصدر: تقرير الكاشير المركزي على السيرفر',
  },
  ku: {
    title: 'ڕاپۆرتی فرۆشتن',
    subtitle: 'ڕاپۆرتەکان لەسەر بنەمای کاتی جێبەجێکردنی کردارەکانی فرۆشتن، گەڕاندنەوە و هەڵوەشاندنەوە لە چوارچێوەی دەسەڵاتی کارمەند.',
    back: 'گەڕانەوە بۆ کاشێر',
    history: 'تۆماری فرۆشتن',
    online: 'پەیوەستە',
    offline: 'پەیوەست نییە',
    today: 'ئەمڕۆ',
    seven: '7 ڕۆژ',
    thirty: '30 ڕۆژ',
    all: 'هەموو',
    loading: 'ڕاپۆرت هەژمار دەکرێت...',
    empty: 'لەو ماوەیەدا هیچ کرداری کاشێر نییە.',
    loadFailed: 'خوێندنەوەی ڕاپۆرتی کاشێر سەرکەوتوو نەبوو.',
    netSales: 'فرۆشتنی خاوێن',
    profit: 'قازانجی گشتی',
    operations: 'مامەڵەکانی فرۆشتن',
    units: 'دانەی فرۆشراوی خاوێن',
    refunds: 'بەهای گەڕاندنەوە و هەڵوەشاندنەوە',
    average: 'تێکڕای بەهای مامەڵەی فرۆشتن',
    returns: 'کرداری گەڕاندنەوە',
    voids: 'کرداری هەڵوەشاندنەوە',
    topProducts: 'زۆرترین فرۆشراو',
    noTop: 'لەو ماوەیەدا هیچ بەرهەمێک بە فرۆشتنی خاوێنی پۆزەتیڤ نییە.',
    sold: 'دانە',
    revenue: 'فرۆشتنی خاوێن',
    partialProfit: 'قازانجی پیشاندراو بەشێکییە چونکە تێچووی هەندێک دانە تۆمار نەکراوە.',
    unavailableProfit: 'زانیاری قازانج بۆ ئەم مەودایە بەردەست نییە. فەوری تێچوو بە سفر دانانێت.',
    localSource: 'سەرچاوە: تۆماری متمانەپێکراوی ناوخۆیی کاشێر — دۆخی بێ پەیوەندی',
    serverSource: 'سەرچاوە: ڕاپۆرتی ناوەندی کاشێر لە سێرڤەر',
  },
  en: {
    title: 'Sales Reports',
    subtitle: 'Reports use sale, return and void operation time within the employee’s authorized scope.',
    back: 'Back to cashier',
    history: 'Sales history',
    online: 'Online',
    offline: 'Offline',
    today: 'Today',
    seven: '7 days',
    thirty: '30 days',
    all: 'All',
    loading: 'Calculating report...',
    empty: 'No cashier operations in this period.',
    loadFailed: 'Could not read the cashier report.',
    netSales: 'Net sales',
    profit: 'Gross profit',
    operations: 'Sales operations',
    units: 'Net units sold',
    refunds: 'Returns & voids value',
    average: 'Average sale ticket',
    returns: 'Return operations',
    voids: 'Void operations',
    topProducts: 'Top products',
    noTop: 'No products have positive net sales in this period.',
    sold: 'units',
    revenue: 'Net sales',
    partialProfit: 'Shown profit is partial because cost is missing for some units.',
    unavailableProfit: 'Profit data is unavailable for this scope. Fawri does not assume missing cost is zero.',
    localSource: 'Source: trusted local cashier record — offline mode',
    serverSource: 'Source: central cashier report on the server',
  },
};
