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
};

export type CatalogCommerceProduct = CatalogProduct & CatalogCommerceFields;

const METADATA_KEY = "fawri_catalog_v2";
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

  if (resolvedItemType !== "service") {
    return {
      item_type: resolvedItemType,
      track_inventory: resolvedTrackInventory,
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

  const requestedTrackInventory = hasOwn(input, "track_inventory")
    ? booleanValue(input.track_inventory, fallback.track_inventory)
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
  };
}

export function catalogCommerceMetadataPatch(
  fields: CatalogCommerceFields,
): Record<string, unknown> {
  return {
    [METADATA_KEY]: {
      version: 1,
      item_type: fields.item_type,
      track_inventory: fields.track_inventory,
      ...(fields.service_details
        ? { service_details: { ...fields.service_details } }
        : {}),
    },
  };
}

export function applyCatalogCommerceFields<T extends CatalogProduct>(
  product: T,
  fields: CatalogCommerceFields,
): T & CatalogCommerceFields {
  return Object.assign(product, {
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
  if (resolvedItemType === "service") {
    return normalizeCatalogCommerceInput(
      {
        item_type: "service",
        track_inventory: false,
        service_details: record(value.service_details),
      },
      { item_type: "service", track_inventory: false },
    );
  }
  return {
    item_type: "product",
    track_inventory: booleanValue(value.track_inventory, true),
  };
}

export function catalogTracksInventory(product: unknown): boolean {
  return catalogCommerceFieldsOf(product).track_inventory;
}
