import type { Lang } from '@/lib/types';

export type ReportsPageCopy = {
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
  period: string;
  trustedOnlineSource: string;
  noSalesValue: string;
  deliveredOnlineOrders: string;
  receivedOnlineOrders: string;
  notApplicable: string;
};

export const REPORTS_PAGE_COPY: Record<Lang, ReportsPageCopy> = {
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
    period: 'الفترة',
    trustedOnlineSource: 'المصدر: سجل الطلبات الإلكترونية الموثوق على السيرفر',
    noSalesValue: 'لا توجد قيمة مبيعات خلال الفترة المحددة.',
    deliveredOnlineOrders: 'الطلبات الإلكترونية المسلّمة',
    receivedOnlineOrders: 'الطلبات الإلكترونية المستلمة',
    notApplicable: 'غير منطبق',
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
    period: 'ماوە',
    trustedOnlineSource: 'سەرچاوە: تۆماری متمانەپێکراوی داواکاری ئۆنلاین لە سێرڤەر',
    noSalesValue: 'لە ماوەی هەڵبژێردراودا بەهای فرۆشتن نییە.',
    deliveredOnlineOrders: 'داواکاری گەیەنراو',
    receivedOnlineOrders: 'داواکاری وەرگیراو',
    notApplicable: 'ناگونجێت',
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
    period: 'Period',
    trustedOnlineSource: 'Source: trusted online-order record on the server',
    noSalesValue: 'No sales value in the selected period.',
    deliveredOnlineOrders: 'Delivered online orders',
    receivedOnlineOrders: 'Online orders received',
    notApplicable: 'Not applicable',
  },
};
