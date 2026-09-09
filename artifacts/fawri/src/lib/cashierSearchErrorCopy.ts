import type { Lang } from './types';

export const CASHIER_SEARCH_ERROR_COPY: Record<Lang, string> = {
  ar: 'تعذر البحث في كتالوج الكاشير. حاول مرة أخرى.',
  ku: 'گەڕان لە کاتەلۆگی کاشێر سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.',
  en: 'Cashier catalog search failed. Try again.',
};

export const CASHIER_CATALOG_OPEN_ERROR_COPY: Record<Lang, string> = {
  ar: 'تعذر فتح كتالوج الكاشير على هذا الجهاز. أعد فتح الكاشير أو حاول المزامنة.',
  ku: 'کردنەوەی کاتەلۆگی کاشێر لەم ئامێرە سەرکەوتوو نەبوو. کاشێر دووبارە بکەرەوە یان هاوکاتکردن هەوڵ بدە.',
  en: 'The cashier catalog could not be opened on this device. Reopen the cashier or try syncing.',
};
