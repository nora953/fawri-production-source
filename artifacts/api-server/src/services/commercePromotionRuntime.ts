export type CommercePromotionScope = "catalog_item" | "delivery";
export type CommercePromotionEffect =
  | "percentage_off"
  | "fixed_amount_off"
  | "fixed_price"
  | "free_delivery";
export type CommercePromotionLifecycle =
  | "disabled"
  | "scheduled"
  | "active"
  | "expired";

export type CommercePromotionRule = {
  id: string;
  merchant_id: string;
  name: string;
  scope: CommercePromotionScope;
  effect: CommercePromotionEffect;
  product_id?: string;
  variant_id?: string;
  percentage_bps?: number;
  amount_minor?: number;
  currency_code: string;
  minimum_subtotal_minor?: number;
  starts_at: string;
  ends_at: string;
  schedule_timezone: string;
  priority: number;
  enabled: boolean;
  version: number;
};

export type EffectiveCatalogPrice = {
  merchant_id: string;
  product_id: string;
  variant_id?: string;
  currency_code: string;
  base_amount_minor: number;
  effective_amount_minor: number;
  discount_amount_minor: number;
  promotion_applied: boolean;
  promotion_id?: string;
  promotion_name?: string;
  promotion_effect?: CommercePromotionEffect;
  promotion_version?: number;
};

export type EffectiveDeliveryFee = {
  merchant_id: string;
  currency_code: string;
  base_fee_minor: number;
  effective_fee_minor: number;
  promotion_applied: boolean;
  promotion_id?: string;
  promotion_name?: string;
  promotion_version?: number;
};

export class CommercePromotionError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CommercePromotionError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim();
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_AMOUNT_INVALID",
      `${field} must be a non-negative safe integer`,
      400,
      { field },
    );
  }
  return parsed;
}

function instant(value: unknown, field: string): number {
  const parsed = new Date(String(value ?? "")).getTime();
  if (!Number.isFinite(parsed)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_TIME_INVALID",
      `${field} must be a valid instant`,
      400,
      { field },
    );
  }
  return parsed;
}

function currency(value: unknown): string {
  const normalized = text(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_CURRENCY_INVALID",
      "currency_code must be a three-letter code",
    );
  }
  return normalized;
}

function validateRule(rule: CommercePromotionRule): CommercePromotionRule {
  if (!text(rule.id) || !text(rule.merchant_id) || !text(rule.name)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_IDENTITY_INVALID",
      "promotion identity is invalid",
    );
  }
  if (rule.scope !== "catalog_item" && rule.scope !== "delivery") {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_SCOPE_INVALID",
      "promotion scope is invalid",
    );
  }
  if (
    rule.effect !== "percentage_off" &&
    rule.effect !== "fixed_amount_off" &&
    rule.effect !== "fixed_price" &&
    rule.effect !== "free_delivery"
  ) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_EFFECT_INVALID",
      "promotion effect is invalid",
    );
  }
  if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1000) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_PRIORITY_INVALID",
      "promotion priority is invalid",
    );
  }
  if (!Number.isInteger(rule.version) || rule.version <= 0) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_VERSION_INVALID",
      "promotion version is invalid",
    );
  }
  currency(rule.currency_code);
  const starts = instant(rule.starts_at, "starts_at");
  const ends = instant(rule.ends_at, "ends_at");
  if (ends <= starts) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_WINDOW_INVALID",
      "promotion ends_at must be after starts_at",
    );
  }
  if (rule.minimum_subtotal_minor !== undefined) {
    nonNegativeInteger(rule.minimum_subtotal_minor, "minimum_subtotal_minor");
  }

  if (rule.scope === "catalog_item") {
    if (!text(rule.product_id) || rule.effect === "free_delivery") {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_TARGET_INVALID",
        "catalog promotion requires a product target and discount effect",
      );
    }
  } else if (
    rule.effect !== "free_delivery" ||
    rule.product_id !== undefined ||
    rule.variant_id !== undefined
  ) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_TARGET_INVALID",
      "delivery promotion must be free delivery without a catalog target",
    );
  }

  if (rule.effect === "percentage_off") {
    if (
      !Number.isInteger(rule.percentage_bps) ||
      Number(rule.percentage_bps) < 1 ||
      Number(rule.percentage_bps) > 10_000 ||
      rule.amount_minor !== undefined
    ) {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_VALUE_INVALID",
        "percentage promotion requires 1..10000 basis points only",
      );
    }
  } else if (rule.effect === "fixed_amount_off") {
    if (
      rule.percentage_bps !== undefined ||
      rule.amount_minor === undefined ||
      nonNegativeInteger(rule.amount_minor, "amount_minor") <= 0
    ) {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_VALUE_INVALID",
        "fixed amount promotion requires a positive amount_minor",
      );
    }
  } else if (rule.effect === "fixed_price") {
    if (
      rule.percentage_bps !== undefined ||
      rule.amount_minor === undefined
    ) {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_VALUE_INVALID",
        "fixed price promotion requires amount_minor",
      );
    }
    nonNegativeInteger(rule.amount_minor, "amount_minor");
  } else if (
    rule.percentage_bps !== undefined ||
    rule.amount_minor !== undefined
  ) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_VALUE_INVALID",
      "free delivery promotion must not carry discount amount fields",
    );
  }

  return rule;
}

