import { CatalogRuntimeError, type CatalogProduct } from "./catalogInventoryRuntime";

export type CatalogItemType = "product" | "service";
export type CatalogServicePriceType = "fixed" | "from" | "free" | "custom";
export type CatalogServiceLocationMode =
  | "merchant"
  | "customer"
  | "online"
  | "flexible";

export type CatalogServiceDetails = {
  duration_minutes?: number;
  buffer_minutes: number;
  booking_required: boolean;
  price_type: CatalogServicePriceType;
  location_mode: CatalogServiceLocationMode;
};

export type CatalogCommerceFields = {
  item_type: CatalogItemType;
  track_inventory: boolean;
  service_details?: CatalogServiceDetails;
  /** Merchant-private reporting cost. It must never be used in customer facts. */
  cost_iqd?: number;
  /** Merchant-private variant costs keyed by canonical variant signature. */
  variant_costs_iqd?: Record<string, number>;
};

export type CatalogCommerceVariant = CatalogProduct["variants"][number] & {
  cost_iqd?: number;
};

export type CatalogCommerceProduct = Omit<CatalogProduct, "variants"> &
  Omit<CatalogCommerceFields, "variant_costs_iqd"> & {
    variants: CatalogCommerceVariant[];
  };

const METADATA_KEY = "fawri_catalog_v2";
const MAX_REPORTING_COST_IQD = 1_000_000_000_000;
const ITEM_TYPES = new Set<CatalogItemType>(["product", "service"]);
const SERVICE_PRICE_TYPES = new Set<CatalogServicePriceType>([
  "fixed",
  "from",
  "free",
  "custom",
]);
const SERVICE_LOCATION_MODES = new Set<CatalogServiceLocationMode>([
  "merchant",
  "customer",
  "online",
  "flexible",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizedText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new CatalogRuntimeError(
    "CATALOG_BOOLEAN_INVALID",
    "boolean value is invalid",
    400,
  );
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  fallback?: number,
): number | undefined {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CatalogRuntimeError(
      "CATALOG_SERVICE_FIELD_INVALID",
      `${field} must be an integer between ${minimum} and ${maximum}`,
      400,
      { field, minimum, maximum },
    );
  }
  return parsed;
}

function reportingCost(
  value: unknown,
  field: string,
  options: { fallback?: number; persisted?: boolean } = {},
): number | undefined {
  if (value === undefined) return options.fallback;
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_REPORTING_COST_IQD
  ) {
    throw new CatalogRuntimeError(
      options.persisted
        ? "CATALOG_REPORTING_COST_STATE_INVALID"
        : "CATALOG_REPORTING_COST_INVALID",
      options.persisted
        ? "catalog reporting cost state is invalid"
        : `${field} must be a valid non-negative IQD amount`,
      options.persisted ? 503 : 400,
      { field, max: MAX_REPORTING_COST_IQD },
    );
  }
  return parsed;
}

function itemType(value: unknown, fallback: CatalogItemType): CatalogItemType {
  const normalized = normalizedText(value || fallback) as CatalogItemType;
  if (!ITEM_TYPES.has(normalized)) {
    throw new CatalogRuntimeError(
      "CATALOG_ITEM_TYPE_INVALID",
      "item_type must be product or service",
      400,
      { item_type: normalized },
    );
  }
  return normalized;
}

function servicePriceType(
  value: unknown,
  fallback: CatalogServicePriceType,
): CatalogServicePriceType {
  const normalized = normalizedText(value || fallback) as CatalogServicePriceType;
  if (!SERVICE_PRICE_TYPES.has(normalized)) {
    throw new CatalogRuntimeError(
      "CATALOG_SERVICE_PRICE_TYPE_INVALID",
      "service price_type is invalid",
      400,
      { price_type: normalized },
    );
  }
  return normalized;
}

