type SupportedLanguage = "ar" | "ku" | "en";

const COVERAGE_COPY: Record<SupportedLanguage, Record<string, string>> = {
  ar: {
    postgresql: "لقطة PostgreSQL موثوقة من الخادم.",
    queue: "حالة المهام الدائمة وDLQ.",
    channels: "حالة القنوات والأحداث الواردة ونتائج الإرسال الخارجي.",
    bot_guardrails: "نتائج حتمية لسلامة المهام والإرسال والاسترجاعات.",
    ai_tokens: "يتم احتساب الرسائل التي تحتوي على بيانات استخدام صريحة من مزود AI فقط.",
    http_latency: "قياس محدود للعملية الحالية؛ التاريخ الدائم يحتاج مخزن Prometheus خارجي.",
    database_storage: "الحجم الفعلي لـPostgreSQL لكل تاجر غير مقاس بعد.",
    network_transfer: "مرجع الباندويث من مزود الاستضافة غير مربوط.",
    durable_object_storage: "ديمومة مرفقات الدعم ما زالت تعتمد على تفعيل تخزين كائنات إنتاجي.",
  },
  ku: {
    postgresql: "وێنەی دۆخی PostgreSQL لە سێرڤەرەوە بە شێوەی متمانەپێکراو وەردەگیرێت.",
    queue: "دۆخی کارە بەردەوامەکان و DLQ.",
    channels: "دۆخی کەناڵەکان، ڕووداوە هاتووەکان و ئەنجامی ناردنی دەرەکی.",
    bot_guardrails: "ئەنجامی دیاریکراوی پاراستنی کار، ناردن و گەڕاندنەوەکان.",
    ai_tokens: "تەنها ئەو نامانە هەژمار دەکرێن کە داتای ڕوونی بەکارهێنانی دابینکەری AIیان هەیە.",
    http_latency: "پێوانەی سنووردار بۆ پرۆسەی ئێستا؛ مێژووی هەمیشەیی پێویستی بە هەڵگرتنی Prometheusی دەرەکی هەیە.",
    database_storage: "قەبارەی فیزیکی PostgreSQL بۆ هەر فرۆشیارێک هێشتا پێوانە نەکراوە.",
    network_transfer: "سەرچاوەی باندویدثی دابینکەری میوانداری نەبەستراوە.",
    durable_object_storage: "بەردەوامی هاوپێچەکانی پشتگیری هێشتا پەیوەستە بە چالاککردنی object storageی بەرهەمهێنان.",
  },
  en: {
    postgresql: "Server-authoritative PostgreSQL snapshot.",
    queue: "Durable jobs and DLQ state.",
    channels: "Channel state, inbound events, and outbound delivery outcomes.",
    bot_guardrails: "Deterministic job, delivery, and refund safety outcomes.",
    ai_tokens: "Only messages with explicit AI-provider usage metadata are counted.",
    http_latency: "Current-process bounded telemetry; external Prometheus retention is required for durable history.",
    database_storage: "Per-merchant physical PostgreSQL storage is not measured yet.",
    network_transfer: "Hosting-provider bandwidth authority is not connected.",
    durable_object_storage: "Support attachment durability still depends on production object-storage activation.",
  },
};

const COVERAGE_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  ar: {
    postgresql: "PostgreSQL",
    queue: "الطابور والمهام",
    channels: "القنوات",
    bot_guardrails: "حماية منطق البوت",
    ai_tokens: "استخدام توكن AI",
    http_latency: "زمن استجابة HTTP",
    database_storage: "تخزين قاعدة البيانات",
    network_transfer: "نقل البيانات",
    durable_object_storage: "التخزين الدائم للمرفقات",
  },
  ku: {
    postgresql: "PostgreSQL",
    queue: "ڕیز و کارەکان",
    channels: "کەناڵەکان",
    bot_guardrails: "پاراستنی لۆژیکی بۆت",
    ai_tokens: "بەکارهێنانی تۆکنی AI",
    http_latency: "کاتی وەڵامی HTTP",
    database_storage: "هەڵگرتنی بنکەدراوە",
    network_transfer: "گواستنەوەی داتا",
    durable_object_storage: "هەڵگرتنی بەردەوامی هاوپێچەکان",
  },
  en: {
    postgresql: "PostgreSQL",
    queue: "Queue and jobs",
    channels: "Channels",
    bot_guardrails: "Bot safety",
    ai_tokens: "AI token usage",
    http_latency: "HTTP latency",
    database_storage: "Database storage",
    network_transfer: "Network transfer",
    durable_object_storage: "Durable attachment storage",
  },
};

