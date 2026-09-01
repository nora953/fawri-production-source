import type { Lang } from '@/lib/types';

function normalizedCurrency(currencyCode: string): string {
  const normalized = String(currencyCode || '').trim().toUpperCase();
  return normalized || 'IQD';
}

export function merchantCurrencyLabel(currencyCode: string, lang: Lang = 'ar'): string {
  const currency = normalizedCurrency(currencyCode);
  if (currency === 'IQD') return lang === 'en' ? 'IQD' : 'د.ع';
  return currency;
}

export function formatMerchantNumber(
  value: number,
  fractionDigits = 0,
  useGrouping = true,
): string {
  if (!Number.isFinite(value)) return '—';
  const digits = Number.isSafeInteger(fractionDigits)
    ? Math.min(6, Math.max(0, fractionDigits))
    : 0;
  return new Intl.NumberFormat('en-US', {
    useGrouping,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatMerchantMoneyMinor(
  amountMinor: number,
  currencyCode: string,
  fractionDigits: number,
  lang: Lang = 'ar',
): string {
  const digits = Number.isSafeInteger(fractionDigits)
    ? Math.min(6, Math.max(0, fractionDigits))
    : 0;
  const divisor = 10 ** digits;
  const amount = amountMinor / divisor;
  const currencyCodeNormalized = normalizedCurrency(currencyCode);
  const compactArabicIqd = currencyCodeNormalized === 'IQD' && lang !== 'en';
  const number = formatMerchantNumber(amount, digits, !compactArabicIqd);
  const currency = merchantCurrencyLabel(currencyCodeNormalized, lang);

  if (compactArabicIqd) {
    // Keep the western-digit amount first and the Arabic IQD label second even
    // inside LTR price nodes embedded in an RTL page. Isolating each run stops
    // the bidi algorithm from moving the currency token in front of the amount.
    return `\u2066${number}\u2069\u00a0\u2067${currency}\u2069`;
  }

  return `${number}\u00a0${currency}`;
}

export function formatMerchantIqd(amountIqd: number, lang: Lang = 'ar'): string {
  return formatMerchantMoneyMinor(amountIqd, 'IQD', 0, lang);
}
