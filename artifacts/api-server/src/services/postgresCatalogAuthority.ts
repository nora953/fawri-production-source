import { CatalogRuntimeError } from "./catalogInventoryRuntime";
import {
  normalizeCatalogMerchantId,
  normalizeCatalogProductId,
} from "./catalogProductNormalization";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import * as core from "./postgresCatalogAuthorityCore";

export * from "./postgresCatalogAuthorityCore";

const ARCHIVE_OPTION = "__fawri_archived_variant_id";

type VariantIdentity = {
  id: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function variantId(value: unknown): string {
  return String(asRecord(value).id || "").trim();
}

function filterArchivedProduct<T>(product: T, archived: Set<string>): T {
  if (archived.size === 0 || !product || typeof product !== "object") return product;
  const carrier = product as T & { variants?: VariantIdentity[] };
  if (!Array.isArray(carrier.variants)) return product;
  return Object.assign({}, product, {
    variants: carrier.variants.filter((variant) => !archived.has(variant.id)),
  }) as T;
}

function archivedShadow(value: unknown): Record<string, unknown> {
  const shadow = structuredClone(asRecord(value));
  const id = String(shadow.id || "").trim();
  shadow.sku = "";
  shadow.barcode = "";
  shadow.stock_quantity = 0;
  shadow.options = {
    [ARCHIVE_OPTION]: id.slice(0, 120) || "archived",
  };
  shadow.image_refs = [];
  delete shadow.price_iqd;
  delete shadow.cost_iqd;
  return shadow;
}

async function readArchivedVariantIds(
  merchantId: string,
  productId?: string,
): Promise<Set<string>> {
  if (!operationalPostgresAuthorityRequired()) return new Set();
  return withMerchantOperationalTransaction(merchantId, async (target) => {
    const rows = productId
      ? await operationalQueryRows<{ id: string }>(
          target,
          `SELECT id
             FROM product_variants
            WHERE merchant_id = $1 AND product_id = $2
              AND COALESCE(metadata->>'catalog_archived', 'false') = 'true'`,
          [merchantId, productId],
        )
      : await operationalQueryRows<{ id: string }>(
          target,
          `SELECT id
             FROM product_variants
            WHERE merchant_id = $1
              AND COALESCE(metadata->>'catalog_archived', 'false') = 'true'`,
          [merchantId],
        );
    return new Set(rows.map((row) => row.id));
  });
}

async function assertNoPromotionReferences(
  merchantId: string,
  productId: string,
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0 || !operationalPostgresAuthorityRequired()) return;
  await withMerchantOperationalTransaction(merchantId, async (target) => {
    const rows = await operationalQueryRows<{ variant_id: string }>(
      target,
      `SELECT DISTINCT variant_id
         FROM commerce_promotions
        WHERE merchant_id = $1 AND product_id = $2
          AND variant_id = ANY($3::text[])`,
      [merchantId, productId, variantIds],
    );
    if (rows.length > 0) {
      throw new CatalogRuntimeError(
        "CATALOG_VARIANT_HISTORY_CONFLICT",
        "variant cannot be removed while referenced by an active commerce promotion",
        409,
        {
          variant_ids: rows.map((row) => row.variant_id),
          dependencies: rows.map((row) => ({
            variant_id: row.variant_id,
            kind: "commerce_promotions",
          })),
        },
      );
    }
  });
}

async function markArchivedVariants(
  merchantId: string,
  productId: string,
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0 || !operationalPostgresAuthorityRequired()) return;
  await withMerchantOperationalTransaction(merchantId, async (target) => {
    await target.query(
      `UPDATE product_variants
          SET quantity = 0,
              metadata = COALESCE(metadata, '{}'::jsonb)
                || jsonb_build_object(
                     'catalog_archived', true,
                     'catalog_archived_at', now()
                   ),
              updated_at = now()
        WHERE merchant_id = $1 AND product_id = $2
          AND id = ANY($3::text[])`,
      [merchantId, productId, variantIds],
    );
  });
}

export async function listCatalogProductsAuthoritative(
  merchantIdValue: unknown,
): Promise<Awaited<ReturnType<typeof core.listCatalogProductsAuthoritative>>> {
  const products = await core.listCatalogProductsAuthoritative(merchantIdValue);
  if (!operationalPostgresAuthorityRequired()) return products;
  const merchantId = normalizeCatalogMerchantId(merchantIdValue);
  const archived = await readArchivedVariantIds(merchantId);
  return products.map((product) => filterArchivedProduct(product, archived));
}

export async function getCatalogProductAuthoritative(
  merchantIdValue: unknown,
  productIdValue: unknown,
): Promise<Awaited<ReturnType<typeof core.getCatalogProductAuthoritative>>> {
  const product = await core.getCatalogProductAuthoritative(
    merchantIdValue,
    productIdValue,
  );
  if (!operationalPostgresAuthorityRequired()) return product;
  const merchantId = normalizeCatalogMerchantId(merchantIdValue);
  const productId = normalizeCatalogProductId(productIdValue);
  const archived = await readArchivedVariantIds(merchantId, productId);
  return filterArchivedProduct(product, archived);
}

export async function updateCatalogProductAuthoritative(
  params: Parameters<typeof core.updateCatalogProductAuthoritative>[0],
): Promise<Awaited<ReturnType<typeof core.updateCatalogProductAuthoritative>>> {
  if (!operationalPostgresAuthorityRequired()) {
    return core.updateCatalogProductAuthoritative(params);
  }

  const merchantId = normalizeCatalogMerchantId(params.merchantId);
  const productId = normalizeCatalogProductId(params.productId);
  const current = await core.getCatalogProductAuthoritative(merchantId, productId);
  const previouslyArchived = await readArchivedVariantIds(merchantId, productId);
  const input = { ...asRecord(params.input) };
  const variantsWereSupplied = Object.prototype.hasOwnProperty.call(input, "variants");
  const activeCurrent = current.variants.filter(
    (variant) => !previouslyArchived.has(variant.id),
  );
  const requestedVariants = variantsWereSupplied && Array.isArray(input.variants)
    ? input.variants
    : activeCurrent;
  const incomingIds = new Set(
    requestedVariants.map(variantId).filter(Boolean),
  );

  const archiveIds = new Set(
    [...previouslyArchived].filter((id) => !incomingIds.has(id)),
  );
  const newlyRemovedIds = variantsWereSupplied
    ? activeCurrent
        .filter((variant) => !incomingIds.has(variant.id))
        .map((variant) => variant.id)
    : [];

  await assertNoPromotionReferences(merchantId, productId, newlyRemovedIds);
  for (const id of newlyRemovedIds) archiveIds.add(id);

  const archivedVariants = current.variants.filter((variant) =>
    archiveIds.has(variant.id),
  );
  input.variants = [
    ...requestedVariants,
    ...archivedVariants.map(archivedShadow),
  ];

  // The archived rows are internal zero-stock shadows. Do not let a top-level
  // quantity from a now-empty variant form conflict with their zero stock.
  if (archiveIds.size > 0) {
    delete input.stock_quantity;
    delete input.quantity;
  }

  const internalParams = {
    ...params,
    merchantId,
    productId,
    input,
  } as Parameters<typeof core.updateCatalogProductAuthoritative>[0];

  const updated = await core.updateCatalogProductAuthoritative(internalParams);
  await markArchivedVariants(merchantId, productId, [...archiveIds]);
  return filterArchivedProduct(updated, archiveIds);
}