const INCIDENT_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  ar: {
    DLQ_NONZERO: "توجد مهام في قائمة الرسائل الميتة (DLQ)",
    OUTBOUND_DELIVERY_UNCERTAIN: "توجد عمليات إرسال غير مؤكدة",
    OUTBOUND_DELIVERY_STUCK: "توجد عمليات إرسال عالقة",
    REPLY_REFUND_CONFLICT: "يوجد تعارض في استرجاع الاعتمادات",
    REPLY_RESERVATION_STALE: "توجد حجوزات رد عالقة",
    DANGEROUS_GUARDRAIL_EVENT: "تم رصد حدث حماية خطِر",
    CHANNEL_RECENT_ERRORS: "تم رصد أخطاء حديثة في القنوات",
    MESSAGE_FAILURES: "تم رصد رسائل فاشلة",
    HTTP_5XX_RATE_HIGH: "نسبة أخطاء الخادم 5xx مرتفعة",
    HTTP_P95_LATENCY_HIGH: "زمن استجابة API عند P95 مرتفع",
    AI_PROVIDER_ERROR_RATE_HIGH: "نسبة أخطاء مزود AI مرتفعة",
    AI_PROVIDER_LATENCY_HIGH: "زمن استجابة مزود AI مرتفع",
    AI_PROVIDER_TIMEOUTS: "تم رصد حالات انتهاء مهلة لدى مزود AI",
    HTTP_TELEMETRY_CAP_REACHED: "تم بلوغ حد بيانات مراقبة HTTP",
    AI_TELEMETRY_CAP_REACHED: "تم بلوغ حد بيانات مراقبة AI",
    MERCHANT_NO_CONNECTED_CHANNEL: "يوجد تاجر فعّال بلا قناة متصلة",
  },
  ku: {
    DLQ_NONZERO: "کار لە لیستی DLQدا هەیە",
    OUTBOUND_DELIVERY_UNCERTAIN: "ناردنی دەرچوو هەیە کە دۆخی دڵنیایی نییە",
    OUTBOUND_DELIVERY_STUCK: "ناردنی دەرچوو گیر کردووە",
    REPLY_REFUND_CONFLICT: "ناکۆکی لە گەڕاندنەوەی کرێدیت هەیە",
    REPLY_RESERVATION_STALE: "حجزی وەڵامی گیرکردوو هەیە",
    DANGEROUS_GUARDRAIL_EVENT: "ڕووداوێکی مەترسیداری پاراستن تۆمار کراوە",
    CHANNEL_RECENT_ERRORS: "هەڵەی نوێ لە کەناڵەکان تۆمار کراوە",
    MESSAGE_FAILURES: "نامەی شکستخواردوو تۆمار کراوە",
    HTTP_5XX_RATE_HIGH: "ڕێژەی هەڵەی 5xxی سێرڤەر بەرزە",
    HTTP_P95_LATENCY_HIGH: "کاتی وەڵامی API لە P95 بەرزە",
    AI_PROVIDER_ERROR_RATE_HIGH: "ڕێژەی هەڵەی دابینکەری AI بەرزە",
    AI_PROVIDER_LATENCY_HIGH: "کاتی وەڵامی دابینکەری AI بەرزە",
    AI_PROVIDER_TIMEOUTS: "کاتی چاوەڕوانی دابینکەری AI بەسەرچووە",
    HTTP_TELEMETRY_CAP_REACHED: "سنووری داتای چاودێری HTTP پڕ بووە",
    AI_TELEMETRY_CAP_REACHED: "سنووری داتای چاودێری AI پڕ بووە",
    MERCHANT_NO_CONNECTED_CHANNEL: "فرۆشیارێکی چالاک بێ کەناڵی پەیوەست هەیە",
  },
  en: {
    DLQ_NONZERO: "Jobs are present in the dead-letter queue (DLQ)",
    OUTBOUND_DELIVERY_UNCERTAIN: "Outbound deliveries have an uncertain outcome",
    OUTBOUND_DELIVERY_STUCK: "Outbound deliveries are stuck",
    REPLY_REFUND_CONFLICT: "A reply-credit refund conflict was detected",
    REPLY_RESERVATION_STALE: "Stale reply reservations were detected",
    DANGEROUS_GUARDRAIL_EVENT: "A dangerous safety event was detected",
    CHANNEL_RECENT_ERRORS: "Recent channel errors were detected",
    MESSAGE_FAILURES: "Failed messages were detected",
    HTTP_5XX_RATE_HIGH: "Server 5xx error rate is high",
    HTTP_P95_LATENCY_HIGH: "API P95 latency is high",
    AI_PROVIDER_ERROR_RATE_HIGH: "AI provider error rate is high",
    AI_PROVIDER_LATENCY_HIGH: "AI provider latency is high",
    AI_PROVIDER_TIMEOUTS: "AI provider timeouts were detected",
    HTTP_TELEMETRY_CAP_REACHED: "HTTP telemetry retention limit was reached",
    AI_TELEMETRY_CAP_REACHED: "AI telemetry retention limit was reached",
    MERCHANT_NO_CONNECTED_CHANNEL: "An active merchant has no connected channel",
  },
};

