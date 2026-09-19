import {
  DeliveryPricingPolicyError,
  resolveDeliveryQuote,
  type DeliveryAreaRate,
  type DeliveryPricingMode,
  type DeliveryPricingPolicy,
  type DeliveryQuote,
  type DeliveryQuoteReason,
} from "./deliveryPricing";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type SettingsRow = {
  merchant_id: string;
  version: number;
  delivery_enabled: boolean;
  delivery_pricing_mode: DeliveryPricingMode;
  delivery_fee_iqd: number;
  free_delivery_threshold_iqd: number | null;
  delivery_estimated_days_min: number;
  delivery_estimated_days_max: number;
  delivery_areas: unknown;
};

type AreaRateRow = {
  id: string;
  merchant_id: string;
  area_name: string;
  normalized_area_name: string;
  fee_iqd: number;
  enabled: boolean;
};

type LocationRow = {
  id: string;
  merchant_id: string;
};

type MappingRow = {
  merchant_id: string;
  location_id: string;
  delivery_area_rate_id: string;
};

export type ServiceAreaResolutionReason =
  | DeliveryQuoteReason
  | "area_not_assigned_to_location"
  | "no_fulfillment_locations";

export type ServiceAreaResolution = {
  merchant_id: string;
  available: boolean;
  pricing_mode: DeliveryPricingMode;
  requested_area: string;
  matched_area?: string;
  delivery_area_rate_id?: string;
  eligible_location_ids: string[];
  reason?: ServiceAreaResolutionReason;
  delivery_quote: DeliveryQuote;
};

export class ServiceAreaResolverError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ServiceAreaResolverError";
    this.code = code;
    this.status = status;
  }
}

function identifier(value: unknown, field: string, max = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new ServiceAreaResolverError(
      "SERVICE_AREA_IDENTIFIER_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return normalized;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").normalize("NFKC").trim())
    .filter(Boolean)
    .slice(0, 100);
}

function tenantRow(
  rowMerchantId: unknown,
  merchantId: string,
  label: string,
): void {
  if (identifier(rowMerchantId, "merchant_id", 128) !== merchantId) {
    throw new ServiceAreaResolverError(
      "SERVICE_AREA_TENANT_VIOLATION",
      `${label} crossed merchant tenant boundary`,
      500,
    );
  }
}

function defaultPolicy(merchantId: string): DeliveryPricingPolicy {
  return {
    merchant_id: merchantId,
    settings_version: 1,
    enabled: true,
    pricing_mode: "flat",
    flat_fee_iqd: 0,
    free_delivery_threshold_iqd: null,
    estimated_days_min: 1,
    estimated_days_max: 3,
    areas: [],
    area_rates: [],
  };
}

