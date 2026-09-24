import {
  DeliveryPricingPolicyError,
  formatDeliveryQuoteText,
  normalizeDeliveryAreaName,
  type DeliveryAreaRate,
} from "../deliveryPricing.js";
import {
  formatMinorCurrencyNumber,
  normalizeCurrencyCode,
} from "../currencyMoneyRuntime.js";
import { resolveCommerceDeliveryQuote } from "../commerceDeliveryPricing.js";
import {
  CommercePromotionError,
  resolveEffectiveCatalogPrice,
  type CommercePromotionEffect,
  type CommercePromotionRule,
  type CommercePromotionScope,
} from "../commercePromotionRuntime.js";
import {
  catalogCommerceFromMetadata,
  type CatalogCommerceFields,
} from "../catalogCommerceMetadata.js";
import {
  planOnlineOrderFulfillmentWithTarget,
} from "../postgresOnlineOrderFulfillmentPlanner.js";
import type { OperationalQueryTarget } from "../operationalPostgresAuthority.js";
import {
  catalogAvailabilityAnswer,
  catalogPriceAnswer,
  requestedCatalogQuantity,
} from "./catalogFactDisclosure.js";
import {
  boundedText,
  normalizeKnowledgeText,
} from "./normalization.js";
import {
  getPostgresKnowledgeSqlClient,
  KnowledgeRuntimeGateError,
  type KnowledgeSqlExecutor,
} from "./postgresKnowledgeRuntime.js";
import type {
  DatabaseFactResult,
  KnowledgeFactResolver,
  KnowledgeFactResolverInput,
  KnowledgeLanguage,
} from "./types.js";

const DELIVERY_TERMS = ["توصيل", "التوصيل", "شحن", "يوصل", "delivery", "shipping", "گەیاندن", "گواستنەوە"];
const PAYMENT_TERMS = ["دفع", "الدفع", "كاش", "نقد", "payment", "pay", "cash", "پارەدان"];
const BUSINESS_TERMS = ["اسم المتجر", "اسم المحل", "store name", "business name", "ناوی فرۆشگا"];
const PRICE_TERMS = ["سعر", "السعر", "بكم", "شكد", "price", "cost", "نرخ"];
const STOCK_TERMS = ["مخزون", "متوفر", "متوفره", "متوفرة", "available", "stock", "in stock", "بەردەست"];
const WEIGHT_TERMS = ["وزن", "وزنه", "الوزن", "weight", "weigh", "کێش", "كێش"];
const DIMENSION_TERMS = ["أبعاد", "ابعاد", "الأبعاد", "الطول", "العرض", "الارتفاع", "dimensions", "dimension", "measurements", "size", "ڕەهەند", "درێژی", "پانی", "بەرزی"];
const ORDER_TERMS = ["حالة الطلب", "طلبي", "الطلب", "order status", "my order", "داواکاری"];
const WARRANTY_TERMS = ["ضمان", "كفالة", "warranty", "guarantee"];
const MAX_WEIGHT_G = 100_000_000;
const MAX_DIMENSION_MM = 100_000;

type MeasurementKind = "weight" | "dimensions";
type OperationalFactKind =
  | "delivery"
  | "payment"
  | "business"
  | "price"
  | "stock"
  | "weight"
  | "dimensions"
  | "order"
  | "warranty";

type PhysicalFacts = {
  weight_g: number | null;
  dimensions: { length_mm: number; width_mm: number; height_mm: number } | null;
};

function fail(code: string, message: string, status = 503): never {
  throw new KnowledgeRuntimeGateError(code, message, status);
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalizeKnowledgeText(term)));
}

function text(value: unknown, max = 2_000): string {
  return boundedText(value, max);
}

function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return parsed;
}

function optionalPositiveInteger(value: unknown, max: number): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) {
    fail("KNOWLEDGE_STATE_INVALID", "catalog physical measurement state is invalid");
  }
  return parsed;
}

function version(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return parsed;
}

function bool(value: unknown): boolean {
  if (value === true || value === false) return value;
  fail("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
}

function stringArray(value: unknown, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems || !value.every((item) => typeof item === "string")) {
    fail("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return value.map((item) => boundedText(item, 500));
}

function tenant(row: Record<string, unknown>, merchantId: string): void {
  if (text(row.merchant_id, 160) !== merchantId) {
    fail("KNOWLEDGE_TENANT_VIOLATION", "knowledge tenant boundary violation");
  }
}

function merchantCurrency(value: unknown): string {
  try {
    return normalizeCurrencyCode(text(value, 3));
  } catch {
    fail("KNOWLEDGE_STATE_INVALID", "merchant currency state is invalid");
  }
}

function commerceFacts(row: Record<string, unknown>): CatalogCommerceFields {
  try {
    return catalogCommerceFromMetadata(row.metadata);
  } catch {
    fail("KNOWLEDGE_STATE_INVALID", "catalog commerce state is invalid");
  }
}

function physicalFacts(row: Record<string, unknown>): PhysicalFacts {
  const weight = optionalPositiveInteger(row.weight_g, MAX_WEIGHT_G);
  const length = optionalPositiveInteger(row.length_mm, MAX_DIMENSION_MM);
  const width = optionalPositiveInteger(row.width_mm, MAX_DIMENSION_MM);
  const height = optionalPositiveInteger(row.height_mm, MAX_DIMENSION_MM);
  const presentDimensions = [length, width, height].filter((value) => value !== null).length;
  if (presentDimensions !== 0 && presentDimensions !== 3) {
    fail("KNOWLEDGE_STATE_INVALID", "catalog dimensions must be complete");
  }
  return {
    weight_g: weight,
    dimensions: presentDimensions === 3
      ? { length_mm: length!, width_mm: width!, height_mm: height! }
      : null,
  };
}

function inheritedPhysicalFacts(product: PhysicalFacts, variant?: PhysicalFacts): PhysicalFacts {
  return {
    weight_g: variant?.weight_g ?? product.weight_g,
    dimensions: variant?.dimensions ?? product.dimensions,
  };
}

function instantIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) {
    fail("KNOWLEDGE_PROMOTION_STATE_INVALID", "promotion schedule state is invalid");
  }
  return date.toISOString();
}