export function commercePromotionLifecycleAt(
  promotion: CommercePromotionRule,
  atValue: string | Date | number = Date.now(),
): CommercePromotionLifecycle {
  const rule = validateRule(promotion);
  if (!rule.enabled) return "disabled";
  const at =
    typeof atValue === "number"
      ? atValue
      : atValue instanceof Date
        ? atValue.getTime()
        : instant(atValue, "at");
  if (!Number.isFinite(at)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_TIME_INVALID",
      "resolution time is invalid",
    );
  }
  const starts = instant(rule.starts_at, "starts_at");
  const ends = instant(rule.ends_at, "ends_at");
  if (at < starts) return "scheduled";
  if (at >= ends) return "expired";
  return "active";
}

function minimumSatisfied(rule: CommercePromotionRule, subtotalMinor: number): boolean {
  return (
    rule.minimum_subtotal_minor === undefined ||
    subtotalMinor >= rule.minimum_subtotal_minor
  );
}

function selectOnePromotion(
  candidates: CommercePromotionRule[],
  specificity: (rule: CommercePromotionRule) => number,
): CommercePromotionRule | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((left, right) => {
    const specificityDelta = specificity(right) - specificity(left);
    if (specificityDelta !== 0) return specificityDelta;
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.id.localeCompare(right.id);
  });
  const first = sorted[0];
  const sameRank = sorted.filter(
    (rule) =>
      specificity(rule) === specificity(first) && rule.priority === first.priority,
  );
  if (sameRank.length > 1) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_CONFLICT",
      "multiple active promotions have the same precedence",
      409,
      { promotion_ids: sameRank.map((rule) => rule.id) },
    );
  }
  return first;
}

function percentPrice(baseAmountMinor: number, percentageBps: number): number {
  const base = BigInt(baseAmountMinor);
  const remaining = BigInt(10_000 - percentageBps);
  const result = (base * remaining) / 10_000n;
  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_AMOUNT_INVALID",
      "resolved promotion amount exceeds safe integer range",
      500,
    );
  }
  return asNumber;
}

export function resolveEffectiveCatalogPrice(input: {
  merchantId: string;
  productId: string;
  variantId?: string;
  baseAmountMinor: number;
  currencyCode: string;
  subtotalMinor?: number;
  promotions: CommercePromotionRule[];
  at?: string | Date | number;
}): EffectiveCatalogPrice {
  const base = nonNegativeInteger(input.baseAmountMinor, "baseAmountMinor");
  const subtotal = nonNegativeInteger(input.subtotalMinor ?? base, "subtotalMinor");
  const currencyCode = currency(input.currencyCode);
  const at = input.at ?? Date.now();
  const candidates = input.promotions
    .map(validateRule)
    .filter(
      (rule) =>
        rule.merchant_id === input.merchantId &&
        rule.scope === "catalog_item" &&
        rule.product_id === input.productId &&
        (!rule.variant_id || rule.variant_id === input.variantId) &&
        currency(rule.currency_code) === currencyCode &&
        minimumSatisfied(rule, subtotal) &&
        commercePromotionLifecycleAt(rule, at) === "active",
    );
  const promotion = selectOnePromotion(candidates, (rule) =>
    rule.variant_id ? 2 : 1,
  );

  if (!promotion) {
    return {
      merchant_id: input.merchantId,
      product_id: input.productId,
      ...(input.variantId ? { variant_id: input.variantId } : {}),
      currency_code: currencyCode,
      base_amount_minor: base,
      effective_amount_minor: base,
      discount_amount_minor: 0,
      promotion_applied: false,
    };
  }

  let effective = base;
  if (promotion.effect === "percentage_off") {
    effective = percentPrice(base, Number(promotion.percentage_bps));
  } else if (promotion.effect === "fixed_amount_off") {
    effective = Math.max(0, base - Number(promotion.amount_minor));
  } else if (promotion.effect === "fixed_price") {
    effective = Number(promotion.amount_minor);
  }

  return {
    merchant_id: input.merchantId,
    product_id: input.productId,
    ...(input.variantId ? { variant_id: input.variantId } : {}),
    currency_code: currencyCode,
    base_amount_minor: base,
    effective_amount_minor: effective,
    discount_amount_minor: base - effective,
    promotion_applied: true,
    promotion_id: promotion.id,
    promotion_name: promotion.name,
    promotion_effect: promotion.effect,
    promotion_version: promotion.version,
  };
}

export function resolveEffectiveDeliveryFee(input: {
  merchantId: string;
  baseFeeMinor: number;
  subtotalMinor: number;
  currencyCode: string;
  promotions: CommercePromotionRule[];
  at?: string | Date | number;
}): EffectiveDeliveryFee {
  const base = nonNegativeInteger(input.baseFeeMinor, "baseFeeMinor");
  const subtotal = nonNegativeInteger(input.subtotalMinor, "subtotalMinor");
  const currencyCode = currency(input.currencyCode);
  const at = input.at ?? Date.now();
  const candidates = input.promotions
    .map(validateRule)
    .filter(
      (rule) =>
        rule.merchant_id === input.merchantId &&
        rule.scope === "delivery" &&
        rule.effect === "free_delivery" &&
        currency(rule.currency_code) === currencyCode &&
        minimumSatisfied(rule, subtotal) &&
        commercePromotionLifecycleAt(rule, at) === "active",
    );
  const promotion = selectOnePromotion(candidates, () => 1);
  if (!promotion) {
    return {
      merchant_id: input.merchantId,
      currency_code: currencyCode,
      base_fee_minor: base,
      effective_fee_minor: base,
      promotion_applied: false,
    };
  }
  return {
    merchant_id: input.merchantId,
    currency_code: currencyCode,
    base_fee_minor: base,
    effective_fee_minor: 0,
    promotion_applied: true,
    promotion_id: promotion.id,
    promotion_name: promotion.name,
    promotion_version: promotion.version,
  };
}
