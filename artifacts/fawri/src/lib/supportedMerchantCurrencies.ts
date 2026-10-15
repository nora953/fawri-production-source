const PRIORITY_MERCHANT_CURRENCIES = [
  'IQD',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SAR',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
  'JOD',
  'TRY',
] as const;

// Current country/territory currencies for merchant pricing. Keep this aligned with
// the ISO 4217 Maintenance Agency current list. Fund, precious-metal, test, and
// withdrawn/historical codes are intentionally excluded from new merchant choices.
export const SUPPORTED_MERCHANT_CURRENCIES = [
  'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
  'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK',
  'DJF', 'DKK', 'DOP', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR',
  'FJD', 'FKP',
  'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
  'HKD', 'HNL', 'HTG', 'HUF',
  'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
  'JMD', 'JOD', 'JPY',
  'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
  'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
  'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
  'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
  'OMR',
  'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR',
  'RON', 'RSD', 'RUB', 'RWF',
  'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS',
  'UAH', 'UGX', 'USD', 'UYU', 'UZS',
  'VES', 'VND', 'VUV',
  'WST',
  'XAF', 'XCD', 'XCG', 'XOF', 'XPF',
  'YER',
  'ZAR', 'ZMW', 'ZWG',
] as const;

const prioritySet = new Set<string>(PRIORITY_MERCHANT_CURRENCIES);
const supportedSet = new Set<string>(SUPPORTED_MERCHANT_CURRENCIES);

const orderedSupportedCurrencies = [
  ...PRIORITY_MERCHANT_CURRENCIES,
  ...SUPPORTED_MERCHANT_CURRENCIES.filter(code => !prioritySet.has(code)),
] as readonly string[];

export function merchantCurrencyOptions(currentCurrency?: string | null): readonly string[] {
  const current = String(currentCurrency || '').normalize('NFKC').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(current) && !supportedSet.has(current)) {
    return [current, ...orderedSupportedCurrencies];
  }
  return orderedSupportedCurrencies;
}
