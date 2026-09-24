import {
  isAuthoritativeFactQuestion,
  getPostgresKnowledgeSqlClient,
  KnowledgeRuntimeGateError,
  type KnowledgeSqlExecutor,
} from "./postgresKnowledgeRuntime.js";
import {
  boundedText,
  normalizeKnowledgeText,
} from "./normalization.js";
import type {
  KnowledgeLanguage,
  MerchantCatalogContextResolver,
  MerchantCatalogKnowledge,
} from "./types.js";

const PRODUCT_POLICY_TERMS = [
  "ضمان",
  "كفالة",
  "ارجاع",
  "إرجاع",
  "استرجاع",
  "استبدال",
  "سياسة",
  "warranty",
  "guarantee",
  "return",
  "refund",
  "exchange",
  "policy",
  "گەڕاندنەوە",
  "گۆڕینەوە",
] as const;

const STRUCTURED_MEASUREMENT_TERMS = [
  "وزن",
  "الوزن",
  "أبعاد",
  "ابعاد",
  "الطول",
  "العرض",
  "الارتفاع",
  "weight",
  "dimensions",
  "measurements",
  "length",
  "width",
  "height",
  "کێش",
  "ڕەهەند",
  "درێژی",
  "پانی",
  "بەرزی",
] as const;

const PRODUCTS_SQL = `
SELECT id, merchant_id, name, sku, code, barcode, external_ref,
       category, description, version, status, allow_fawri_reply
FROM products
WHERE merchant_id = $1
  AND deleted_at IS NULL
  AND allow_fawri_reply = TRUE
  AND status IN ('available', 'low_stock', 'out_of_stock')
  AND version > 0
LIMIT 250`;

const VARIANTS_SQL = `
SELECT id, merchant_id, product_id, external_ref, name, color, size, sku, barcode, version
FROM product_variants
WHERE merchant_id = $1
  AND product_id = $2
  AND version > 0
LIMIT 150`;

const OPTIONS_SQL = `
SELECT merchant_id, product_id, variant_id, option_name, option_value, ordinal
FROM catalog_variant_options
WHERE merchant_id = $1
  AND product_id = $2
ORDER BY ordinal ASC, option_name ASC, option_value ASC
LIMIT 500`;

function fail(code: string, message: string, status = 503): never {
  throw new KnowledgeRuntimeGateError(code, message, status);
}

function text(value: unknown, max = 2_000): string {
  return boundedText(value, max);
}

function blocksCatalogGrounding(
  customerText: string,
  allowOperationalContext = false,
): boolean {
  const normalized = normalizeKnowledgeText(customerText);
  if (
    PRODUCT_POLICY_TERMS.some((term) =>
      normalized.includes(normalizeKnowledgeText(term)),
    )
  ) return true;
  if (allowOperationalContext) return false;
  if (isAuthoritativeFactQuestion(customerText)) return true;
  return STRUCTURED_MEASUREMENT_TERMS.some((term) =>
    normalized.includes(normalizeKnowledgeText(term)),
  );
}

function identifierMatches(
  customer: string,
  value: unknown,
  minimumLength = 2,
): boolean {
  const candidate = normalizeKnowledgeText(value);
  return candidate.length >= minimumLength && customer.includes(candidate);
}

function productMatchScore(
  customer: string,
  row: Record<string, unknown>,
): number {
  let score = 0;
  if (identifierMatches(customer, row.name, 3)) score += 100;
  for (const key of ["sku", "barcode", "code", "external_ref"] as const) {
    if (identifierMatches(customer, row[key])) score += 160;
  }
  return score;
}

function variantMatchScore(
  customer: string,
  row: Record<string, unknown>,
  optionRows: Record<string, unknown>[],
): number {
  let score = 0;
  for (const key of ["sku", "barcode", "external_ref"] as const) {
    if (identifierMatches(customer, row[key])) score += 180;
  }
  for (const key of ["name", "color", "size"] as const) {
    if (identifierMatches(customer, row[key])) score += 70;
  }
  const variantId = text(row.id, 160);
  for (const option of optionRows) {
    if (text(option.variant_id, 160) !== variantId) continue;
    if (identifierMatches(customer, option.option_value)) score += 70;
    if (
      identifierMatches(
        customer,
        `${text(option.option_name, 120)} ${text(option.option_value, 240)}`,
      )
    ) {
      score += 20;
    }
  }
  return score;
}

function bestMatch(
  rows: Array<{ row: Record<string, unknown>; score: number }>,
): { row: Record<string, unknown> | null; ambiguous: boolean } {
  const matched = rows
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!matched.length) return { row: null, ambiguous: false };
  if (matched[1] && matched[1].score === matched[0].score) {
    return { row: null, ambiguous: true };
  }
  return { row: matched[0].row, ambiguous: false };
}