function serviceLocationMode(
  value: unknown,
  fallback: CatalogServiceLocationMode,
): CatalogServiceLocationMode {
  const normalized = normalizedText(value || fallback) as CatalogServiceLocationMode;
  if (!SERVICE_LOCATION_MODES.has(normalized)) {
    throw new CatalogRuntimeError(
      "CATALOG_SERVICE_LOCATION_INVALID",
      "service location_mode is invalid",
      400,
      { location_mode: normalized },
    );
  }
  return normalized;
}

function variantSignature(value: unknown): string {
  const variant = record(value);
  const options = record(variant.options);
  const entries = Object.entries(options)
    .map(([name, optionValue]) =>
      `${normalizedText(name)}=${normalizedText(optionValue)}`,
    )
    .filter((entry) => entry !== "=")
    .sort();
  if (entries.length > 0) return entries.join("|");
  const name = normalizedText(variant.name);
  return name ? `name=${name}` : "";
}

function variantCostsFromStored(value: unknown): Record<string, number> {
  const raw = record(value);
  const entries = Object.entries(raw);
  if (entries.length > 100) {
    throw new CatalogRuntimeError(
      "CATALOG_REPORTING_COST_STATE_INVALID",
      "catalog variant reporting cost state is invalid",
      503,
    );
  }
  const costs: Record<string, number> = {};
  for (const [signature, rawCost] of entries) {
    if (!signature || signature.length > 1_000) {
      throw new CatalogRuntimeError(
        "CATALOG_REPORTING_COST_STATE_INVALID",
        "catalog variant reporting cost signature is invalid",
        503,
      );
    }
    const cost = reportingCost(rawCost, "variant.cost_iqd", { persisted: true });
    if (cost !== undefined) costs[signature] = cost;
  }
  return costs;
}

function variantCostsFromInput(
  input: Record<string, unknown>,
  existing: Record<string, number>,
): Record<string, number> {
  if (!hasOwn(input, "variants")) return { ...existing };
  if (!Array.isArray(input.variants)) return {};
  const next: Record<string, number> = {};
  for (const rawVariant of input.variants) {
    const variant = record(rawVariant);
    const signature = variantSignature(variant);
    if (!signature) continue;
    const cost = hasOwn(variant, "cost_iqd")
      ? reportingCost(variant.cost_iqd, "variant.cost_iqd")
      : existing[signature];
    if (cost !== undefined) next[signature] = cost;
  }
  return next;
}

export function defaultCatalogCommerceFields(): CatalogCommerceFields {
  return {
    item_type: "product",
    track_inventory: true,
  };
}

export function catalogCommerceFromMetadata(metadataValue: unknown): CatalogCommerceFields {
  const metadata = record(metadataValue);
  const stored = record(metadata[METADATA_KEY]);
  if (Object.keys(stored).length === 0) return defaultCatalogCommerceFields();

  const resolvedItemType = itemType(stored.item_type, "product");
  const resolvedTrackInventory =
    resolvedItemType === "service"
      ? false
      : booleanValue(stored.track_inventory, true);
  const cost = reportingCost(stored.cost_iqd, "cost_iqd", { persisted: true });
  const variantCosts = variantCostsFromStored(stored.variant_costs_iqd);
  const reportingFields = {
    ...(cost !== undefined ? { cost_iqd: cost } : {}),
    ...(Object.keys(variantCosts).length > 0
      ? { variant_costs_iqd: variantCosts }
      : {}),
  };

  if (resolvedItemType !== "service") {
    return {
      item_type: resolvedItemType,
      track_inventory: resolvedTrackInventory,
      ...reportingFields,
    };
  }

  const rawService = record(stored.service_details);
  const duration = boundedInteger(
    rawService.duration_minutes,
    "service_details.duration_minutes",
    1,
    1_440,
  );

  return {
    item_type: "service",
    track_inventory: false,
    service_details: {
      ...(duration !== undefined ? { duration_minutes: duration } : {}),
      buffer_minutes:
        boundedInteger(
          rawService.buffer_minutes,
          "service_details.buffer_minutes",
          0,
          480,
          0,
        ) ?? 0,
      booking_required: booleanValue(rawService.booking_required, true),
      price_type: servicePriceType(rawService.price_type, "fixed"),
      location_mode: serviceLocationMode(rawService.location_mode, "merchant"),
    },
    ...reportingFields,
  };
}

