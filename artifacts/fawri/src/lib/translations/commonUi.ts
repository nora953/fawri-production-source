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

type CommonUiCopy = {
  all: string;
  auto: string;
  channelSubscribed: string;
  channelNotSubscribed: string;
  credentialConfigured: string;
  credentialRemoved: string;
  disconnectingChannel: string;
  disconnectChannel: string;
};

export const COMMON_UI_COPY: Record<Lang, CommonUiCopy> = {
  ar: {
    all: 'الكل',
    auto: 'تلقائي',
    channelSubscribed: 'مشترك',
    channelNotSubscribed: 'غير مشترك',
    credentialConfigured: 'مهيأ',
    credentialRemoved: 'محذوف',
    disconnectingChannel: 'جارٍ فصل القناة…',
    disconnectChannel: 'فصل القناة',
  },
  ku: {
    all: 'هەموو',
    auto: 'خۆکار',
    channelSubscribed: 'بەشدارە',
    channelNotSubscribed: 'بەشدار نییە',
    credentialConfigured: 'ڕێکخراوە',
    credentialRemoved: 'سڕاوەتەوە',
    disconnectingChannel: 'کەناڵەکە دادەبڕدرێت…',
    disconnectChannel: 'پچڕاندنی کەناڵ',
  },
  en: {
    all: 'All',
    auto: 'Auto',
    channelSubscribed: 'Subscribed',
    channelNotSubscribed: 'Not subscribed',
    credentialConfigured: 'Configured',
    credentialRemoved: 'Removed',
    disconnectingChannel: 'Disconnecting…',
    disconnectChannel: 'Disconnect channel',
  },
};
