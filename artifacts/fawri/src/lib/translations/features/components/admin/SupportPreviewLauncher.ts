// Centralized localized copy extracted from components/admin/SupportPreviewLauncher.tsx.
// Keep runtime behavior in the source component; keep language copy here.

export const SUPPORT_PREVIEW_LAUNCHER_TEXT = {
  ar: {
    title: "جلسة قراءة معتمدة",
    body: "وافق التاجر على جلسة فحص مستقلة للقراءة فقط.",
    open: "بدء جلسة القراءة",
    opening: "جارٍ فتح الجلسة...",
    error: "تعذر بدء جلسة القراءة.",
    ended: "انتهت جلسة القراءة وتم إيقاف الوصول.",
    endedByMerchant: "أنهى التاجر جلسة القراءة. تم إيقاف الوصول فورًا.",
  },
  ku: {
    title: "دانیشتنی خوێندنەوە پەسەند کرا",
    body: "بازرگان ڕەزامەندی لەسەر پشکنینی سەربەخۆی تەنها خوێندنەوە دا.",
    open: "دەستپێکردنی دانیشتنی خوێندنەوە",
    opening: "دانیشتن دەکرێتەوە...",
    error: "دەستپێکردنی دانیشتن سەرکەوتوو نەبوو.",
    ended: "دانیشتنی خوێندنەوە کۆتایی هات و دەستگەیشتن وەستێنرا.",
    endedByMerchant: "بازرگان دانیشتنی خوێندنەوەی کۆتایی پێهێنا. دەستگەیشتن دەستبەجێ وەستێنرا.",
  },
  en: {
    title: "Approved read-only session",
    body: "The merchant approved an independent read-only inspection.",
    open: "Start read-only session",
    opening: "Opening session...",
    error: "Could not start the read-only session.",
    ended: "The read-only session ended and access was stopped.",
    endedByMerchant: "The merchant ended the read-only session. Access was stopped immediately.",
  },
} as const;
