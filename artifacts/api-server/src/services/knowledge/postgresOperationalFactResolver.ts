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
  KnowledgeFactResolver,
  KnowledgeFactResolverInput,
  KnowledgeLanguage,
} from "./types.js";

const DELIVERY_TERMS = ["توصيل", "التوصيل", "شحن", "يوصل", "delivery", "shipping", "گەیاندن", "گواستنەوە"];
const PAYMENT_TERMS = ["دفع", "الدفع", "كاش", "نقد", "payment", "pay", "cash", "پارەدان"];
const BUSINESS_TERMS = ["اسم المتجر", "اسم المحل", "store name", "business name", "ناوی فرۆشگا"];
const PRICE_TERMS = ["سعر", "السعر", "بكم", "شكد", "price", "cost", "نرخ"];
const STOCK_TERMS = ["مخزون", "متوفر", "متوفره", "متوفرة", "available", "stock", "in stock", "بەردەست"];
const ORDER_TERMS = ["حالة الطلب", "طلبي", "الطلب", "order status", "my order", "داواکاری"];
const WARRANTY_TERMS = ["ضمان", "كفالة", "warranty", "guarantee"];

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

function localizedDelivery(row: Record<string, unknown>, lang: KnowledgeLanguage): string {
  const enabled = bool(row.delivery_enabled);
  if (!enabled) {
    if (lang === "en") return "Delivery is currently unavailable.";
    if (lang === "ku") return "گەیاندن لە ئێستادا بەردەست نییە.";
    return "التوصيل غير متاح حاليًا.";
  }
  const min = integer(row.delivery_estimated_days_min);
  const max = integer(row.delivery_estimated_days_max);
  const fee = integer(row.delivery_fee_iqd);
  if (min <= 0 || max < min || max > 30) {
    fail("KNOWLEDGE_POLICY_INVALID", "merchant knowledge policy is invalid");
  }
  const days = min === max ? String(min) : `${min}-${max}`;
  if (lang === "en") return `Delivery is available. Estimated delivery time is ${days} day(s). Delivery fee is ${fee.toLocaleString("en-US")} IQD.`;
  if (lang === "ku") return `گەیاندن بەردەستە. ماوەی خەمڵێنراو ${days} ڕۆژە و کرێی گەیاندن ${fee.toLocaleString("en-US")} دینارە.`;
  return `التوصيل متاح. المدة التقديرية ${days} يوم، ورسوم التوصيل ${fee.toLocaleString("en-US")} دينار.`;
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
       m.account_status, ms.version AS settings_version, ms.auto_reply_enabled,
       ms.delivery_enabled, ms.delivery_fee_iqd,
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
SELECT id, merchant_id, external_ref, code, name, sku, barcode,
       current_price_iqd, quantity, low_stock_threshold, variant_stock_mode,
       version, status, allow_fawri_reply, updated_at
FROM products
WHERE merchant_id = $1
  AND deleted_at IS NULL
  AND allow_fawri_reply = TRUE
  AND status IN ('available', 'low_stock', 'out_of_stock')
  AND version > 0
LIMIT 250`;

const VARIANTS_SQL = `
SELECT id, product_id, merchant_id, external_ref, name, color, size, sku, barcode,
       quantity, price_adjustment_iqd, price_override_iqd, option_signature,
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

async function resolveProductFact(params: {
  sql: KnowledgeSqlExecutor;
  merchantId: string;
  customer: string;
  language: KnowledgeLanguage;
  kind: "price" | "stock";
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
    if (bool(row.allow_fawri_reply) !== true || !["available", "low_stock", "out_of_stock"].includes(text(row.status, 40))) {
      fail("KNOWLEDGE_PROVENANCE_INVALID", "catalog fact provenance is invalid");
    }
  }
  const product = uniqueBest(
    products.map((row) => ({ row, score: productMatchScore(params.customer, row) })),
    "KNOWLEDGE_PRODUCT_AMBIGUOUS",
  );
  if (!product) return null;

  const productId = text(product.id, 160);
  const productName = text(product.name, 300);
  if (!productId || !productName) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");

  let unitPrice = integer(product.current_price_iqd);
  let quantity = integer(product.quantity);
  const variantMode = bool(product.variant_stock_mode);
  let recordId = productId;

  if (variantMode) {
    let variants: Record<string, unknown>[];
    try {
      variants = (await params.sql.query(VARIANTS_SQL, [params.merchantId, productId])).rows;
    } catch {
      fail("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
    }
    for (const row of variants) {
      tenant(row, params.merchantId);
      if (text(row.product_id, 160) !== productId) fail("KNOWLEDGE_TENANT_VIOLATION", "knowledge tenant boundary violation");
      version(row.version);
    }
    const variant = uniqueBest(
      variants.map((row) => ({ row, score: variantMatchScore(params.customer, row) })),
      "KNOWLEDGE_VARIANT_AMBIGUOUS",
    );
    if (!variant) {
      fail("KNOWLEDGE_VARIANT_REQUIRED", "an unambiguous product variant is required", 409);
    }
    const override = variant.price_override_iqd;
    const adjustment = Number(variant.price_adjustment_iqd);
    if (!Number.isSafeInteger(adjustment)) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
    unitPrice = override === null || override === undefined ? unitPrice + adjustment : integer(override);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
    quantity = integer(variant.quantity);
    recordId = text(variant.id, 160);
    if (!recordId) fail("KNOWLEDGE_STATE_INVALID", "catalog fact state is invalid");
  }

  if (params.kind === "price") {
    const answer = params.language === "en"
      ? `${productName} is ${unitPrice.toLocaleString("en-US")} IQD.`
      : params.language === "ku"
        ? `نرخی ${productName} بریتییە لە ${unitPrice.toLocaleString("en-US")} دینار.`
        : `سعر ${productName} هو ${unitPrice.toLocaleString("en-US")} دينار.`;
    return { answerText: answer, language: params.language, confidence: 1, factType: "product_price", recordId };
  }

  const available = quantity > 0 && text(product.status, 40) !== "out_of_stock";
  const answer = params.language === "en"
    ? `${productName} is ${available ? `available (${quantity} in stock)` : "currently out of stock"}.`
    : params.language === "ku"
      ? `${productName} ${available ? `بەردەستە (${quantity} دانە)` : "لە ئێستادا بەردەست نییە"}.`
      : `${productName} ${available ? `متوفر حاليًا (${quantity} بالمخزون)` : "غير متوفر حاليًا"}.`;
  return { answerText: answer, language: params.language, confidence: 1, factType: "product_stock", recordId };
}

function extractOrderId(customerText: string): string | null {
  const patterns = [
    /(?:order|order\s*id)\s*[#:\-]?\s*([a-z0-9][a-z0-9_-]{2,80})/i,
    /(?:طلب|الطلب|رقم\s*الطلب)\s*[#:\-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,80})/u,
  ];
  for (const pattern of patterns) {
    const match = customerText.match(pattern);
    if (match?.[1]) return boundedText(match[1], 100);
  }
  return null;
}

const ORDER_SQL = `
SELECT id, merchant_id, status, payment_method, payment_status, total_iqd,
       version, updated_at
FROM orders
WHERE merchant_id = $1 AND id = $2
LIMIT 2`;

async function resolveOrderFact(
  sql: KnowledgeSqlExecutor,
  merchantId: string,
  customerText: string,
  language: KnowledgeLanguage,
) {
  const orderId = extractOrderId(customerText);
  if (!orderId) return null;
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql.query(ORDER_SQL, [merchantId, orderId])).rows;
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
  if (!status || !paymentStatus) fail("KNOWLEDGE_STATE_INVALID", "order fact state is invalid");
  const answer = language === "en"
    ? `Order ${orderId}: status ${status}; payment ${paymentStatus}; total ${total.toLocaleString("en-US")} IQD.`
    : language === "ku"
      ? `داواکاری ${orderId}: دۆخ ${status}؛ پارەدان ${paymentStatus}؛ کۆی گشتی ${total.toLocaleString("en-US")} دینار.`
      : `الطلب ${orderId}: الحالة ${status}؛ الدفع ${paymentStatus}؛ المجموع ${total.toLocaleString("en-US")} دينار.`;
  return { answerText: answer, language, confidence: 1, factType: "order_status", recordId: orderId };
}

export class PostgresOperationalFactResolver implements KnowledgeFactResolver {
  constructor(private readonly sql: KnowledgeSqlExecutor = getPostgresKnowledgeSqlClient()) {}

  async resolve(input: KnowledgeFactResolverInput) {
    const merchantId = boundedText(input.merchantId, 160);
    const normalized = normalizeKnowledgeText(input.customerText);
    if (!merchantId || !normalized) return null;

    const kinds = {
      delivery: containsAny(normalized, DELIVERY_TERMS),
      payment: containsAny(normalized, PAYMENT_TERMS),
      business: containsAny(normalized, BUSINESS_TERMS),
      price: containsAny(normalized, PRICE_TERMS),
      stock: containsAny(normalized, STOCK_TERMS),
      order: containsAny(normalized, ORDER_TERMS),
      warranty: containsAny(normalized, WARRANTY_TERMS),
    };
    const requested = Object.entries(kinds).filter(([, matched]) => matched).map(([kind]) => kind);
    if (!requested.length) return null;
    if (requested.length > 1) {
      fail("KNOWLEDGE_FACT_AMBIGUOUS", "authoritative fact request is ambiguous", 409);
    }

    if (kinds.warranty) {
      // The current PostgreSQL authority has no structured warranty-policy column.
      // Treat unstructured text/metadata as ambiguous provenance instead of guessing.
      return null;
    }

    if (kinds.price || kinds.stock) {
      return resolveProductFact({
        sql: this.sql,
        merchantId,
        customer: normalized,
        language: input.language,
        kind: kinds.price ? "price" : "stock",
      });
    }

    if (kinds.order) {
      return resolveOrderFact(this.sql, merchantId, input.customerText, input.language);
    }

    const row = await settings(this.sql, merchantId);
    if (!bool(row.auto_reply_enabled)) return null;
    if (kinds.delivery) {
      return {
        answerText: localizedDelivery(row, input.language),
        language: input.language,
        confidence: 1,
        factType: "delivery_policy",
        recordId: `${merchantId}:settings:${version(row.settings_version)}`,
      };
    }
    if (kinds.payment) {
      return {
        answerText: localizedPayment(row, input.language),
        language: input.language,
        confidence: 1,
        factType: "payment_policy",
        recordId: `${merchantId}:settings:${version(row.settings_version)}`,
      };
    }
    const storeName = text(row.store_name, 300);
    if (!storeName) fail("KNOWLEDGE_FACT_UNAVAILABLE", "authoritative fact is unavailable");
    return {
      answerText: storeName,
      language: input.language,
      confidence: 1,
      factType: "business_name",
      recordId: merchantId,
    };
  }
}
