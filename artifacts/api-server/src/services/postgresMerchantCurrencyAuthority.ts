import {
  currencyFractionDigits,
  normalizeCurrencyCode,
} from "./currencyMoneyRuntime";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import type { MerchantCommerceContext } from "./postgresMerchantRegionalAuthority";

export class MerchantCurrencyAuthorityError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MerchantCurrencyAuthorityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type MerchantRow = {
  id: string;
  country_code: string;
  timezone: string;
  currency_code: string;
};

type CurrencyBlockerRow = {
  has_catalog: boolean;
  has_orders: boolean;
  has_promotions: boolean;
  has_delivery_money: boolean;
  has_delivery_area_rates: boolean;
};

function merchantId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 200) {
    throw new MerchantCurrencyAuthorityError(
      "MERCHANT_CURRENCY_TENANT_INVALID",
      "merchant identifier is invalid",
      400,
    );
  }
  return normalized;
}

function context(row: MerchantRow): MerchantCommerceContext {
  const currency = normalizeCurrencyCode(row.currency_code);
  return {
    country_code: String(row.country_code || "").trim().toUpperCase(),
    timezone: String(row.timezone || "").trim(),
    currency_code: currency,
    currency_fraction_digits: currencyFractionDigits(currency),
  };
}

export async function updateMerchantCurrencyAuthoritative(input: {
  merchantId: unknown;
  currencyCode: unknown;
}): Promise<{ context: MerchantCommerceContext; changed: boolean }> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new MerchantCurrencyAuthorityError(
      "MERCHANT_CURRENCY_POSTGRES_REQUIRED",
      "merchant currency update requires PostgreSQL authority",
      503,
    );
  }

  const tenantId = merchantId(input.merchantId);
  const nextCurrency = normalizeCurrencyCode(input.currencyCode);

  return withMerchantOperationalTransaction(tenantId, async client => {
    const identity = await operationalQueryRows<{ session_login: string }>(
      client, "SELECT session_user::text AS session_login",
    );
    const firstCommercial = identity.length === 1 &&
      identity[0].session_login === "fawri_restricted_runtime";
    const merchantRows = await operationalQueryRows<MerchantRow>(
      client,
      firstCommercial
        ? `SELECT id, country_code, timezone, currency_code
             FROM public.fawri_v1_scoped_merchant_region($1::text,true)`
        : `SELECT id, country_code, timezone, currency_code
             FROM merchants WHERE id = $1 FOR UPDATE`,
      [tenantId],
    );
    if (merchantRows.length !== 1) {
      throw new MerchantCurrencyAuthorityError(
        "MERCHANT_CURRENCY_CONTEXT_UNAVAILABLE",
        "merchant currency context is unavailable",
        404,
      );
    }

    const current = context(merchantRows[0]);
    if (current.currency_code === nextCurrency) {
      return { context: current, changed: false };
    }

    const blockerRows = await operationalQueryRows<CurrencyBlockerRow>(
      client,
      `SELECT
         EXISTS (SELECT 1 FROM products WHERE merchant_id = $1 LIMIT 1) AS has_catalog,
         EXISTS (SELECT 1 FROM orders WHERE merchant_id = $1 LIMIT 1) AS has_orders,
         EXISTS (SELECT 1 FROM commerce_promotions WHERE merchant_id = $1 LIMIT 1) AS has_promotions,
         EXISTS (
           SELECT 1
             FROM merchant_settings
            WHERE merchant_id = $1
              AND (delivery_fee_iqd <> 0 OR free_delivery_threshold_iqd IS NOT NULL)
            LIMIT 1
         ) AS has_delivery_money,
         EXISTS (
           SELECT 1
             FROM merchant_delivery_area_rates
            WHERE merchant_id = $1
            LIMIT 1
         ) AS has_delivery_area_rates`,
      [tenantId],
    );
    const blockers = blockerRows[0];
    if (!blockers) {
      throw new MerchantCurrencyAuthorityError(
        "MERCHANT_CURRENCY_GUARD_UNAVAILABLE",
        "merchant currency safety guard is unavailable",
        503,
      );
    }

    const activeBlockers = [
      blockers.has_catalog ? "catalog" : null,
      blockers.has_orders ? "orders" : null,
      blockers.has_promotions ? "promotions" : null,
      blockers.has_delivery_money ? "delivery_settings" : null,
      blockers.has_delivery_area_rates ? "delivery_area_rates" : null,
    ].filter((value): value is string => Boolean(value));

    if (activeBlockers.length > 0) {
      throw new MerchantCurrencyAuthorityError(
        "MERCHANT_CURRENCY_CHANGE_BLOCKED",
        "currency cannot be changed after monetary operational data exists; no automatic FX conversion is performed",
        409,
        {
          current_currency_code: current.currency_code,
          requested_currency_code: nextCurrency,
          blockers: activeBlockers,
        },
      );
    }

    // The V1 SECURITY DEFINER function re-checks monetary history inside
    // the same transaction. Direct callers may not bypass the API guard.
    let updated: MerchantRow[];
    try {
      updated = await operationalQueryRows<MerchantRow>(
        client,
        firstCommercial
          ? `SELECT id, country_code, timezone, currency_code
               FROM public.fawri_v1_update_scoped_merchant_currency(
                 $1::text,$2::text)`
          : `UPDATE merchants
               SET currency_code = $2, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING id, country_code, timezone, currency_code`,
        [tenantId, nextCurrency],
      );
    } catch (error) {
      if (firstCommercial &&
          (error as { code?: string })?.code === "23514" &&
          String((error as Error).message).includes(
            "V1_MERCHANT_CURRENCY_MONETARY_GUARD")) {
        throw new MerchantCurrencyAuthorityError(
          "MERCHANT_CURRENCY_CHANGE_BLOCKED",
          "currency cannot be changed after monetary operational data exists",
          409,
        );
      }
      throw error;
    }
    if (updated.length !== 1) {
      throw new MerchantCurrencyAuthorityError(
        "MERCHANT_CURRENCY_UPDATE_FAILED",
        "merchant currency update failed",
        503,
      );
    }

    return { context: context(updated[0]), changed: true };
  });
}
