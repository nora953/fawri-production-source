export type AdminEarlyWarningWorkspaceLanguage = "ar" | "ku" | "en";

export type AdminEarlyWarningWorkspaceCopy = {
  openSection: string;
  layout: string;
  onePanel: string;
  twoPanels: string;
  fourPanels: string;
  emptyWorkspace: string;
  emptyWorkspaceHint: string;
  minimized: string;
  more: string;
  restore: string;
  minimize: string;
  maximize: string;
  close: string;
  alerts: string;
  active: string;
  resolved: string;
  all: string;
  general: string;
  merchant: string;
  started: string;
  resolvedAt: string;
  duration: string;
  ongoing: string;
  historyUnavailable: string;
  affectedMerchants: string;
  monthlyKnownCost: string;
  projectedCost: string;
  pricingCoverage: string;
  pricingUnavailable: string;
  pricingPartial: string;
  billingNotice: string;
  dailyCost: string;
  dailyTokens: string;
  merchantReports: string;
  knownCost: string;
  outboundMessages: string;
  unpriced: string;
  costReportUnavailable: string;
  month: string;
  budget: string;
  budgetRemaining: string;
  budgetUsage: string;
  previousMonth: string;
  connectedUsage: string;
  disconnectedCosts: string;
  notConnected: string;
  actualBilling: string;
  selectMerchant: string;
  tokenInput: string;
  tokenOutput: string;
  totalTokens: string;
  dailyMerchantUsage: string;
  tokenShare: string;
  messageShare: string;
  storageShare: string;
  merchantReason: string;
  noConnectedChannel: string;
  channelErrors: string;
  messageFailures: string;
  deadLetter: string;
  uncertainDelivery: string;
  refundConflict: string;
  otp: string;
  databaseStorage: string;
  networkTransfer: string;
  objectStorage: string;
  providerBilling: string;
  supportStorage: string;
  addedAttachments: string;
  messagesMetric: string;
  storageMetric: string;
  tokensMetric: string;
  costMetric: string;
  statusFilter: string;
  scopeFilter: string;
  severityFilter: string;
  noActiveIncidents: string;
  noResolvedIncidents: string;
  noMatchingIncidents: string;
  noTokenData: string;
  noMessageData: string;
  noStorageData: string;
  noCostData: string;
  costPricingRequired: string;
  reportingWindow: string;
  monthlyScope: string;
  sortBy: string;
  highestCost: string;
  highestTokens: string;
  highestMessages: string;
  highestStorage: string;
  rank: string;
  costs: string;
  provider: string;
  model: string;
  calls: string;
  tokens: string;
  hoursShort: string;
  minutesShort: string;
  secondsShort: string;
};

