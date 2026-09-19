import { catalogCommerceFromMetadata } from "./catalogCommerceMetadata";
import {
  CommercePromotionError,
  resolveEffectiveCatalogPrice,
  type CommercePromotionRule,
} from "./commercePromotionRuntime";
import {
  operationalQueryRows,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type OnlineOrderRequestedItem = {
  product_id: string;
  variant_id?: string;
  quantity: number;
};

export type OnlineOrderPricedLine = {
  product_id: string;
  variant_id?: string;
  product_name_snapshot: string;
  variant_snapshot: Record<string, unknown>;
  quantity: number;
  base_unit_price_minor: number;
  unit_price_minor: number;
  line_total_minor: number;
  catalog_version: number;
  promotion?: {
    id: string;
    name: string;
    effect: string;
    version?: number;
  };
};

export type OnlineOrderPricingSnapshot = {
  merchant_id: string;
  currency_code: string;
  base_subtotal_minor: number;
  subtotal_minor: number;
  lines: OnlineOrderPricedLine[];
};

type MerchantRow = {
  id: string;
  currency_code: string;
};

type ProductRow = {
  id: string;
  merchant_id: string;
  name: string;
  current_price_iqd: number;
  variant_stock_mode: boolean;
  version: number;
  status: string;
  metadata: Record<string, unknown> | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  merchant_id: string;
  name: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  barcode: string | null;
  price_adjustment_iqd: number;
  price_override_iqd: number | null;
  version: number;
};

type PromotionRow = {
  id: string;
  merchant_id: string;
  name: string;
  scope: "catalog_item" | "delivery";
  effect: "percentage_off" | "fixed_amount_off" | "fixed_price" | "free_delivery";
  product_id: string | null;
  variant_id: string | null;
  percentage_bps: number | null;
  amount_minor: number | null;
  currency_code: string;
  minimum_subtotal_minor: number | null;
  starts_at: Date | string;
  ends_at: Date | string;
  schedule_timezone: string;
  priority: number;
  enabled: boolean;
  version: number;
};

export class OnlineOrderPricingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OnlineOrderPricingError";
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
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_IDENTIFIER_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return normalized;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_QUANTITY_INVALID",
      `${field} must be a positive safe integer`,
      400,
    );
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_STATE_INVALID",
      `${field} is invalid`,
      500,
    );
  }
  return parsed;
}

function safeAdd(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_AMOUNT_INVALID",
      `${field} exceeds safe integer range`,
      409,
    );
  }
  return value;
}

function safeMultiply(left: number, right: number, field: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_AMOUNT_INVALID",
      `${field} exceeds safe integer range`,
      409,
    );
  }
  return value;
}