export function normalizeCatalogCommerceInput(
  inputValue: unknown,
  existing?: CatalogCommerceFields,
): CatalogCommerceFields {
  const input = record(inputValue);
  const fallback = existing || defaultCatalogCommerceFields();
  const resolvedItemType = hasOwn(input, "item_type")
    ? itemType(input.item_type, fallback.item_type)
    : fallback.item_type;
  const cost = hasOwn(input, "cost_iqd")
    ? reportingCost(input.cost_iqd, "cost_iqd")
    : fallback.cost_iqd;
  const variantCosts =
    resolvedItemType === "service"
      ? {}
      : variantCostsFromInput(input, fallback.variant_costs_iqd || {});
  const reportingFields = {
    ...(cost !== undefined ? { cost_iqd: cost } : {}),
    ...(Object.keys(variantCosts).length > 0
      ? { variant_costs_iqd: variantCosts }
      : {}),
  };

  const requestedTrackInventory = hasOwn(input, "track_inventory")
    ? booleanValue(input.track_inventory, fallback.track_inventory)
    : resolvedItemType === "service"
      ? false
      : fallback.track_inventory;

  if (resolvedItemType === "service" && requestedTrackInventory) {
    throw new CatalogRuntimeError(
      "CATALOG_SERVICE_INVENTORY_UNSUPPORTED",
      "services do not use inventory tracking; booking capacity is managed separately",
      400,
    );
  }

  if (resolvedItemType === "product") {
    return {
      item_type: "product",
      track_inventory: requestedTrackInventory,
      ...reportingFields,
    };
  }

  const existingService = fallback.service_details;
  const serviceInput = hasOwn(input, "service_details")
    ? record(input.service_details)
    : input;
  const duration = hasOwn(serviceInput, "duration_minutes")
    ? boundedInteger(
        serviceInput.duration_minutes,
        "service_details.duration_minutes",
        1,
        1_440,
      )
    : existingService?.duration_minutes;

  return {
    item_type: "service",
    track_inventory: false,
    service_details: {
      ...(duration !== undefined ? { duration_minutes: duration } : {}),
      buffer_minutes: hasOwn(serviceInput, "buffer_minutes")
        ? boundedInteger(
            serviceInput.buffer_minutes,
            "service_details.buffer_minutes",
            0,
            480,
            0,
          ) ?? 0
        : existingService?.buffer_minutes ?? 0,
      booking_required: hasOwn(serviceInput, "booking_required")
        ? booleanValue(
            serviceInput.booking_required,
            existingService?.booking_required ?? true,
          )
        : existingService?.booking_required ?? true,
      price_type: hasOwn(serviceInput, "price_type")
        ? servicePriceType(
            serviceInput.price_type,
            existingService?.price_type ?? "fixed",
          )
        : existingService?.price_type ?? "fixed",
      location_mode: hasOwn(serviceInput, "location_mode")
        ? serviceLocationMode(
            serviceInput.location_mode,
            existingService?.location_mode ?? "merchant",
          )
        : existingService?.location_mode ?? "merchant",
    },
    ...reportingFields,
  };
}

export function catalogCommerceMetadataPatch(
  fields: CatalogCommerceFields,
): Record<string, unknown> {
  return {
    [METADATA_KEY]: {
      version: 2,
      item_type: fields.item_type,
      track_inventory: fields.track_inventory,
      ...(fields.service_details
        ? { service_details: { ...fields.service_details } }
        : {}),
      cost_iqd: fields.cost_iqd ?? null,
      variant_costs_iqd: fields.variant_costs_iqd || {},
    },
  };
}