export const ADMIN_EARLY_WARNING_WORKSPACE_COPY: Record<AdminEarlyWarningWorkspaceLanguage, AdminEarlyWarningWorkspaceCopy> = {
  ar: {
    openSection: "فتح قسم",
    layout: "تخطيط النوافذ",
    onePanel: "نافذة واحدة",
    twoPanels: "نافذتان",
    fourPanels: "أربع نوافذ",
    emptyWorkspace: "مساحة المراقبة فارغة",
    emptyWorkspaceHint: "افتح قسمًا من القائمة أعلاه لبدء المراقبة.",
    minimized: "النوافذ المصغّرة",
    more: "المزيد",
    restore: "استعادة",
    minimize: "تصغير",
    maximize: "تكبير",
    close: "إغلاق",
    alerts: "مركز التحذيرات",
    active: "مستمر",
    resolved: "تمت المعالجة",
    all: "الكل",
    general: "عام — فوري",
    merchant: "متجر",
    started: "بدأ",
    resolvedAt: "تمت المعالجة",
    duration: "المدة",
    ongoing: "مستمر الآن",
    historyUnavailable: "سجل دورة حياة التحذيرات غير متاح حاليًا؛ ما زالت التحذيرات اللحظية ظاهرة.",
    affectedMerchants: "متاجر متأثرة",
    monthlyKnownCost: "التكلفة المعروفة",
    projectedCost: "المتوقع لنهاية الشهر",
    pricingCoverage: "تغطية التسعير",
    pricingUnavailable: "لا توجد أسعار تشغيل مضبوطة بعد؛ تعرض اللوحة الاستهلاك الحقيقي فقط ولا تفترض تكلفة.",
    pricingPartial: "بعض الخدمات فقط لها أسعار مضبوطة؛ الإجماليات لا تشمل الخدمات غير المسعّرة.",
    billingNotice: "فواتير المزودين غير مربوطة مباشرة بعد؛ أي تكلفة ظاهرة تقدير محسوب من أسعار تشغيل مضبوطة صراحة.",
    dailyCost: "التكلفة اليومية المعروفة",
    dailyTokens: "استهلاك التوكن اليومي",
    merchantReports: "تقارير استهلاك المتاجر",
    knownCost: "تكلفة معروفة",
    outboundMessages: "رسائل صادرة",
    unpriced: "غير مسعّر",
    costReportUnavailable: "تعذر تحميل تقرير الاستهلاك والتكاليف.",
    month: "الشهر",
    budget: "ميزانية الشهر",
    budgetRemaining: "المتبقي من الميزانية",
    budgetUsage: "استخدام الميزانية",
    previousMonth: "الشهر السابق",
    connectedUsage: "مصادر استهلاك موصولة",
    disconnectedCosts: "تكاليف غير مربوطة بعد",
    notConnected: "غير مربوط",
    actualBilling: "الفوترة الفعلية",
    selectMerchant: "المتجر",
    tokenInput: "توكن الإدخال",
    tokenOutput: "توكن الإخراج",
    totalTokens: "إجمالي التوكن",
    dailyMerchantUsage: "الاستهلاك اليومي للمتجر",
    tokenShare: "حصة التوكن من فوري",
    messageShare: "حصة الرسائل من فوري",
    storageShare: "حصة التخزين من فوري",
    merchantReason: "سبب التحذير",
    noConnectedChannel: "لا توجد قناة متصلة",
    channelErrors: "أخطاء قنوات حديثة",
    messageFailures: "فشل رسائل",
    deadLetter: "مهام DLQ",
    uncertainDelivery: "إرسال غير مؤكد",
    refundConflict: "تعارض استرجاع",
    otp: "OTP / رسائل التحقق",
    databaseStorage: "تخزين PostgreSQL",
    networkTransfer: "نقل البيانات",
    objectStorage: "تخزين الملفات خارج مرفقات الدعم",
    providerBilling: "فواتير مزودي الخدمات",
    supportStorage: "تخزين مرفقات الدعم",
    addedAttachments: "مرفقات مضافة",
    messagesMetric: "الرسائل",
    storageMetric: "التخزين",
    tokensMetric: "التوكن",
    costMetric: "التكلفة",
    statusFilter: "الحالة",
    scopeFilter: "النطاق",
    severityFilter: "الخطورة",
    noActiveIncidents: "لا توجد إنذارات مستمرة تطابق الفلاتر المحددة.",
    noResolvedIncidents: "لا توجد إنذارات تمت معالجتها تطابق الفلاتر المحددة.",
    noMatchingIncidents: "لا توجد إنذارات تطابق الفلاتر المحددة.",
    noTokenData: "لا توجد بيانات توكن لهذا الشهر.",
    noMessageData: "لا توجد بيانات رسائل لهذا الشهر.",
    noStorageData: "لا توجد بيانات تخزين يومية لهذا الشهر.",
    noCostData: "لا توجد تكلفة يومية معروفة لهذا الشهر.",
    costPricingRequired: "اضبط أسعار AI أو الرسائل لعرض التكلفة اليومية المعروفة.",
    reportingWindow: "بيانات هذا القسم ضمن الفترة المحددة",
    monthlyScope: "هذا التقرير شهري ولا يتبع فلتر الساعة/الأيام أعلاه.",
    sortBy: "ترتيب المتاجر حسب",
    highestCost: "الأعلى تكلفة",
    highestTokens: "الأعلى توكن",
    highestMessages: "الأعلى رسائل",
    highestStorage: "الأعلى تخزينًا",
    rank: "الترتيب",
    costs: "الاستهلاك والتكاليف",
    provider: "المزود",
    model: "النموذج",
    calls: "الاستدعاءات",
    tokens: "التوكن",
    hoursShort: "س",
    minutesShort: "د",
    secondsShort: "ث",
  },
  ku: {
    openSection: "کردنەوەی بەش",
    layout: "ڕێکخستنی پەنجەرەکان",
    onePanel: "یەک پەنجەرە",
    twoPanels: "دوو پەنجەرە",
    fourPanels: "چوار پەنجەرە",
    emptyWorkspace: "شوێنی چاودێری بەتاڵە",
    emptyWorkspaceHint: "بەشێک بکەرەوە بۆ دەستپێکردن.",
    minimized: "پەنجەرە بچووککراوەکان",
    more: "زیاتر",
    restore: "گەڕاندنەوە",
    minimize: "بچووککردنەوە",
    maximize: "گەورەکردن",
    close: "داخستن",
    alerts: "ناوەندی ئاگاداری",
    active: "بەردەوامە",
    resolved: "چارەسەر کرا",
    all: "هەموو",
    general: "گشتی — فۆری",
    merchant: "فرۆشیار",
    started: "دەستی پێکرد",
    resolvedAt: "چارەسەر کرا",
    duration: "ماوە",
    ongoing: "ئێستا بەردەوامە",
    historyUnavailable: "مێژووی ئاگاداری بەردەست نییە.",
    affectedMerchants: "فرۆشیاری کاریگەری لەسەر",
    monthlyKnownCost: "تێچووی ناسراو",
    projectedCost: "پێشبینی کۆتایی مانگ",
    pricingCoverage: "داپۆشینی نرخ",
    pricingUnavailable: "نرخەکان دانەنراون؛ تەنها بەکارهێنانی ڕاستەقینە پیشان دەدرێت.",
    pricingPartial: "تەنها هەندێک خزمەتگوزاری نرخدارە.",
    billingNotice: "پسوڵەی دابینکەر هێشتا ڕاستەوخۆ پەیوەست نییە.",
    dailyCost: "تێچووی ڕۆژانەی ناسراو",
    dailyTokens: "تۆکنی ڕۆژانە",
    merchantReports: "ڕاپۆرتی بەکارهێنانی فرۆشیار",
    knownCost: "تێچووی ناسراو",
    outboundMessages: "نامەی دەرچوو",
    unpriced: "بێ نرخ",
    costReportUnavailable: "ڕاپۆرت بار نەکرا.",
    month: "مانگ",
    budget: "بودجەی مانگ",
    budgetRemaining: "بودجەی ماوە",
    budgetUsage: "بەکارهێنانی بودجە",
    previousMonth: "مانگی پێشوو",
    connectedUsage: "سەرچاوە پەیوەستەکان",
    disconnectedCosts: "تێچووی نەپەیوەستراو",
    notConnected: "نەپەیوەستراو",
    actualBilling: "پسوڵەی ڕاستەقینە",
    selectMerchant: "فرۆشیار",
    tokenInput: "تۆکنی هاتنەژوور",
    tokenOutput: "تۆکنی دەرچوو",
    totalTokens: "کۆی تۆکن",
    dailyMerchantUsage: "بەکارهێنانی ڕۆژانەی فرۆشیار",
    tokenShare: "بەشی تۆکن",
    messageShare: "بەشی نامە",
    storageShare: "بەشی هەڵگرتن",
    merchantReason: "هۆکاری ئاگاداری",
    noConnectedChannel: "هیچ کەناڵێک پەیوەست نییە",
    channelErrors: "هەڵەی کەناڵ",
    messageFailures: "شکستی نامە",
    deadLetter: "DLQ",
    uncertainDelivery: "گەیاندنی نادڵنیا",
    refundConflict: "ناکۆکی گەڕاندنەوە",
    otp: "OTP",
    databaseStorage: "هەڵگرتنی PostgreSQL",
    networkTransfer: "گواستنەوەی داتا",
    objectStorage: "هەڵگرتنی فایل لە دەرەوەی هاوپێچەکانی پشتگیری",
    providerBilling: "پسوڵەی دابینکەر",
    supportStorage: "هەڵگرتنی هاوپێچی پشتگیری",
    addedAttachments: "هاوپێچی زیادکراو",
    messagesMetric: "نامە",
    storageMetric: "هەڵگرتن",
    tokensMetric: "تۆکن",
    costMetric: "تێچوو",
    statusFilter: "دۆخ",
    scopeFilter: "مەودا",
    severityFilter: "مەترسی",
    noActiveIncidents: "هیچ ئاگادارییەکی بەردەوام کە لەگەڵ فلتەرەکان بگونجێت نییە.",
    noResolvedIncidents: "هیچ ئاگادارییەکی چارەسەرکراو کە لەگەڵ فلتەرەکان بگونجێت نییە.",
    noMatchingIncidents: "هیچ ئاگادارییەک لەگەڵ فلتەرەکان ناگونجێت.",
    noTokenData: "داتای تۆکن بۆ ئەم مانگە نییە.",
    noMessageData: "داتای نامە بۆ ئەم مانگە نییە.",
    noStorageData: "داتای ڕۆژانەی هەڵگرتن بۆ ئەم مانگە نییە.",
    noCostData: "تێچووی ڕۆژانەی ناسراو بۆ ئەم مانگە نییە.",
    costPricingRequired: "نرخی AI یان نامە دابنێ بۆ پیشاندانی تێچووی ڕۆژانە.",
    reportingWindow: "داتای ئەم بەشە لە ماوەی هەڵبژێردراودایە",
    monthlyScope: "ئەم ڕاپۆرتە مانگانەیە و بە فلتەری کاتەکەوە نەبەستراوە.",
    sortBy: "ڕیزکردنی فرۆشیار بە",
    highestCost: "زۆرترین تێچوو",
    highestTokens: "زۆرترین تۆکن",
    highestMessages: "زۆرترین نامە",
    highestStorage: "زۆرترین هەڵگرتن",
    rank: "ڕیز",
    costs: "بەکارهێنان و تێچوو",
    provider: "دابینکەر",
    model: "مۆدێل",
    calls: "بانگکردنەکان",
    tokens: "تۆکن",
    hoursShort: "کاتژ",
    minutesShort: "خ",
    secondsShort: "چ",
  },
  en: {
    openSection: "Open section",
    layout: "Window layout",
    onePanel: "One panel",
    twoPanels: "Two panels",
    fourPanels: "Four panels",
    emptyWorkspace: "Monitoring workspace is empty",
    emptyWorkspaceHint: "Open a section above to begin monitoring.",
    minimized: "Minimized windows",
    more: "More",
    restore: "Restore",
    minimize: "Minimize",
    maximize: "Maximize",
    close: "Close",
    alerts: "Alert center",
    active: "Ongoing",
    resolved: "Resolved",
    all: "All",
    general: "General — Fawri",
    merchant: "Merchant",
    started: "Started",
    resolvedAt: "Resolved",
    duration: "Duration",
    ongoing: "Ongoing now",
    historyUnavailable: "Incident lifecycle history is unavailable; current alerts are still visible.",
    affectedMerchants: "Affected merchants",
    monthlyKnownCost: "Known cost",
    projectedCost: "Projected month end",
    pricingCoverage: "Pricing coverage",
    pricingUnavailable: "Service prices are not configured. Real usage is shown without inventing a cost.",
    pricingPartial: "Only some services have configured rates; totals exclude unpriced services.",
    billingNotice: "Provider billing is not connected yet; visible cost is an operating estimate from explicitly configured rates.",
    dailyCost: "Known daily cost",
    dailyTokens: "Daily token usage",
    merchantReports: "Merchant usage reports",
    knownCost: "Known cost",
    outboundMessages: "Outbound messages",
    unpriced: "Unpriced",
    costReportUnavailable: "Usage and cost report is unavailable.",
    month: "Month",
    budget: "Monthly budget",
    budgetRemaining: "Budget remaining",
    budgetUsage: "Budget usage",
    previousMonth: "Previous month",
    connectedUsage: "Connected usage sources",
    disconnectedCosts: "Costs not connected yet",
    notConnected: "Not connected",
    actualBilling: "Actual billing",
    selectMerchant: "Merchant",
    tokenInput: "Input tokens",
    tokenOutput: "Output tokens",
    totalTokens: "Total tokens",
    dailyMerchantUsage: "Daily merchant usage",
    tokenShare: "Share of Fawri tokens",
    messageShare: "Share of Fawri messages",
    storageShare: "Share of Fawri storage",
    merchantReason: "Warning reason",
    noConnectedChannel: "No connected channel",
    channelErrors: "Recent channel errors",
    messageFailures: "Message failures",
    deadLetter: "DLQ jobs",
    uncertainDelivery: "Uncertain delivery",
    refundConflict: "Refund conflict",
    otp: "OTP delivery",
    databaseStorage: "PostgreSQL storage",
    networkTransfer: "Network transfer",
    objectStorage: "File/object storage outside support attachments",
    providerBilling: "Provider invoices",
    supportStorage: "Support attachment storage",
    addedAttachments: "Attachments added",
    messagesMetric: "Messages",
    storageMetric: "Storage",
    tokensMetric: "Tokens",
    costMetric: "Cost",
    statusFilter: "Status",
    scopeFilter: "Scope",
    severityFilter: "Severity",
    noActiveIncidents: "No ongoing incidents match the selected filters.",
    noResolvedIncidents: "No resolved incidents match the selected filters.",
    noMatchingIncidents: "No incidents match the selected filters.",
    noTokenData: "No token data is available for this month.",
    noMessageData: "No message data is available for this month.",
    noStorageData: "No daily storage data is available for this month.",
    noCostData: "No known daily cost is available for this month.",
    costPricingRequired: "Configure AI or messaging rates to show known daily cost.",
    reportingWindow: "This section reflects the selected monitoring window",
    monthlyScope: "This report is monthly and does not follow the hour/day filter above.",
    sortBy: "Rank merchants by",
    highestCost: "Highest cost",
    highestTokens: "Highest tokens",
    highestMessages: "Highest messages",
    highestStorage: "Highest storage",
    rank: "Rank",
    costs: "Usage & costs",
    provider: "Provider",
    model: "Model",
    calls: "Calls",
    tokens: "Tokens",
    hoursShort: "h",
    minutesShort: "m",
    secondsShort: "s",
  },
};
