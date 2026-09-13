import type { Lang } from '@/lib/types';

function normalizedCurrency(currencyCode: string): string {
  const normalized = String(currencyCode || '').trim().toUpperCase();
  return normalized || 'IQD';
}

export function merchantSafeFractionDigits(value: number): number {
  return Number.isSafeInteger(value) ? Math.min(6, Math.max(0, value)) : 0;
}

export function merchantMoneyMinorToMajorInput(
  minor: number,
  fractionDigits: number,
): string {
  const digits = merchantSafeFractionDigits(fractionDigits);
  if (!Number.isSafeInteger(minor) || minor < 0) return '';
  if (digits === 0) return String(minor);
  const scale = 10 ** digits;
  const whole = Math.floor(minor / scale);
  const fraction = String(minor % scale).padStart(digits, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function merchantMoneyMajorInputToMinor(
  value: string,
  fractionDigits: number,
): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const digits = merchantSafeFractionDigits(fractionDigits);
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > digits) return null;
  try {
    const scale = 10n ** BigInt(digits);
    const fractionPadded = digits === 0 ? '0' : fraction.padEnd(digits, '0');
    const minor = (BigInt(whole) * scale) + BigInt(fractionPadded || '0');
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(minor);
  } catch {
    return null;
  }
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
  const digits = merchantSafeFractionDigits(fractionDigits);
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
  const digits = merchantSafeFractionDigits(fractionDigits);
  const divisor = 10 ** digits;
  const amount = amountMinor / divisor;
  const currencyCodeNormalized = normalizedCurrency(currencyCode);
  const compactArabicIqd = currencyCodeNormalized === 'IQD' && lang !== 'en';
  const number = formatMerchantNumber(amount, digits, !compactArabicIqd);
  const currency = merchantCurrencyLabel(currencyCodeNormalized, lang);

  if (compactArabicIqd) {
    const arabicNumber = number.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
    return `${arabicNumber}\u00a0${currency}`;
  }

  return `${number}\u00a0${currency}`;
}

export function formatMerchantIqd(amountIqd: number, lang: Lang = 'ar'): string {
  return formatMerchantMoneyMinor(amountIqd, 'IQD', 0, lang);
}
