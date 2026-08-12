import type { Lang } from '@/lib/types';

/**
 * Canonical shared UI vocabulary.
 *
 * Keep stable technical labels, native language names, invariant product units,
 * and global legal/runtime labels here instead of scattering them through
 * pages/components. Localized feature copy should stay in the owning feature
 * dictionary.
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
    currencyIqd: 'IQD',
    webhook: 'Webhook',
    encryptedToken: 'Encrypted token',
  },
  legal: {
    copyright: '© 2026 Fawri. All rights reserved.',
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