function promotionScope(value: unknown): CommercePromotionScope {
  const normalized = text(value, 40);
  if (normalized !== "catalog_item" && normalized !== "delivery") {
    fail("KNOWLEDGE_PROMOTION_STATE_INVALID", "promotion scope state is invalid");
  }
  return normalized;
}

function promotionEffect(value: unknown): CommercePromotionEffect {
  const normalized = text(value, 40);
  if (
    normalized !== "percentage_off" &&
    normalized !== "fixed_amount_off" &&
    normalized !== "fixed_price" &&
    normalized !== "free_delivery"
  ) {
    fail("KNOWLEDGE_PROMOTION_STATE_INVALID", "promotion effect state is invalid");
  }
  return normalized;
}

function promotionRule(
  row: Record<string, unknown>,
  merchantId: string,
): CommercePromotionRule {
  tenant(row, merchantId);
  const id = text(row.id, 200);
  const name = text(row.name, 200);
  if (!id || !name) {
    fail("KNOWLEDGE_PROMOTION_STATE_INVALID", "promotion identity state is invalid");
  }
  const amountMinor =
    row.amount_minor === null || row.amount_minor === undefined
      ? undefined
      : integer(row.amount_minor);
  const minimumSubtotalMinor =
    row.minimum_subtotal_minor === null || row.minimum_subtotal_minor === undefined
      ? undefined
      : integer(row.minimum_subtotal_minor);
  const percentageBps =
    row.percentage_bps === null || row.percentage_bps === undefined
      ? undefined
      : integer(row.percentage_bps);
  const priority = integer(row.priority);
  if (priority > 1000 || (percentageBps !== undefined && (percentageBps < 1 || percentageBps > 10_000))) {
    fail("KNOWLEDGE_PROMOTION_STATE_INVALID", "promotion precedence state is invalid");
  }
  return {
    id,
    merchant_id: merchantId,
    name,
    scope: promotionScope(row.scope),
    effect: promotionEffect(row.effect),
    ...(row.product_id ? { product_id: text(row.product_id, 200) } : {}),
    ...(row.variant_id ? { variant_id: text(row.variant_id, 200) } : {}),
    ...(percentageBps !== undefined ? { percentage_bps: percentageBps } : {}),
    ...(amountMinor !== undefined ? { amount_minor: amountMinor } : {}),
    currency_code: merchantCurrency(row.currency_code),
    ...(minimumSubtotalMinor !== undefined
      ? { minimum_subtotal_minor: minimumSubtotalMinor }
      : {}),
    starts_at: instantIso(row.starts_at),
    ends_at: instantIso(row.ends_at),
    schedule_timezone: text(row.schedule_timezone, 120),
    priority,
    enabled: bool(row.enabled),
    version: version(row.version),
  };
}

async function activePromotions(
  sql: KnowledgeSqlExecutor,
  merchantId: string,
): Promise<CommercePromotionRule[]> {
  let rows: Record<string, unknown>[];
  try {
    rows = (
      await sql.query(
        `SELECT id, merchant_id, name, scope, effect, product_id, variant_id,
                percentage_bps, amount_minor, currency_code, minimum_subtotal_minor,
                starts_at, ends_at, schedule_timezone, priority, enabled, version
           FROM commerce_promotions
          WHERE merchant_id = $1
            AND enabled = TRUE
            AND starts_at <= CURRENT_TIMESTAMP
            AND ends_at > CURRENT_TIMESTAMP
          ORDER BY priority DESC, id ASC
          LIMIT 250`,
        [merchantId],
      )
    ).rows;
  } catch {
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }
  return rows.map((row) => promotionRule(row, merchantId));
}

