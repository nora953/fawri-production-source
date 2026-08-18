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

export function earlyWarningCoverageNote(
  language: SupportedLanguage,
  id: string,
  serverNote: string,
): string {
  return COVERAGE_COPY[language][id] || serverNote;
}
