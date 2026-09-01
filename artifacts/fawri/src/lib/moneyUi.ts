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

function localizedMoneyToken(number: string, currency: string, lang: Lang): string {
  if (lang === 'en') return `${number}\u00a0${currency}`;

  // Arabic and Kurdish UIs are RTL. The price should read visually as
  // number first from the RTL reading edge, followed by the currency label:
  // 49,000 د.ع. Build a stable LTR-isolated token in visual order so existing
  // price containers cannot flip the two parts through bidi inheritance.
  return `\u2066${currency}\u00a0${number}\u2069`;
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
  const currency = merchantCurrencyLabel(currencyCode, lang);
  return localizedMoneyToken(number, currency, lang);
}

export function formatMerchantIqd(amountIqd: number, lang: Lang = 'ar'): string {
  return formatMerchantMoneyMinor(amountIqd, 'IQD', 0, lang);
}