async function resolveDeliveryFact(params: {
  sql: KnowledgeSqlExecutor;
  merchantId: string;
  customerText: string;
  language: KnowledgeLanguage;
  row: Record<string, unknown>;
}) {
  let areaRows: Record<string, unknown>[] = [];
  const pricingMode = text(params.row.delivery_pricing_mode, 40);
  if (pricingMode !== "flat" && pricingMode !== "per_area") {
    fail("KNOWLEDGE_POLICY_INVALID", "merchant delivery pricing mode is invalid");
  }
  if (pricingMode === "per_area") {
    try {
      areaRows = (
        await params.sql.query(
          `SELECT id, merchant_id, area_name, normalized_area_name, fee_iqd, enabled
           FROM merchant_delivery_area_rates
           WHERE merchant_id = $1 AND enabled = TRUE
           ORDER BY normalized_area_name
           LIMIT 100`,
          [params.merchantId],
        )
      ).rows;
    } catch {
      fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
    }
  }
  const areaRates: DeliveryAreaRate[] = areaRows.map((areaRow) => {
    tenant(areaRow, params.merchantId);
    const id = text(areaRow.id, 200);
    const areaName = text(areaRow.area_name, 100);
    const normalized = text(areaRow.normalized_area_name, 100);
    const fee = integer(areaRow.fee_iqd);
    const enabled = bool(areaRow.enabled);
    if (
      !id ||
      !areaName ||
      normalized !== normalizeDeliveryAreaName(areaName) ||
      fee > 100_000_000
    ) {
      fail("KNOWLEDGE_POLICY_INVALID", "merchant delivery area policy is invalid");
    }
    return {
      id,
      area_name: areaName,
      normalized_area_name: normalized,
      fee_iqd: fee,
      enabled,
    };
  });

  const freeThreshold =
    params.row.free_delivery_threshold_iqd === null ||
    params.row.free_delivery_threshold_iqd === undefined
      ? null
      : integer(params.row.free_delivery_threshold_iqd);
  const currencyCode = merchantCurrency(params.row.merchant_currency_code);
  try {
    const promotions = await activePromotions(params.sql, params.merchantId);
    const quote = resolveCommerceDeliveryQuote({
      policy: {
        merchant_id: params.merchantId,
        settings_version: version(params.row.settings_version),
        enabled: bool(params.row.delivery_enabled),
        pricing_mode: pricingMode,
        flat_fee_iqd: integer(params.row.delivery_fee_iqd),
        free_delivery_threshold_iqd: freeThreshold,
        estimated_days_min: integer(params.row.delivery_estimated_days_min),
        estimated_days_max: integer(params.row.delivery_estimated_days_max),
        areas: stringArray(params.row.delivery_areas, 100),
        area_rates: areaRates,
      },
      area: params.customerText,
      subtotal_iqd: 0,
      currency_code: currencyCode,
      promotions,
    });
    return {
      answerText: formatDeliveryQuoteText(quote, params.language, currencyCode),
      language: params.language,
      confidence: 1,
      factType: "delivery_policy",
      recordId:
        quote.promotion_id ||
        quote.area_rate_id ||
        `${params.merchantId}:settings:${version(params.row.settings_version)}`,
    };
  } catch (error) {
    if (
      error instanceof DeliveryPricingPolicyError ||
      error instanceof CommercePromotionError
    ) {
      fail("KNOWLEDGE_POLICY_INVALID", "merchant delivery pricing policy is invalid");
    }
    throw error;
  }
}

function localizedPayment(row: Record<string, unknown>, lang: KnowledgeLanguage): string {
  const methods = stringArray(row.payment_methods, 5);
  const cash = bool(row.cash_on_delivery_enabled);
  const electronic = bool(row.electronic_payment_enabled);
  if (!methods.length || (!cash && !electronic)) {
    fail("KNOWLEDGE_POLICY_INVALID", "merchant knowledge policy is invalid");
  }
  const labels = methods.map((method) => {
    if (method === "cash_on_delivery") {
      return lang === "en" ? "cash on delivery" : lang === "ku" ? "پارەدان لە کاتی گەیاندن" : "الدفع عند الاستلام";
    }
    return method;
  });
  if (lang === "en") return `Available payment methods: ${labels.join(", ")}.`;
  if (lang === "ku") return `شێوازە بەردەستەکانی پارەدان: ${labels.join("، ")}.`;
  return `طرق الدفع المتاحة: ${labels.join("، ")}.`;
}

const SETTINGS_SQL = `
SELECT m.id AS merchant_id, m.store_name, m.status AS merchant_status,
       m.account_status, m.currency_code AS merchant_currency_code,
       ms.version AS settings_version, ms.auto_reply_enabled,
       ms.delivery_enabled, ms.delivery_pricing_mode, ms.delivery_fee_iqd,
       ms.free_delivery_threshold_iqd, ms.delivery_areas,
       ms.delivery_estimated_days_min, ms.delivery_estimated_days_max,
       ms.cash_on_delivery_enabled, ms.electronic_payment_enabled,
       ms.payment_methods
FROM merchants m
JOIN merchant_settings ms ON ms.merchant_id = m.id
WHERE m.id = $1
LIMIT 2`;

async function settings(
  sql: KnowledgeSqlExecutor,
  merchantId: string,
): Promise<Record<string, unknown>> {
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql.query(SETTINGS_SQL, [merchantId])).rows;
  } catch {
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }
  if (rows.length !== 1) fail("KNOWLEDGE_POLICY_MISSING", "merchant knowledge policy is unavailable");
  const row = rows[0];
  tenant(row, merchantId);
  if (text(row.merchant_status, 40) !== "approved" || text(row.account_status, 40) !== "approved") {
    fail("MERCHANT_KNOWLEDGE_POLICY_DENIED", "merchant knowledge policy denies retrieval", 403);
  }
  version(row.settings_version);
  if (!bool(row.auto_reply_enabled)) return row;
  return row;
}

