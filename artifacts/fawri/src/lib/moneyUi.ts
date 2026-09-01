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

export function formatMerchantNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—';
  const digits = Number.isSafeInteger(fractionDigits)
    ? Math.min(6, Math.max(0, fractionDigits))
    : 0;
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function stableCurrencyToken(currency: string, lang: Lang): string {
  if (lang === 'en') return currency;

  // Catalog price containers intentionally use LTR so western digits stay in
  // familiar order. Arabic-script currency abbreviations are therefore forced
  // LTR independently; this preserves the literal visual label "د.ع" instead
  // of allowing the bidi algorithm to display it as "ع.د".
  return `\u202D${currency}\u202C`;
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
  const number = formatMerchantNumber(amount, digits);
  const currency = stableCurrencyToken(merchantCurrencyLabel(currencyCode, lang), lang);
  return `${number}\u00a0${currency}`;
}

export function formatMerchantIqd(amountIqd: number, lang: Lang = 'ar'): string {
  return formatMerchantMoneyMinor(amountIqd, 'IQD', 0, lang);
}
