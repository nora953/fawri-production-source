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
SELECT id, merchant_id, product_id, name, color, size, sku, version
FROM product_variants
WHERE merchant_id = $1
  AND product_id = $2
  AND version > 0
LIMIT 150`;

const OPTIONS_SQL = `
SELECT merchant_id, product_id, option_name, option_value, ordinal
FROM catalog_variant_options
WHERE merchant_id = $1
  AND product_id = $2
ORDER BY ordinal ASC, option_name ASC, option_value ASC
LIMIT 500`;

function fail(code: string, message: string): never {
  throw new KnowledgeRuntimeGateError(code, message);
}

function text(value: unknown, max = 2_000): string {
  return boundedText(value, max);
}

function blocksCatalogGrounding(customerText: string): boolean {
  if (isAuthoritativeFactQuestion(customerText)) return true;
  const normalized = normalizeKnowledgeText(customerText);
  return PRODUCT_POLICY_TERMS.some((term) =>
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

function uniqueBest(
  rows: Array<{ row: Record<string, unknown>; score: number }>,
): Record<string, unknown> | null {
  const matched = rows
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!matched.length) return null;
  if (matched[1] && matched[1].score === matched[0].score) return null;
  return matched[0].row;
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

function optionsArray(
  variants: Record<string, unknown>[],
  optionRows: Record<string, unknown>[],
  merchantId: string,
  productId: string,
): MerchantCatalogKnowledge["options"] {
  const options = new Map<string, Set<string>>();

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
    addOption(options, "color", row.color);
    addOption(options, "size", row.size);
  }

  for (const row of optionRows) {
    if (
      text(row.merchant_id, 160) !== merchantId ||
      text(row.product_id, 160) !== productId
    ) {
      fail(
        "KNOWLEDGE_TENANT_VIOLATION",
        "catalog option tenant boundary violation",
      );
    }
    addOption(options, row.option_name, row.option_value);
  }

  return [...options.entries()]
    .slice(0, 20)
    .map(([name, values]) => ({
      name,
      values: [...values].slice(0, 40),
    }));
}

function factualText(params: {
  name: string;
  category?: string;
  description?: string;
  sku?: string;
  options: MerchantCatalogKnowledge["options"];
}): string {
  const facts = [`Product name: ${params.name}`];
  if (params.category) facts.push(`Category: ${params.category}`);
  if (params.description) facts.push(`Description: ${params.description}`);
  if (params.sku) facts.push(`SKU: ${params.sku}`);
  for (const option of params.options) {
    facts.push(`Option ${option.name}: ${option.values.join(", ")}`);
  }
  return boundedText(facts.join("\n"), 6_000);
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
  }): Promise<MerchantCatalogKnowledge[]> {
    const merchantId = text(input.merchantId, 160);
    const customerText = text(input.customerText, 2_000);
    const normalizedCustomer = normalizeKnowledgeText(customerText);
    const limit = Math.max(1, Math.min(4, Math.trunc(input.limit ?? 1)));

    if (!merchantId || !customerText || !normalizedCustomer) return [];
    if (blocksCatalogGrounding(customerText)) return [];

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
        fail("KNOWLEDGE_PROVENANCE_INVALID", "catalog grounding provenance is invalid");
      }
    }

    const product = uniqueBest(
      products.map((row) => ({
        row,
        score: productMatchScore(normalizedCustomer, row),
      })),
    );
    if (!product) return [];

    const productId = text(product.id, 160);
    const name = text(product.name, 300);
    if (!productId || !name) {
      fail("KNOWLEDGE_STATE_INVALID", "catalog grounding product state is invalid");
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

    const category = text(product.category, 300);
    const description = text(product.description, 2_000);
    const sku = text(product.sku, 200);
    const options = optionsArray(
      variants,
      optionRows,
      merchantId,
      productId,
    );

    if (!category && !description && !sku && options.length === 0) return [];

    const knowledge: MerchantCatalogKnowledge = {
      id: `catalog-product:${productId}`,
      productId,
      name,
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
      ...(sku ? { sku } : {}),
      options,
      factualText: factualText({
        name,
        ...(category ? { category } : {}),
        ...(description ? { description } : {}),
        ...(sku ? { sku } : {}),
        options,
      }),
      confidence: 1,
    };

    return [knowledge].slice(0, limit);
  }
}