const PRODUCTS_SQL = `
SELECT p.id, p.merchant_id, p.external_ref, p.code, p.name, p.sku, p.barcode,
       p.current_price_iqd, p.quantity, p.low_stock_threshold, p.variant_stock_mode,
       p.weight_g, p.length_mm, p.width_mm, p.height_mm, p.metadata,
       p.version, p.status, p.allow_fawri_reply, p.updated_at,
       m.currency_code AS merchant_currency_code
FROM products p
JOIN merchants m ON m.id = p.merchant_id
WHERE p.merchant_id = $1
  AND p.deleted_at IS NULL
  AND p.allow_fawri_reply = TRUE
  AND p.status IN ('available', 'low_stock', 'out_of_stock')
  AND p.version > 0
LIMIT 250`;

const VARIANTS_SQL = `
SELECT id, product_id, merchant_id, external_ref, name, color, size, sku, barcode,
       quantity, price_adjustment_iqd, price_override_iqd, option_signature,
       weight_g, length_mm, width_mm, height_mm,
       version, updated_at
FROM product_variants
WHERE merchant_id = $1 AND product_id = $2 AND version > 0
LIMIT 150`;

function identifierMatches(customer: string, value: unknown): boolean {
  const candidate = normalizeKnowledgeText(value);
  return candidate.length >= 2 && customer.includes(candidate);
}

function productMatchScore(customer: string, row: Record<string, unknown>): number {
  let score = 0;
  if (identifierMatches(customer, row.name)) score += 100;
  for (const key of ["sku", "barcode", "code", "external_ref"] as const) {
    if (identifierMatches(customer, row[key])) score += 150;
  }
  return score;
}

function variantMatchScore(customer: string, row: Record<string, unknown>): number {
  let score = 0;
  for (const key of ["sku", "barcode", "external_ref"] as const) {
    if (identifierMatches(customer, row[key])) score += 180;
  }
  for (const key of ["name", "color", "size"] as const) {
    if (identifierMatches(customer, row[key])) score += 60;
  }
  return score;
}

function uniqueBest(rows: Array<{ row: Record<string, unknown>; score: number }>, code: string) {
  const matched = rows.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  if (!matched.length) return null;
  if (matched[1] && matched[1].score === matched[0].score) {
    fail(code, "authoritative fact match is ambiguous", 409);
  }
  return matched[0].row;
}

function selectProduct(
  products: Record<string, unknown>[],
  customer: string,
  trustedProductIdHint?: string,
): Record<string, unknown> | null {
  const explicit = uniqueBest(
    products.map((row) => ({ row, score: productMatchScore(customer, row) })),
    "KNOWLEDGE_PRODUCT_AMBIGUOUS",
  );
  if (explicit) return explicit;
  const hint = text(trustedProductIdHint, 160);
  return hint
    ? products.find((row) => text(row.id, 160) === hint) || null
    : null;
}

function selectVariant(
  variants: Record<string, unknown>[],
  customer: string,
  productId: string,
  trustedProductIdHint?: string,
  trustedVariantIdHint?: string,
): Record<string, unknown> | null {
  const explicit = uniqueBest(
    variants.map((row) => ({ row, score: variantMatchScore(customer, row) })),
    "KNOWLEDGE_VARIANT_AMBIGUOUS",
  );
  if (explicit) return explicit;
  const productHint = text(trustedProductIdHint, 160);
  const variantHint = text(trustedVariantIdHint, 160);
  if (!variantHint || !productHint || productHint !== productId) return null;
  return variants.find((row) => text(row.id, 160) === variantHint) || null;
}

function catalogContextRecordId(productId: string, variantId?: string): string {
  return variantId
    ? `catalog-variant:${productId}:${variantId}`
    : `catalog-product:${productId}`;
}

