export type MerchantRegionalDefault = {
  countryCode: string;
  callingCode: string;
  currencyCode: string;
  timezone: string;
};

/**
 * Only keep defaults that are deliberately safe for legacy/non-interactive
 * callers. The global signup UI sends country, currency and browser-resolved
 * IANA timezone explicitly, so the server never needs to guess for other
 * countries.
 */
export const MERCHANT_REGIONAL_DEFAULTS: readonly MerchantRegionalDefault[] = [
  {
    countryCode: 'IQ',
    callingCode: '+964',
    currencyCode: 'IQD',
    timezone: 'Asia/Baghdad',
  },
];

export const MERCHANT_REGIONAL_DEFAULT_BY_COUNTRY = new Map(
  MERCHANT_REGIONAL_DEFAULTS.map(option => [option.countryCode, option]),
);
