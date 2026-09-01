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

function stabilizeLocalizedMoneyOrder(value: string, lang: Lang): string {
  // Arabic and Kurdish pages are RTL, while merchant money is intentionally
  // displayed number-first (for example: 49,000 د.ع). Isolate the complete
  // money token as LTR so the browser bidi algorithm cannot move the currency
  // label in front of the number. English keeps its existing output unchanged.
  return lang === 'en' ? value : `\u2066${value}\u2069`;
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
  return stabilizeLocalizedMoneyOrder(`${number}\u00a0${currency}`, lang);
}

export function formatMerchantIqd(amountIqd: number, lang: Lang = 'ar'): string {
  return formatMerchantMoneyMinor(amountIqd, 'IQD', 0, lang);
}