async function knowledgeStockAvailability(params: {
  sql: KnowledgeSqlExecutor;
  merchantId: string;
  productId: string;
  variantId?: string;
  customer: string;
  requestedQuantity: number | null;
}): Promise<{ recordSuffix: string; quantity: number }> {
  let rows: Record<string, unknown>[];
  try {
    rows = (
      await params.sql.query(
        `SELECT ml.id AS location_id, lil.quantity
           FROM merchant_locations ml
           LEFT JOIN location_inventory_levels lil
             ON lil.merchant_id = ml.merchant_id
            AND lil.location_id = ml.id
            AND lil.product_id = $2
            AND lil.variant_id IS NOT DISTINCT FROM $3::text
          WHERE ml.merchant_id = $1
          ORDER BY ml.id
          LIMIT 2`,
        [params.merchantId, params.productId, params.variantId || null],
      )
    ).rows;
  } catch {
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }

  if (rows.length === 0) {
    fail(
      "KNOWLEDGE_LOCATION_INVENTORY_UNAVAILABLE",
      "location inventory is unavailable",
      409,
    );
  }

  if (rows.length === 1) {
    const row = rows[0];
    const locationId = text(row.location_id, 160);
    if (!locationId || row.quantity === null || row.quantity === undefined) {
      fail(
        "KNOWLEDGE_LOCATION_INVENTORY_UNAVAILABLE",
        "location inventory is unavailable",
        409,
      );
    }
    return {
      recordSuffix: `location:${locationId}`,
      quantity: integer(row.quantity),
    };
  }

  const requestedQuantity = params.requestedQuantity || 1;
  const target: OperationalQueryTarget = {
    query: (sql, values = []) => params.sql.query(sql, values),
  };

  let plan;
  try {
    plan = await planOnlineOrderFulfillmentWithTarget(target, {
      merchantId: params.merchantId,
      area: params.customer,
      requestedItems: [
        {
          product_id: params.productId,
          ...(params.variantId ? { variant_id: params.variantId } : {}),
          quantity: requestedQuantity,
        },
      ],
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";
    if (
      code.startsWith("LOCATION_SERVICE_AREA_") ||
      code.startsWith("LOCATION_ROUTING_") ||
      code.startsWith("ONLINE_ORDER_ROUTING_")
    ) {
      fail(
        "KNOWLEDGE_LOCATION_CONTEXT_REQUIRED",
        "multi-location stock availability requires an unambiguous customer area",
        409,
      );
    }
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }

  if (plan.status !== "routing_ready") {
    fail(
      "KNOWLEDGE_LOCATION_CONTEXT_REQUIRED",
      "multi-location stock availability requires an unambiguous customer area",
      409,
    );
  }

  if (plan.routing.status === "pending_fulfillment_confirmation") {
    fail(
      "KNOWLEDGE_LOCATION_INVENTORY_STALE",
      "location inventory is not fresh enough for an automatic stock reply",
      409,
    );
  }

  if (plan.routing.status === "routed") {
    return {
      recordSuffix: `location:${plan.routing.location_id}`,
      quantity: requestedQuantity,
    };
  }

  if (plan.routing.reason === "insufficient_single_location_inventory") {
    return {
      recordSuffix: `area:${plan.service_area.area_rate_id || "single"}:unavailable`,
      quantity: 0,
    };
  }

  if (plan.routing.reason === "inventory_stale") {
    fail(
      "KNOWLEDGE_LOCATION_INVENTORY_STALE",
      "location inventory is not fresh enough for an automatic stock reply",
      409,
    );
  }

  fail(
    "KNOWLEDGE_LOCATION_CONTEXT_REQUIRED",
    "multi-location stock availability cannot be routed automatically",
    409,
  );
}

async function loadVariants(
  sql: KnowledgeSqlExecutor,
  merchantId: string,
  productId: string,
): Promise<Record<string, unknown>[]> {
  let variants: Record<string, unknown>[];
  try {
    variants = (await sql.query(VARIANTS_SQL, [merchantId, productId])).rows;
  } catch {
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }
  for (const row of variants) {
    tenant(row, merchantId);
    if (text(row.product_id, 160) !== productId) {
      fail("KNOWLEDGE_TENANT_VIOLATION", "knowledge tenant boundary violation");
    }
    version(row.version);
    physicalFacts(row);
  }
  return variants;
}

function formatScaled(value: number, scale: number): string {
  const decimals = String(scale).length - 1;
  const whole = Math.floor(value / scale);
  const remainder = String(value % scale).padStart(decimals, "0").replace(/0+$/, "");
  return remainder ? `${whole}.${remainder}` : String(whole);
}

function measurementSignature(facts: PhysicalFacts, kind: MeasurementKind): string {
  if (kind === "weight") return facts.weight_g === null ? "unknown" : `w:${facts.weight_g}`;
  return facts.dimensions
    ? `d:${facts.dimensions.length_mm}:${facts.dimensions.width_mm}:${facts.dimensions.height_mm}`
    : "unknown";
}

function localizedMeasurementAnswer(
  language: KnowledgeLanguage,
  productName: string,
  kind: MeasurementKind,
  facts: PhysicalFacts,
): string {
  if (kind === "weight") {
    if (facts.weight_g === null) {
      if (language === "en") return `The weight of ${productName} is not currently available.`;
      if (language === "ku") return `زانیاری کێشی ${productName} لە ئێستادا بەردەست نییە.`;
      return `معلومة وزن ${productName} غير متوفرة حاليًا.`;
    }
    const kilograms = formatScaled(facts.weight_g, 1_000);
    if (language === "en") return `${productName} weighs ${kilograms} kg.`;
    if (language === "ku") return `کێشی ${productName} بریتییە لە ${kilograms} کگم.`;
    return `وزن ${productName} هو ${kilograms} كغم.`;
  }

  if (!facts.dimensions) {
    if (language === "en") return `The dimensions of ${productName} are not currently available.`;
    if (language === "ku") return `زانیاری ڕەهەندەکانی ${productName} لە ئێستادا بەردەست نییە.`;
    return `أبعاد ${productName} غير متوفرة حاليًا.`;
  }
  const length = formatScaled(facts.dimensions.length_mm, 10);
  const width = formatScaled(facts.dimensions.width_mm, 10);
  const height = formatScaled(facts.dimensions.height_mm, 10);
  if (language === "en") return `${productName} dimensions are ${length} × ${width} × ${height} cm (length × width × height).`;
  if (language === "ku") return `ڕەهەندەکانی ${productName}: ${length} × ${width} × ${height} سم (درێژی × پانی × بەرزی).`;
  return `أبعاد ${productName}: ${length} × ${width} × ${height} سم (الطول × العرض × الارتفاع).`;
}

async function resolveMeasurementFact(params: {
  sql: KnowledgeSqlExecutor;
  merchantId: string;
  customer: string;
  language: KnowledgeLanguage;
  kind: MeasurementKind;
  trustedProductIdHint?: string;
  trustedVariantIdHint?: string;
}) {
  let products: Record<string, unknown>[];
  try {
    products = (await params.sql.query(PRODUCTS_SQL, [params.merchantId])).rows;
  } catch {
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }
  for (const row of products) {
    tenant(row, params.merchantId);
    version(row.version);
    physicalFacts(row);
    commerceFacts(row);
    if (bool(row.allow_fawri_reply) !== true || !["available", "low_stock", "out_of_stock"].includes(text(row.status, 40))) {
      fail("KNOWLEDGE_PROVENANCE_INVALID", "catalog fact provenance is invalid");
    }
  }
  const product = selectProduct(
    products,
    params.customer,
    params.trustedProductIdHint,
  );
  if (!product) return null;

  const productId = text(product.id, 160);
  const productName = text(product.name, 300);
  if (!productId || !productName) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
  const productFacts = physicalFacts(product);
  let resolved = productFacts;
  let recordId = productId;
  const commerce = commerceFacts(product);
  const variantMode = commerce.track_inventory && bool(product.variant_stock_mode);

  if (variantMode) {
    const variants = await loadVariants(params.sql, params.merchantId, productId);
    if (!variants.length) fail("KNOWLEDGE_STATE_INVALID", "variant-managed product has no variants");
    const matchedVariant = selectVariant(
      variants,
      params.customer,
      productId,
      params.trustedProductIdHint,
      params.trustedVariantIdHint,
    );
    if (matchedVariant) {
      resolved = inheritedPhysicalFacts(productFacts, physicalFacts(matchedVariant));
      recordId = text(matchedVariant.id, 160);
      if (!recordId) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
    } else {
      const effective = variants.map((row) => inheritedPhysicalFacts(productFacts, physicalFacts(row)));
      const signatures = new Set(effective.map((facts) => measurementSignature(facts, params.kind)));
      if (signatures.size !== 1) {
        fail("KNOWLEDGE_VARIANT_REQUIRED", "an unambiguous product variant is required for this measurement", 409);
      }
      resolved = effective[0];
      recordId = `${productId}:common-measurement`;
    }
  }

  const resolvedVariantId =
    recordId !== productId && !recordId.endsWith(":common-measurement")
      ? recordId
      : undefined;
  return {
    answerText: localizedMeasurementAnswer(params.language, productName, params.kind, resolved),
    language: params.language,
    confidence: 1,
    factType: params.kind === "weight" ? "product_weight" : "product_dimensions",
    recordId,
    contextRecordId: catalogContextRecordId(productId, resolvedVariantId),
  };
}

async function resolveProductFact(params: {
  sql: KnowledgeSqlExecutor;
  merchantId: string;
  customer: string;
  language: KnowledgeLanguage;
  kind: "price" | "stock";
  trustedProductIdHint?: string;
  trustedVariantIdHint?: string;
}) {
  let products: Record<string, unknown>[];
  try {
    products = (await params.sql.query(PRODUCTS_SQL, [params.merchantId])).rows;
  } catch {
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }
  for (const row of products) {
    tenant(row, params.merchantId);
    version(row.version);
    physicalFacts(row);
    commerceFacts(row);
    if (bool(row.allow_fawri_reply) !== true || !["available", "low_stock", "out_of_stock"].includes(text(row.status, 40))) {
      fail("KNOWLEDGE_PROVENANCE_INVALID", "catalog fact provenance is invalid");
    }
  }
  const product = selectProduct(
    products,
    params.customer,
    params.trustedProductIdHint,
  );
  if (!product) return null;

  const productId = text(product.id, 160);
  const productName = text(product.name, 300);
  if (!productId || !productName) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");

  const commerce = commerceFacts(product);
  let unitPrice = integer(product.current_price_iqd);
  let quantity = 0;
  const variantMode = commerce.track_inventory && bool(product.variant_stock_mode);
  let recordId = productId;
  let variantId: string | undefined;

  if (variantMode) {
    const variants = await loadVariants(params.sql, params.merchantId, productId);
    const variant = selectVariant(
      variants,
      params.customer,
      productId,
      params.trustedProductIdHint,
      params.trustedVariantIdHint,
    );
    if (!variant) {
      fail("KNOWLEDGE_VARIANT_REQUIRED", "an unambiguous product variant is required", 409);
    }
    const override = variant.price_override_iqd;
    const adjustment = Number(variant.price_adjustment_iqd);
    if (!Number.isSafeInteger(adjustment)) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
    unitPrice = override === null || override === undefined ? unitPrice + adjustment : integer(override);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
    recordId = text(variant.id, 160);
    variantId = recordId;
    if (!recordId) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
  }

  if (params.kind === "stock" && commerce.track_inventory) {
    const requestedQuantity = requestedCatalogQuantity(params.customer);
    const locationInventory = await knowledgeStockAvailability({
      sql: params.sql,
      merchantId: params.merchantId,
      productId,
      ...(variantId ? { variantId } : {}),
      customer: params.customer,
      requestedQuantity,
    });
    quantity = locationInventory.quantity;
    recordId = `${recordId}:${locationInventory.recordSuffix}`;
  }

  if (params.kind === "price") {
    const currencyCode = merchantCurrency(product.merchant_currency_code);
    let resolved;
    try {
      resolved = resolveEffectiveCatalogPrice({
        merchantId: params.merchantId,
        productId,
        ...(variantId ? { variantId } : {}),
        baseAmountMinor: unitPrice,
        currencyCode,
        promotions: await activePromotions(params.sql, params.merchantId),
      });
    } catch (error) {
      if (error instanceof CommercePromotionError) {
        fail("KNOWLEDGE_PROMOTION_STATE_INVALID", "promotion pricing state is invalid");
      }
      throw error;
    }
    return {
      answerText: catalogPriceAnswer({
        language: params.language,
        itemName: productName,
        unitPriceIqd: resolved.effective_amount_minor,
        baseUnitPriceIqd: resolved.base_amount_minor,
        currencyCode,
        promotionApplied: resolved.promotion_applied,
        commerce,
      }),
      language: params.language,
      confidence: 1,
      factType: commerce.item_type === "service" ? "service_price" : "product_price",
      recordId: resolved.promotion_id
        ? `${recordId}:promotion:${resolved.promotion_id}`
        : recordId,
      contextRecordId: catalogContextRecordId(productId, variantId),
    };
  }

  return {
    answerText: catalogAvailabilityAnswer({
      language: params.language,
      itemName: productName,
      status:
        commerce.track_inventory
          ? quantity > 0
            ? "available"
            : "out_of_stock"
          : text(product.status, 40),
      authoritativeQuantity: quantity,
      commerce,
      requestedQuantity: commerce.track_inventory
        ? requestedCatalogQuantity(params.customer)
        : null,
    }),
    language: params.language,
    confidence: 1,
    factType: commerce.item_type === "service" ? "service_availability" : "product_stock",
    recordId,
    contextRecordId: catalogContextRecordId(productId, variantId),
  };
}

function extractOrderId(customerText: string): string | null {
  const patterns = [
    /(?:order\s+(?:status|id)|order)\s*[#:\-]?\s*([a-z0-9][a-z0-9_-]{2,80})/i,
    /(?:طلب|الطلب|رقم\s*الطلب)\s*[#:\-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,80})/u,
  ];
  for (const pattern of patterns) {
    const match = customerText.match(pattern);
    if (match?.[1]) return boundedText(match[1], 100);
  }
  return null;
}

function localizedMoney(
  amountMinor: number,
  currencyCode: string,
  language: KnowledgeLanguage,
): string {
  const amount = formatMinorCurrencyNumber(amountMinor, currencyCode);
  const currency = currencyCode === "IQD" && language !== "en" ? "دينار" : currencyCode;
  return `${amount} ${currency}`;
}

const ORDER_SQL = `
SELECT o.id, o.merchant_id, o.status, o.payment_method, o.payment_status, o.total_iqd,
       o.version, o.updated_at, m.currency_code AS merchant_currency_code
FROM orders o
JOIN merchants m ON m.id = o.merchant_id
WHERE o.merchant_id = $1
  AND o.id = $2
  AND (
    (o.conversation_id IS NOT NULL AND o.conversation_id = $3)
    OR (
      o.conversation_id IS NULL
      AND o.customer_external_id IS NOT NULL
      AND o.customer_external_id = $4
    )
  )
LIMIT 2`;

async function resolveOrderFact(
  sql: KnowledgeSqlExecutor,
  merchantId: string,
  customerText: string,
  language: KnowledgeLanguage,
  conversationId?: string,
  customerExternalId?: string,
) {
  const orderId = extractOrderId(customerText);
  if (!orderId) return null;

  const trustedConversationId = boundedText(conversationId, 160);
  const trustedCustomerExternalId = boundedText(customerExternalId, 200);
  if (!trustedConversationId && !trustedCustomerExternalId) {
    return null;
  }

  let rows: Record<string, unknown>[];
  try {
    rows = (
      await sql.query(ORDER_SQL, [
        merchantId,
        orderId,
        trustedConversationId || null,
        trustedCustomerExternalId || null,
      ])
    ).rows;
  } catch {
    fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }
  if (rows.length > 1) fail("KNOWLEDGE_ORDER_AMBIGUOUS", "authoritative order fact is ambiguous", 409);
  const row = rows[0];
  if (!row) return null;
  tenant(row, merchantId);
  version(row.version);
  const status = text(row.status, 60);
  const paymentStatus = text(row.payment_status, 60);
  const total = integer(row.total_iqd);
  const currencyCode = merchantCurrency(row.merchant_currency_code);
  if (!status || !paymentStatus) fail("KNOWLEDGE_STATE_INVALID", "order fact state is invalid");
  const totalText = localizedMoney(total, currencyCode, language);
  const answer = language === "en"
    ? `Order ${orderId}: status ${status}; payment ${paymentStatus}; total ${totalText}.`
    : language === "ku"
      ? `داواکاری ${orderId}: دۆخ ${status}؛ پارەدان ${paymentStatus}؛ کۆی گشتی ${totalText}.`
      : `الطلب ${orderId}: الحالة ${status}؛ الدفع ${paymentStatus}؛ المجموع ${totalText}.`;
  return { answerText: answer, language, confidence: 1, factType: "order_status", recordId: orderId };
}

function combineFactResults(
  facts: DatabaseFactResult[],
  language: KnowledgeLanguage,
): DatabaseFactResult | null {
  if (!facts.length) return null;
  if (facts.length === 1) return facts[0];

  const answerText = boundedText(
    facts.map((fact) => fact.answerText.trim()).filter(Boolean).join("\n"),
    2_000,
  );
  if (!answerText) return null;

  const ids = facts
    .map((fact) => boundedText(fact.recordId, 200))
    .filter(Boolean);
  const sharedRecordId =
    ids.length === facts.length && new Set(ids).size === 1 ? ids[0] : undefined;
  const contextIds = facts
    .map((fact) => boundedText(fact.contextRecordId, 240))
    .filter(Boolean);
  const sharedContextRecordId =
    contextIds.length === facts.length && new Set(contextIds).size === 1
      ? contextIds[0]
      : undefined;

  return {
    answerText,
    language,
    confidence: Math.min(...facts.map((fact) => fact.confidence)),
    factType: `combined_${facts.map((fact) => fact.factType).join("_")}`,
    ...(sharedRecordId ? { recordId: sharedRecordId } : {}),
    ...(sharedContextRecordId ? { contextRecordId: sharedContextRecordId } : {}),
  };
}

export class PostgresOperationalFactResolver implements KnowledgeFactResolver {
  constructor(private readonly sql: KnowledgeSqlExecutor = getPostgresKnowledgeSqlClient()) {}

  async resolve(input: KnowledgeFactResolverInput) {
    const merchantId = boundedText(input.merchantId, 160);
    const normalized = normalizeKnowledgeText(input.customerText);
    if (!merchantId || !normalized) return null;

    const weight = containsAny(normalized, WEIGHT_TERMS);
    const dimensions = containsAny(normalized, DIMENSION_TERMS);
    const physicalIntent = weight || dimensions;
    const deliveryIntent = containsAny(normalized, DELIVERY_TERMS);
    const kinds = {
      delivery: deliveryIntent,
      payment: containsAny(normalized, PAYMENT_TERMS),
      business: containsAny(normalized, BUSINESS_TERMS),
      price:
        !physicalIntent &&
        !deliveryIntent &&
        containsAny(normalized, PRICE_TERMS),
      stock: containsAny(normalized, STOCK_TERMS),
      weight,
      dimensions,
      order: containsAny(normalized, ORDER_TERMS),
      warranty: containsAny(normalized, WARRANTY_TERMS),
    };
    const requested = Object.entries(kinds)
      .filter(([, matched]) => matched)
      .map(([kind]) => kind as OperationalFactKind);
    if (!requested.length) return null;

    let settingsRow: Record<string, unknown> | null = null;
    const merchantSettings = async () => {
      if (!settingsRow) settingsRow = await settings(this.sql, merchantId);
      return settingsRow;
    };

    const resolveKind = async (
      kind: OperationalFactKind,
    ): Promise<DatabaseFactResult | null> => {
      if (kind === "warranty") {
        // Merchant product warranty has no structured authority yet.
        // Do not mix an untrusted warranty answer into an otherwise valid multi-intent reply.
        return null;
      }

      if (kind === "weight" || kind === "dimensions") {
        return resolveMeasurementFact({
          sql: this.sql,
          merchantId,
          customer: normalized,
          language: input.language,
          kind,
          trustedProductIdHint: input.trustedProductIdHint,
          trustedVariantIdHint: input.trustedVariantIdHint,
        });
      }

      if (kind === "price" || kind === "stock") {
        return resolveProductFact({
          sql: this.sql,
          merchantId,
          customer: normalized,
          language: input.language,
          kind,
          trustedProductIdHint: input.trustedProductIdHint,
          trustedVariantIdHint: input.trustedVariantIdHint,
        });
      }

      if (kind === "order") {
        return resolveOrderFact(
          this.sql,
          merchantId,
          input.customerText,
          input.language,
          input.conversationId,
          input.customerExternalId,
        );
      }

      const row = await merchantSettings();
      if (!bool(row.auto_reply_enabled)) return null;

      if (kind === "delivery") {
        return resolveDeliveryFact({
          sql: this.sql,
          merchantId,
          customerText: input.customerText,
          language: input.language,
          row,
        });
      }

      if (kind === "payment") {
        return {
          answerText: localizedPayment(row, input.language),
          language: input.language,
          confidence: 1,
          factType: "payment_policy",
          recordId: `${merchantId}:settings:${version(row.settings_version)}`,
        };
      }

      const storeName = text(row.store_name, 300);
      if (!storeName) {
        fail("KNOWLEDGE_FACT_UNAVAILABLE", "authoritative fact is unavailable");
      }
      return {
        answerText: storeName,
        language: input.language,
        confidence: 1,
        factType: "business_name",
        recordId: merchantId,
      };
    };

    const resolvedFacts: DatabaseFactResult[] = [];
    for (const kind of requested) {
      const resolved = await resolveKind(kind);
      if (!resolved) return null;
      resolvedFacts.push(resolved);
    }
    return combineFactResults(resolvedFacts, input.language);
  }
}