function normalizeRequestedItems(
  items: readonly OnlineOrderRequestedItem[],
): OnlineOrderRequestedItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 250) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_ITEMS_INVALID",
      "order items are invalid",
      400,
    );
  }
  const aggregated = new Map<string, OnlineOrderRequestedItem>();
  for (const item of items) {
    const productId = identifier(item.product_id, "product_id", 160);
    const variantId = item.variant_id
      ? identifier(item.variant_id, "variant_id", 160)
      : undefined;
    const quantity = positiveInteger(item.quantity, "quantity");
    const key = `${productId}\0${variantId || ""}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity = safeAdd(existing.quantity, quantity, "quantity");
    } else {
      aggregated.set(key, {
        product_id: productId,
        ...(variantId ? { variant_id: variantId } : {}),
        quantity,
      });
    }
  }
  return [...aggregated.values()].sort((left, right) => {
    const product = left.product_id.localeCompare(right.product_id);
    if (product !== 0) return product;
    return (left.variant_id || "").localeCompare(right.variant_id || "");
  });
}

function currencyCode(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_CURRENCY_INVALID",
      "merchant currency is invalid",
      500,
    );
  }
  return normalized;
}

function promotionRule(row: PromotionRow, merchantId: string): CommercePromotionRule {
  if (row.merchant_id !== merchantId) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_TENANT_VIOLATION",
      "promotion crossed merchant tenant boundary",
      500,
    );
  }
  return {
    id: identifier(row.id, "promotion_id", 160),
    merchant_id: merchantId,
    name: identifier(row.name, "promotion_name", 300),
    scope: row.scope,
    effect: row.effect,
    ...(row.product_id ? { product_id: identifier(row.product_id, "product_id", 160) } : {}),
    ...(row.variant_id ? { variant_id: identifier(row.variant_id, "variant_id", 160) } : {}),
    ...(row.percentage_bps !== null ? { percentage_bps: Number(row.percentage_bps) } : {}),
    ...(row.amount_minor !== null ? { amount_minor: Number(row.amount_minor) } : {}),
    currency_code: currencyCode(row.currency_code),
    ...(row.minimum_subtotal_minor !== null
      ? { minimum_subtotal_minor: Number(row.minimum_subtotal_minor) }
      : {}),
    starts_at: new Date(row.starts_at).toISOString(),
    ends_at: new Date(row.ends_at).toISOString(),
    schedule_timezone: String(row.schedule_timezone || "UTC"),
    priority: Number(row.priority),
    enabled: Boolean(row.enabled),
    version: Number(row.version),
  };
}

export async function priceOnlineOrderWithTarget(
  target: OperationalQueryTarget,
  params: {
    merchantId: unknown;
    requestedItems: readonly OnlineOrderRequestedItem[];
    at?: Date | string | number;
  },
): Promise<OnlineOrderPricingSnapshot> {
  const merchantId = identifier(params.merchantId, "merchant_id", 128);
  const requested = normalizeRequestedItems(params.requestedItems);
  const merchantRows = await operationalQueryRows<MerchantRow>(
    target,
    `SELECT id, currency_code
       FROM merchants
      WHERE id = $1
      LIMIT 1`,
    [merchantId],
  );
  const merchant = merchantRows[0];
  if (!merchant || merchant.id !== merchantId) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_MERCHANT_NOT_FOUND",
      "merchant was not found",
      404,
    );
  }
  const currency = currencyCode(merchant.currency_code);

  const productIds = [...new Set(requested.map((item) => item.product_id))];
  const products = await operationalQueryRows<ProductRow>(
    target,
    `SELECT id, merchant_id, name, current_price_iqd, variant_stock_mode,
            version, status, metadata
       FROM products
      WHERE merchant_id = $1
        AND id = ANY($2::text[])
        AND deleted_at IS NULL
      ORDER BY id
      FOR KEY SHARE`,
    [merchantId, productIds],
  );
  const productById = new Map(products.map((row) => [row.id, row]));
  for (const row of products) {
    if (row.merchant_id !== merchantId) {
      throw new OnlineOrderPricingError(
        "ONLINE_ORDER_PRICING_TENANT_VIOLATION",
        "product crossed merchant tenant boundary",
        500,
      );
    }
  }
  if (productById.size !== productIds.length) {
    throw new OnlineOrderPricingError(
      "ONLINE_ORDER_PRICING_PRODUCT_NOT_FOUND",
      "one or more catalog products were not found",
      404,
    );
  }

  const variants = await operationalQueryRows<VariantRow>(
    target,
    `SELECT id, product_id, merchant_id, name, color, size, sku, barcode,
            price_adjustment_iqd, price_override_iqd, version
       FROM product_variants
      WHERE merchant_id = $1
        AND product_id = ANY($2::text[])
      ORDER BY product_id, id
      FOR KEY SHARE`,
    [merchantId, productIds],
  );
  const variantsByProduct = new Map<string, VariantRow[]>();
  for (const row of variants) {
    if (row.merchant_id !== merchantId) {
      throw new OnlineOrderPricingError(
        "ONLINE_ORDER_PRICING_TENANT_VIOLATION",
        "variant crossed merchant tenant boundary",
        500,
      );
    }
    const list = variantsByProduct.get(row.product_id) || [];
    list.push(row);
    variantsByProduct.set(row.product_id, list);
  }

  const promotionRows = await operationalQueryRows<PromotionRow>(
    target,
    `SELECT id, merchant_id, name, scope::text AS scope, effect::text AS effect,
            product_id, variant_id, percentage_bps, amount_minor,
            currency_code, minimum_subtotal_minor, starts_at, ends_at,
            schedule_timezone, priority, enabled, version
       FROM commerce_promotions
      WHERE merchant_id = $1
        AND enabled = TRUE
      ORDER BY priority DESC, id
      LIMIT 250`,
    [merchantId],
  );
  const promotions = promotionRows.map((row) => promotionRule(row, merchantId));

  const baseLines = requested.map((item) => {
    const product = productById.get(item.product_id)!;
    if (!["available", "low_stock", "out_of_stock"].includes(String(product.status))) {
      throw new OnlineOrderPricingError(
        "ONLINE_ORDER_PRICING_PRODUCT_UNAVAILABLE",
        "catalog product is not sellable",
        409,
      );
    }
    const commerce = catalogCommerceFromMetadata(product.metadata);
    if (commerce.item_type !== "product" || !commerce.track_inventory) {
      throw new OnlineOrderPricingError(
        "ONLINE_ORDER_PRICING_INVENTORY_PRODUCT_REQUIRED",
        "this order flow currently supports inventory-tracked products only",
        409,
      );
    }

    const productVariants = variantsByProduct.get(product.id) || [];
    let variant: VariantRow | undefined;
    if (productVariants.length > 0 || product.variant_stock_mode) {
      if (!item.variant_id) {
        throw new OnlineOrderPricingError(
          "ONLINE_ORDER_PRICING_VARIANT_REQUIRED",
          "variant_id is required for this product",
          400,
        );
      }
      variant = productVariants.find((row) => row.id === item.variant_id);
      if (!variant) {
        throw new OnlineOrderPricingError(
          "ONLINE_ORDER_PRICING_VARIANT_NOT_FOUND",
          "product variant was not found",
          404,
        );
      }
    } else if (item.variant_id) {
      throw new OnlineOrderPricingError(
        "ONLINE_ORDER_PRICING_VARIANT_INVALID",
        "variant_id is not valid for this product",
        400,
      );
    }

    const productPrice = nonNegativeInteger(
      product.current_price_iqd,
      "current_price_iqd",
    );
    const adjustment = variant
      ? Number(variant.price_adjustment_iqd)
      : 0;
    if (!Number.isSafeInteger(adjustment)) {
      throw new OnlineOrderPricingError(
        "ONLINE_ORDER_PRICING_STATE_INVALID",
        "variant price adjustment is invalid",
        500,
      );
    }
    const baseUnit =
      variant?.price_override_iqd !== null &&
      variant?.price_override_iqd !== undefined
        ? nonNegativeInteger(variant.price_override_iqd, "price_override_iqd")
        : productPrice + adjustment;
    if (!Number.isSafeInteger(baseUnit) || baseUnit < 0) {
      throw new OnlineOrderPricingError(
        "ONLINE_ORDER_PRICING_STATE_INVALID",
        "resolved base price is invalid",
        500,
      );
    }
    return {
      item,
      product,
      variant,
      baseUnit,
      baseLineTotal: safeMultiply(baseUnit, item.quantity, "base_line_total"),
    };
  });

  const baseSubtotal = baseLines.reduce(
    (total, line) => safeAdd(total, line.baseLineTotal, "base_subtotal"),
    0,
  );

  let subtotal = 0;
  const lines: OnlineOrderPricedLine[] = baseLines.map((line) => {
    let resolved;
    try {
      resolved = resolveEffectiveCatalogPrice({
        merchantId,
        productId: line.product.id,
        ...(line.variant ? { variantId: line.variant.id } : {}),
        baseAmountMinor: line.baseUnit,
        currencyCode: currency,
        subtotalMinor: baseSubtotal,
        promotions,
        at: params.at,
      });
    } catch (error) {
      if (error instanceof CommercePromotionError) {
        throw new OnlineOrderPricingError(
          "ONLINE_ORDER_PRICING_PROMOTION_INVALID",
          "promotion pricing state is invalid",
          409,
        );
      }
      throw error;
    }
    const lineTotal = safeMultiply(
      resolved.effective_amount_minor,
      line.item.quantity,
      "line_total",
    );
    subtotal = safeAdd(subtotal, lineTotal, "subtotal");
    return {
      product_id: line.product.id,
      ...(line.variant ? { variant_id: line.variant.id } : {}),
      product_name_snapshot: String(line.product.name),
      variant_snapshot: line.variant
        ? {
            name: line.variant.name,
            color: line.variant.color,
            size: line.variant.size,
            sku: line.variant.sku,
            barcode: line.variant.barcode,
            version: line.variant.version,
          }
        : {},
      quantity: line.item.quantity,
      base_unit_price_minor: line.baseUnit,
      unit_price_minor: resolved.effective_amount_minor,
      line_total_minor: lineTotal,
      catalog_version: Number(line.product.version),
      ...(resolved.promotion_applied && resolved.promotion_id
        ? {
            promotion: {
              id: resolved.promotion_id,
              name: resolved.promotion_name || "",
              effect: resolved.promotion_effect || "",
              ...(resolved.promotion_version
                ? { version: resolved.promotion_version }
                : {}),
            },
          }
        : {}),
    };
  });

  return {
    merchant_id: merchantId,
    currency_code: currency,
    base_subtotal_minor: baseSubtotal,
    subtotal_minor: subtotal,
    lines,
  };
}
