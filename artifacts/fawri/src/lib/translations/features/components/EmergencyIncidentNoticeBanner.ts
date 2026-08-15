// Centralized localized copy extracted from components/EmergencyIncidentNoticeBanner.tsx.
// Keep runtime behavior in the source component; keep language copy here.

export const EMERGENCY_INCIDENT_NOTICE_BANNER_TEXT = {
  ar: {
    title: 'إشعار أمني مهم',
    summary: 'تم استخدام وصول طارئ للقراءة فقط إلى حساب متجرك.',
    body: 'تم استخدام وصول طارئ للقراءة فقط إلى حساب متجرك لمعالجة حادثة تقنية. لم يكن الوصول قادرًا على التعديل أو الإرسال أو الحذف.',
    reference: 'مرجع الحادثة',
    admin: 'المسؤول',
    started: 'بداية الوصول',
    ended: 'نهاية الوصول',
    showDetails: 'عرض التفاصيل',
    hideDetails: 'إخفاء التفاصيل',
    acknowledge: 'قرأت الإشعار',
    acknowledging: 'جارٍ التسجيل...',
  },
  ku: {
    title: 'ئاگادارییەکی گرنگی ئاسایش',
    summary: 'دەستگەیشتنی فریاکەوتنی تەنها خوێندنەوە بۆ هەژماری فرۆشگاکەت بەکارهێنرا.',
    body: 'بۆ چارەسەرکردنی ڕووداوێکی تەکنیکی، دەستگەیشتنی فریاکەوتنی تەنها خوێندنەوە بۆ هەژماری فرۆشگاکەت بەکارهێنرا. ئەم دەستگەیشتنە توانای دەستکاری، ناردن یان سڕینەوەی نەبوو.',
    reference: 'ژمارەی ڕووداو',
    admin: 'بەڕێوەبەر',
    started: 'دەستپێکی دەستگەیشتن',
    ended: 'کۆتایی دەستگەیشتن',
    showDetails: 'پیشاندانی وردەکارییەکان',
    hideDetails: 'شاردنەوەی وردەکارییەکان',
    acknowledge: 'ئاگادارییەکەم خوێندەوە',
    acknowledging: 'تۆمار دەکرێت...',
  },
  en: {
    title: 'Important security notice',
    summary: 'Emergency read-only access was used on your store account.',
    body: 'Emergency read-only access was used on your store account to handle a technical incident. The access could not edit, send, or delete anything.',
    reference: 'Incident reference',
    admin: 'Administrator',
    started: 'Access started',
    ended: 'Access ended',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    acknowledge: 'I have read this notice',
    acknowledging: 'Recording...',
  },
} as const;
