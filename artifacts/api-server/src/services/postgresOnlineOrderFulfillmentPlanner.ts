import {
  routeOrderToLocationWithTarget,
  type LocationRoutingAuthorityError,
} from "./postgresLocationRoutingAuthority";
import {
  resolveServiceAreaWithTarget,
  type ServiceAreaResolutionReason,
} from "./postgresServiceAreaResolver";
import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import type {
  LocationRoutingDecision,
  RoutingRequestedItem,
} from "./locationRoutingEngine";
import type { DeliveryQuote } from "./deliveryPricing";

const DEFAULT_INVENTORY_FRESHNESS_MAX_AGE_MS = 5 * 60 * 1000;

export type OnlineOrderFulfillmentPlan =
  | {
      status: "delivery_unavailable";
      reason: ServiceAreaResolutionReason;
      delivery_quote: DeliveryQuote;
      eligible_location_ids: [];
    }
  | {
      status: "routing_ready";
      delivery_quote: DeliveryQuote;
      eligible_location_ids: string[];
      routing: LocationRoutingDecision;
    };

export class OnlineOrderFulfillmentPlannerError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OnlineOrderFulfillmentPlannerError";
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
    throw new OnlineOrderFulfillmentPlannerError(
      "ONLINE_ORDER_ROUTING_IDENTIFIER_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new OnlineOrderFulfillmentPlannerError(
      "ONLINE_ORDER_ROUTING_INTEGER_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return parsed;
}

function positiveAge(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_INVENTORY_FRESHNESS_MAX_AGE_MS;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 24 * 60 * 60 * 1000) {
    throw new OnlineOrderFulfillmentPlannerError(
      "ONLINE_ORDER_ROUTING_FRESHNESS_AGE_INVALID",
      "inventory freshness maximum age is invalid",
      400,
    );
  }
  return parsed;
}

function nowInstant(value: unknown): Date {
  if (value === undefined || value === null || value === "") return new Date();
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new OnlineOrderFulfillmentPlannerError(
      "ONLINE_ORDER_ROUTING_NOW_INVALID",
      "routing clock is invalid",
      400,
    );
  }
  return parsed;
}

export async function planOnlineOrderFulfillmentWithTarget(
  target: OperationalQueryTarget,
  params: {
    merchantId: unknown;
    area?: unknown;
    subtotalIqd?: unknown;
    requestedItems: readonly RoutingRequestedItem[];
    customerLatitude?: unknown;
    customerLongitude?: unknown;
    inventoryFreshnessMaxAgeMs?: unknown;
    now?: unknown;
  },
): Promise<OnlineOrderFulfillmentPlan> {
  const merchantId = identifier(params.merchantId, "merchant_id", 128);
  const subtotalIqd = nonNegativeInteger(params.subtotalIqd ?? 0, "subtotal_iqd");
  const serviceArea = await resolveServiceAreaWithTarget(target, {
    merchantId,
    area: params.area,
    subtotalIqd,
  });

  if (!serviceArea.available) {
    return {
      status: "delivery_unavailable",
      reason:
        serviceArea.reason ||
        (serviceArea.pricing_mode === "per_area"
          ? "area_unavailable"
          : "no_fulfillment_locations"),
      delivery_quote: serviceArea.delivery_quote,
      eligible_location_ids: [],
    };
  }

  const now = nowInstant(params.now);
  const freshnessMaxAgeMs = positiveAge(params.inventoryFreshnessMaxAgeMs);
  const freshnessCutoff = new Date(now.getTime() - freshnessMaxAgeMs);

  const routing = await routeOrderToLocationWithTarget(target, {
    merchantId,
    requestedItems: params.requestedItems,
    eligibleLocationIds: serviceArea.eligible_location_ids,
    inventoryFreshAfter: freshnessCutoff,
    customerLatitude: params.customerLatitude,
    customerLongitude: params.customerLongitude,
  });

  return {
    status: "routing_ready",
    delivery_quote: serviceArea.delivery_quote,
    eligible_location_ids: serviceArea.eligible_location_ids,
    routing,
  };
}

export async function planOnlineOrderFulfillmentAuthoritative(params: {
  merchantId: unknown;
  area?: unknown;
  subtotalIqd?: unknown;
  requestedItems: readonly RoutingRequestedItem[];
  customerLatitude?: unknown;
  customerLongitude?: unknown;
  inventoryFreshnessMaxAgeMs?: unknown;
}): Promise<OnlineOrderFulfillmentPlan> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OnlineOrderFulfillmentPlannerError(
      "ONLINE_ORDER_ROUTING_POSTGRES_REQUIRED",
      "online order fulfillment routing requires PostgreSQL authority",
      503,
    );
  }
  const merchantId = identifier(params.merchantId, "merchant_id", 128);
  return withMerchantOperationalTransaction(merchantId, (client) =>
    planOnlineOrderFulfillmentWithTarget(client, {
      ...params,
      merchantId,
    }),
  );
}