function addOption(
  options: Map<string, Set<string>>,
  nameValue: unknown,
  optionValue: unknown,
): void {
  const name = text(nameValue, 120);
  const value = text(optionValue, 240);
  if (!name || !value) return;
  const existing = options.get(name) || new Set<string>();
  if (existing.size < 40) existing.add(value);
  options.set(name, existing);
}

function validateVariantRows(
  variants: Record<string, unknown>[],
  merchantId: string,
  productId: string,
): void {
  for (const row of variants) {
    if (
      text(row.merchant_id, 160) !== merchantId ||
      text(row.product_id, 160) !== productId
    ) {
      fail(
        "KNOWLEDGE_TENANT_VIOLATION",
        "catalog grounding tenant boundary violation",
      );
    }
    if (!Number.isInteger(Number(row.version)) || Number(row.version) <= 0) {
      fail("KNOWLEDGE_STATE_INVALID", "catalog variant state is invalid");
    }
  }
}

function validateOptionRows(
  rows: Record<string, unknown>[],
  merchantId: string,
  productId: string,
): void {
  for (const row of rows) {
    if (
      text(row.merchant_id, 160) !== merchantId ||
      text(row.product_id, 160) !== productId
    ) {
      fail(
        "KNOWLEDGE_TENANT_VIOLATION",
        "catalog option tenant boundary violation",
      );
    }
    if (!text(row.variant_id, 160)) {
      fail("KNOWLEDGE_STATE_INVALID", "catalog option variant state is invalid");
    }
  }
}

function optionsArray(
  variants: Record<string, unknown>[],
  optionRows: Record<string, unknown>[],
): MerchantCatalogKnowledge["options"] {
  const options = new Map<string, Set<string>>();

  for (const row of variants) {
    addOption(options, "color", row.color);
    addOption(options, "size", row.size);
  }
  for (const row of optionRows) {
    addOption(options, row.option_name, row.option_value);
  }

  return [...options.entries()]
    .slice(0, 20)
    .map(([name, values]) => ({
      name,
      values: [...values].slice(0, 40),
    }));
}

function selectedVariantOptions(
  variant: Record<string, unknown>,
  optionRows: Record<string, unknown>[],
): Record<string, string> {
  const selected: Record<string, string> = {};
  const color = text(variant.color, 240);
  const size = text(variant.size, 240);
  if (color) selected.color = color;
  if (size) selected.size = size;

  const variantId = text(variant.id, 160);
  for (const row of optionRows) {
    if (text(row.variant_id, 160) !== variantId) continue;
    const name = text(row.option_name, 120);
    const value = text(row.option_value, 240);
    if (name && value) selected[name] = value;
  }
  return selected;
}

function factualText(params: {
  name: string;
  category?: string;
  description?: string;
  sku?: string;
  variantName?: string;
  variantSku?: string;
  selectedOptions?: Record<string, string>;
  options: MerchantCatalogKnowledge["options"];
}): string {
  const facts = [`Product name: ${params.name}`];
  if (params.category) facts.push(`Category: ${params.category}`);
  if (params.description) facts.push(`Description: ${params.description}`);
  if (params.sku) facts.push(`SKU: ${params.sku}`);
  if (params.variantName) facts.push(`Selected variant: ${params.variantName}`);
  if (params.variantSku) facts.push(`Selected variant SKU: ${params.variantSku}`);
  for (const [name, value] of Object.entries(params.selectedOptions || {})) {
    facts.push(`Selected option ${name}: ${value}`);
  }
  for (const option of params.options) {
    facts.push(`Available option ${option.name}: ${option.values.join(", ")}`);
  }
  return boundedText(facts.join("\n"), 6_000);
}

function productContextId(productId: string, variantId?: string): string {
  return variantId
    ? `catalog-variant:${productId}:${variantId}`
    : `catalog-product:${productId}`;
}