async function loadPolicy(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<DeliveryPricingPolicy> {
  const settingsRows = await operationalQueryRows<SettingsRow>(
    target,
    `SELECT merchant_id, version, delivery_enabled, delivery_pricing_mode,
            delivery_fee_iqd, free_delivery_threshold_iqd,
            delivery_estimated_days_min, delivery_estimated_days_max,
            delivery_areas
       FROM merchant_settings
      WHERE merchant_id = $1
      LIMIT 1`,
    [merchantId],
  );

  if (settingsRows.length === 0) return defaultPolicy(merchantId);
  const settings = settingsRows[0];
  tenantRow(settings.merchant_id, merchantId, "merchant settings");

  const rateRows = await operationalQueryRows<AreaRateRow>(
    target,
    `SELECT id, merchant_id, area_name, normalized_area_name, fee_iqd, enabled
       FROM merchant_delivery_area_rates
      WHERE merchant_id = $1
      ORDER BY normalized_area_name, id`,
    [merchantId],
  );

  const areaRates: DeliveryAreaRate[] = rateRows.map((row) => {
    tenantRow(row.merchant_id, merchantId, "delivery area rate");
    return {
      id: identifier(row.id, "delivery_area_rate_id", 160),
      area_name: String(row.area_name ?? "").normalize("NFKC").trim(),
      normalized_area_name: String(row.normalized_area_name ?? "")
        .normalize("NFKC")
        .trim(),
      fee_iqd: Number(row.fee_iqd),
      enabled: Boolean(row.enabled),
    };
  });

  return {
    merchant_id: merchantId,
    settings_version: Number(settings.version),
    enabled: Boolean(settings.delivery_enabled),
    pricing_mode: settings.delivery_pricing_mode,
    flat_fee_iqd: Number(settings.delivery_fee_iqd),
    free_delivery_threshold_iqd:
      settings.free_delivery_threshold_iqd === null
        ? null
        : Number(settings.free_delivery_threshold_iqd),
    estimated_days_min: Number(settings.delivery_estimated_days_min),
    estimated_days_max: Number(settings.delivery_estimated_days_max),
    areas: parseStringArray(settings.delivery_areas),
    area_rates: areaRates,
  };
}

async function flatEligibleLocations(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<string[]> {
  const rows = await operationalQueryRows<LocationRow>(
    target,
    `SELECT id, merchant_id
       FROM merchant_locations
      WHERE merchant_id = $1
      ORDER BY id
      LIMIT 250`,
    [merchantId],
  );
  return rows.map((row) => {
    tenantRow(row.merchant_id, merchantId, "merchant location");
    return identifier(row.id, "location_id", 160);
  });
}

async function mappedEligibleLocations(
  target: OperationalQueryTarget,
  merchantId: string,
  areaRateId: string,
): Promise<string[]> {
  const rows = await operationalQueryRows<MappingRow>(
    target,
    `SELECT mapping.merchant_id, mapping.location_id,
            mapping.delivery_area_rate_id
       FROM merchant_location_delivery_areas AS mapping
       JOIN merchant_locations AS location
         ON location.id = mapping.location_id
        AND location.merchant_id = mapping.merchant_id
      WHERE mapping.merchant_id = $1
        AND mapping.delivery_area_rate_id = $2
      ORDER BY mapping.location_id
      LIMIT 250`,
    [merchantId, areaRateId],
  );

  return rows.map((row) => {
    tenantRow(row.merchant_id, merchantId, "location delivery area mapping");
    if (identifier(row.delivery_area_rate_id, "delivery_area_rate_id", 160) !== areaRateId) {
      throw new ServiceAreaResolverError(
        "SERVICE_AREA_MAPPING_INVALID",
        "delivery area mapping does not match resolved area",
        500,
      );
    }
    return identifier(row.location_id, "location_id", 160);
  });
}

export async function resolveServiceAreaWithTarget(
  target: OperationalQueryTarget,
  params: {
    merchantId: unknown;
    area?: unknown;
    subtotalIqd?: unknown;
  },
): Promise<ServiceAreaResolution> {
  const merchantId = identifier(params.merchantId, "merchant_id", 128);
  const policy = await loadPolicy(target, merchantId);

  let quote: DeliveryQuote;
  try {
    quote = resolveDeliveryQuote({
      policy,
      area: params.area,
      subtotal_iqd: params.subtotalIqd ?? 0,
    });
  } catch (error) {
    if (error instanceof DeliveryPricingPolicyError) {
      throw new ServiceAreaResolverError(
        "SERVICE_AREA_DELIVERY_POLICY_INVALID",
        "merchant delivery policy is invalid",
        503,
      );
    }
    throw error;
  }

  if (!quote.available) {
    return {
      merchant_id: merchantId,
      available: false,
      pricing_mode: policy.pricing_mode,
      requested_area: quote.requested_area,
      eligible_location_ids: [],
      ...(quote.reason ? { reason: quote.reason } : {}),
      delivery_quote: quote,
    };
  }

  if (policy.pricing_mode === "flat") {
    const eligibleLocationIds = await flatEligibleLocations(target, merchantId);
    return {
      merchant_id: merchantId,
      available: eligibleLocationIds.length > 0,
      pricing_mode: policy.pricing_mode,
      requested_area: quote.requested_area,
      eligible_location_ids: eligibleLocationIds,
      ...(eligibleLocationIds.length === 0
        ? { reason: "no_fulfillment_locations" as const }
        : {}),
      delivery_quote: quote,
    };
  }

  const areaRateId = quote.area_rate_id
    ? identifier(quote.area_rate_id, "delivery_area_rate_id", 160)
    : "";
  if (!areaRateId) {
    throw new ServiceAreaResolverError(
      "SERVICE_AREA_RATE_MISSING",
      "resolved per-area delivery quote has no canonical area rate",
      500,
    );
  }

  const eligibleLocationIds = await mappedEligibleLocations(
    target,
    merchantId,
    areaRateId,
  );
  return {
    merchant_id: merchantId,
    available: eligibleLocationIds.length > 0,
    pricing_mode: policy.pricing_mode,
    requested_area: quote.requested_area,
    ...(quote.matched_area ? { matched_area: quote.matched_area } : {}),
    delivery_area_rate_id: areaRateId,
    eligible_location_ids: eligibleLocationIds,
    ...(eligibleLocationIds.length === 0
      ? { reason: "area_not_assigned_to_location" as const }
      : {}),
    delivery_quote: quote,
  };
}

export async function resolveServiceAreaAuthoritative(params: {
  merchantId: unknown;
  area?: unknown;
  subtotalIqd?: unknown;
}): Promise<ServiceAreaResolution> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new ServiceAreaResolverError(
      "SERVICE_AREA_POSTGRES_REQUIRED",
      "service area routing requires PostgreSQL authority",
      503,
    );
  }
  const merchantId = identifier(params.merchantId, "merchant_id", 128);
  return withMerchantOperationalTransaction(merchantId, (client) =>
    resolveServiceAreaWithTarget(client, {
      ...params,
      merchantId,
    }),
  );
}
