import type { Lang } from '@/lib/types';

export const CASHIER_LANGUAGE_OPTIONS: Array<{ id: Lang; label: string; title: string }> = [
  { id: 'ar', label: 'AR', title: 'العربية' },
  { id: 'ku', label: 'KU', title: 'کوردی' },
  { id: 'en', label: 'EN', title: 'English' },
];

export const CASHIER_LANGUAGE_SWITCHER_LABEL: Record<Lang, string> = {
  ar: 'تغيير لغة الكاشير',
  ku: 'گۆڕینی زمانی کاشێر',
  en: 'Change cashier language',
};