export class PostgresMerchantCatalogContextResolver
  implements MerchantCatalogContextResolver
{
  constructor(
    private readonly sql: KnowledgeSqlExecutor = getPostgresKnowledgeSqlClient(),
  ) {}

  async listRelevantContext(input: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
    limit?: number;
    trustedProductIdHint?: string;
    trustedVariantIdHint?: string;
    allowOperationalContext?: boolean;
  }): Promise<MerchantCatalogKnowledge[]> {
    const merchantId = text(input.merchantId, 160);
    const customerText = text(input.customerText, 2_000);
    const normalizedCustomer = normalizeKnowledgeText(customerText);
    const trustedProductIdHint = text(input.trustedProductIdHint, 160);
    const trustedVariantIdHint = text(input.trustedVariantIdHint, 160);
    const limit = Math.max(1, Math.min(4, Math.trunc(input.limit ?? 1)));

    if (!merchantId || !customerText || !normalizedCustomer) return [];
    if (
      blocksCatalogGrounding(
        customerText,
        input.allowOperationalContext === true,
      )
    ) return [];

    let products: Record<string, unknown>[];
    try {
      products = (
        await this.sql.query<Record<string, unknown>>(PRODUCTS_SQL, [merchantId])
      ).rows;
    } catch {
      fail(
        "KNOWLEDGE_CATALOG_CONTEXT_UNAVAILABLE",
        "merchant catalog context is unavailable",
      );
    }

    for (const row of products) {
      if (text(row.merchant_id, 160) !== merchantId) {
        fail(
          "KNOWLEDGE_TENANT_VIOLATION",
          "catalog grounding tenant boundary violation",
        );
      }
      if (
        row.allow_fawri_reply !== true ||
        !["available", "low_stock", "out_of_stock"].includes(text(row.status, 40)) ||
        !Number.isInteger(Number(row.version)) ||
        Number(row.version) <= 0
      ) {
        fail(
          "KNOWLEDGE_PROVENANCE_INVALID",
          "catalog grounding provenance is invalid",
        );
      }
    }

    const directProduct = bestMatch(
      products.map((row) => ({
        row,
        score: productMatchScore(normalizedCustomer, row),
      })),
    );
    if (directProduct.ambiguous) {
      fail(
        "KNOWLEDGE_PRODUCT_AMBIGUOUS",
        "merchant catalog product reference is ambiguous",
        409,
      );
    }

    const product =
      directProduct.row ||
      (trustedProductIdHint
        ? products.find((row) => text(row.id, 160) === trustedProductIdHint) || null
        : null);
    if (!product) return [];

    const productId = text(product.id, 160);
    const name = text(product.name, 300);
    if (!productId || !name) {
      fail(
        "KNOWLEDGE_STATE_INVALID",
        "catalog grounding product state is invalid",
      );
    }

    let variants: Record<string, unknown>[];
    let optionRows: Record<string, unknown>[];
    try {
      variants = (
        await this.sql.query<Record<string, unknown>>(VARIANTS_SQL, [
          merchantId,
          productId,
        ])
      ).rows;
      optionRows = (
        await this.sql.query<Record<string, unknown>>(OPTIONS_SQL, [
          merchantId,
          productId,
        ])
      ).rows;
    } catch {
      fail(
        "KNOWLEDGE_CATALOG_CONTEXT_UNAVAILABLE",
        "merchant catalog details are unavailable",
      );
    }
    validateVariantRows(variants, merchantId, productId);
    validateOptionRows(optionRows, merchantId, productId);

    const directVariant = bestMatch(
      variants.map((row) => ({
        row,
        score: variantMatchScore(normalizedCustomer, row, optionRows),
      })),
    );
    if (directVariant.ambiguous) {
      fail(
        "KNOWLEDGE_VARIANT_AMBIGUOUS",
        "merchant catalog variant reference is ambiguous",
        409,
      );
    }

    const mayReuseVariantHint =
      Boolean(trustedVariantIdHint) &&
      Boolean(trustedProductIdHint) &&
      trustedProductIdHint === productId;
    const selectedVariant =
      directVariant.row ||
      (mayReuseVariantHint
        ? variants.find((row) => text(row.id, 160) === trustedVariantIdHint) || null
        : null);

    const category = text(product.category, 300);
    const description = text(product.description, 2_000);
    const sku = text(product.sku, 200);
    const options = optionsArray(variants, optionRows);
    const variantId = selectedVariant ? text(selectedVariant.id, 160) : "";
    const variantName = selectedVariant ? text(selectedVariant.name, 300) : "";
    const variantSku = selectedVariant ? text(selectedVariant.sku, 200) : "";
    const selectedOptions = selectedVariant
      ? selectedVariantOptions(selectedVariant, optionRows)
      : undefined;

    if (!category && !description && !sku && options.length === 0) return [];

    const knowledge: MerchantCatalogKnowledge = {
      id: productContextId(productId, variantId || undefined),
      productId,
      ...(variantId ? { variantId } : {}),
      name,
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
      ...(sku ? { sku } : {}),
      ...(variantName ? { variantName } : {}),
      ...(variantSku ? { variantSku } : {}),
      ...(selectedOptions && Object.keys(selectedOptions).length
        ? { selectedOptions }
        : {}),
      options,
      factualText: factualText({
        name,
        ...(category ? { category } : {}),
        ...(description ? { description } : {}),
        ...(sku ? { sku } : {}),
        ...(variantName ? { variantName } : {}),
        ...(variantSku ? { variantSku } : {}),
        ...(selectedOptions ? { selectedOptions } : {}),
        options,
      }),
      confidence: 1,
    };

    return [knowledge].slice(0, limit);
  }
}