const INCIDENT_AREA_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  ar: {
    queue: "الطابور والمهام",
    channels: "القنوات والإرسال",
    credits: "الاعتمادات والاسترجاعات",
    bot_guardrails: "حماية منطق البوت",
    messaging: "الرسائل",
    merchant_channels: "قنوات التجار",
    http: "API وHTTP",
    ai: "الذكاء الاصطناعي",
    observability: "تغطية المراقبة",
  },
  ku: {
    queue: "ڕیز و کارەکان",
    channels: "کەناڵ و ناردن",
    credits: "کرێدیت و گەڕاندنەوە",
    bot_guardrails: "پاراستنی لۆژیکی بۆت",
    messaging: "نامەکان",
    merchant_channels: "کەناڵەکانی فرۆشیار",
    http: "API و HTTP",
    ai: "زیرەکی دەستکرد",
    observability: "داپۆشینی چاودێری",
  },
  en: {
    queue: "Queue and jobs",
    channels: "Channels and delivery",
    credits: "Credits and refunds",
    bot_guardrails: "Bot safety",
    messaging: "Messaging",
    merchant_channels: "Merchant channels",
    http: "API and HTTP",
    ai: "Artificial intelligence",
    observability: "Monitoring coverage",
  },
};

const GENERIC_LABELS: Record<SupportedLanguage, { coverage: string; incident: string; area: string }> = {
  ar: { coverage: "مصدر مراقبة", incident: "إنذار تشغيلي", area: "النظام" },
  ku: { coverage: "سەرچاوەی چاودێری", incident: "ئاگادارییەکی کارکردن", area: "سیستەم" },
  en: { coverage: "Monitoring source", incident: "Operational alert", area: "System" },
};

export function earlyWarningCoverageNote(
  language: SupportedLanguage,
  id: string,
  serverNote: string,
): string {
  return COVERAGE_COPY[language][id] || serverNote;
}

export function earlyWarningCoverageLabel(language: SupportedLanguage, id: string): string {
  return COVERAGE_LABELS[language][id] || GENERIC_LABELS[language].coverage;
}

export function earlyWarningIncidentLabel(language: SupportedLanguage, code: string): string {
  return INCIDENT_LABELS[language][code] || GENERIC_LABELS[language].incident;
}

export function earlyWarningIncidentAreaLabel(language: SupportedLanguage, area: string): string {
  return INCIDENT_AREA_LABELS[language][area] || GENERIC_LABELS[language].area;
}