export function applyCatalogCommerceFields<T extends CatalogProduct>(
  product: T,
  fields: CatalogCommerceFields,
): T & Omit<CatalogCommerceFields, "variant_costs_iqd"> & {
  variants: CatalogCommerceVariant[];
} {
  const mutable = product as T & {
    cost_iqd?: number;
    variants: CatalogCommerceVariant[];
  };
  if (fields.cost_iqd === undefined) delete mutable.cost_iqd;
  else mutable.cost_iqd = fields.cost_iqd;

  const costs = fields.variant_costs_iqd || {};
  for (const variant of mutable.variants) {
    const cost = costs[variantSignature(variant)];
    if (cost === undefined) delete variant.cost_iqd;
    else variant.cost_iqd = cost;
  }

  return Object.assign(mutable, {
    item_type: fields.item_type,
    track_inventory: fields.track_inventory,
    ...(fields.service_details
      ? { service_details: { ...fields.service_details } }
      : {}),
  });
}

export function catalogCommerceFieldsOf(product: unknown): CatalogCommerceFields {
  const value = record(product);
  const resolvedItemType = itemType(value.item_type, "product");
  const cost = reportingCost(value.cost_iqd, "cost_iqd");
  const variantCosts: Record<string, number> = {};
  if (Array.isArray(value.variants)) {
    for (const rawVariant of value.variants) {
      const variant = record(rawVariant);
      const signature = variantSignature(variant);
      const variantCost = reportingCost(variant.cost_iqd, "variant.cost_iqd");
      if (signature && variantCost !== undefined) variantCosts[signature] = variantCost;
    }
  }
  const reportingFields = {
    ...(cost !== undefined ? { cost_iqd: cost } : {}),
    ...(Object.keys(variantCosts).length > 0
      ? { variant_costs_iqd: variantCosts }
      : {}),
  };

  if (resolvedItemType === "service") {
    return {
      ...normalizeCatalogCommerceInput(
        {
          item_type: "service",
          track_inventory: false,
          service_details: record(value.service_details),
          ...(cost !== undefined ? { cost_iqd: cost } : {}),
        },
        { item_type: "service", track_inventory: false },
      ),
      ...reportingFields,
    };
  }
  return {
    item_type: "product",
    track_inventory: booleanValue(value.track_inventory, true),
    ...reportingFields,
  };
}

export function applyCatalogInventoryTrackingState(params: {
  product: CatalogCommerceProduct;
  input: unknown;
  previous?: CatalogCommerceProduct;
}): CatalogCommerceProduct {
  const { product } = params;
  if (product.track_inventory) return product;

  product.stock_quantity = 0;
  for (const variant of product.variants) variant.stock_quantity = 0;

  const input = record(params.input);
  if (hasOwn(input, "status")) {
    const requestedStatus = normalizedText(input.status);
    if (requestedStatus === "low_stock") {
      throw new CatalogRuntimeError(
        "CATALOG_NON_INVENTORY_LOW_STOCK_INVALID",
        "low_stock is only valid for inventory-tracked products",
        400,
      );
    }
    if (
      requestedStatus === "available" ||
      requestedStatus === "out_of_stock" ||
      requestedStatus === "draft" ||
      requestedStatus === "hidden_from_fawri"
    ) {
      product.status = requestedStatus;
      return product;
    }
  }

  if (params.previous && !params.previous.track_inventory) {
    product.status =
      params.previous.status === "low_stock" ? "available" : params.previous.status;
    return product;
  }

  if (product.status === "out_of_stock" || product.status === "low_stock") {
    product.status = "available";
  }
  return product;
}

export function catalogTracksInventory(product: unknown): boolean {
  return catalogCommerceFieldsOf(product).track_inventory;
}
