import type { Lang } from '@/lib/types';

/**
 * Canonical shared UI vocabulary.
 *
 * Keep stable technical labels and native language names here instead of
 * scattering them through pages/components. Localized feature copy should stay
 * in the owning feature dictionary.
 */
export const COMMON_UI_LABELS = {
  languageNames: {
    ar: 'العربية',
    ku: 'کوردی',
    en: 'English',
  },
  technical: {
    sku: 'SKU',
    barcode: 'Barcode',
    skuExample: 'SKU-001',
    unitKg: 'kg',
    unitCm: 'cm',
  },
} as const;

export const COMMON_UI_COPY: Record<Lang, { all: string; auto: string }> = {
  ar: {
    all: 'الكل',
    auto: 'تلقائي',
  },
  ku: {
    all: 'هەموو',
    auto: 'خۆکار',
  },
  en: {
    all: 'All',
    auto: 'Auto',
  },
};
