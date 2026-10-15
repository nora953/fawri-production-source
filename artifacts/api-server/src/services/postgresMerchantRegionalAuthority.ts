import {
  currencyFractionDigits,
  normalizeCurrencyCode,
} from "./currencyMoneyRuntime";
import {
  normalizeMerchantCountryCode,
  normalizeMerchantTimezone,
  type MerchantRegionalProfile,
} from "./merchantRegionalRuntime";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";

export type MerchantCommerceContext = MerchantRegionalProfile & {
  currency_fraction_digits: number;
};

type MerchantRegionalRow = {
  id: string;
  country_code: string;
  timezone: string;
  currency_code: string;
};

export class MerchantCommerceContextError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MerchantCommerceContextError";
    this.code = code;
    this.status = status;
  }
}

export async function getMerchantCommerceContextAuthoritative(
  merchantIdValue: unknown,
): Promise<MerchantCommerceContext> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new MerchantCommerceContextError(
      "MERCHANT_COMMERCE_POSTGRES_REQUIRED",
      "merchant commerce context requires PostgreSQL authority",
      503,
    );
  }
  const merchantId = String(merchantIdValue ?? "").trim();
  if (!merchantId || merchantId.length > 200) {
    throw new MerchantCommerceContextError(
      "MERCHANT_COMMERCE_ID_INVALID",
      "merchant identifier is invalid",
      400,
    );
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const rows = await operationalQueryRows<MerchantRegionalRow>(
      client,
      `SELECT id, country_code, timezone, currency_code
         FROM merchants
        WHERE id = $1
        LIMIT 2`,
      [merchantId],
    );
    if (rows.length !== 1) {
      throw new MerchantCommerceContextError(
        "MERCHANT_COMMERCE_CONTEXT_UNAVAILABLE",
        "merchant commerce context is unavailable",
        404,
      );
    }
    const country = normalizeMerchantCountryCode(rows[0].country_code);
    const timezone = normalizeMerchantTimezone(rows[0].timezone);
    const currency = normalizeCurrencyCode(rows[0].currency_code);
    return {
      country_code: country,
      timezone,
      currency_code: currency,
      currency_fraction_digits: currencyFractionDigits(currency),
    };
  });
}
