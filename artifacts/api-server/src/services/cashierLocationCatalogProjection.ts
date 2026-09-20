import {
  catalogCommerceFieldsOf,
} from "./catalogCommerceMetadata";
import type { CatalogProduct, CatalogProductStatus } from "./catalogInventoryRuntime";
import type { LocationInventoryLevel } from "./postgresLocationInventoryAuthority";

function inventoryKey(productId: string, variantId?: string): string {
  return `${productId}\0${variantId || ""}`;
}

function statusForLocation(
  current: CatalogProductStatus,
  quantity: number,
  lowStockThreshold: number,
): CatalogProductStatus {
  if (current === "draft" || current === "hidden_from_fawri") return current;
  if (quantity === 0) return "out_of_stock";
  if (quantity <= lowStockThreshold) return "low_stock";
  return "available";
}

export function projectCashierCatalogProductsToLocation<T extends CatalogProduct>(
  products: readonly T[],
  levels: readonly LocationInventoryLevel[],
): T[] {
  const byItem = new Map(
    levels.map((level) => [
      inventoryKey(level.product_id, level.variant_id),
      level,
    ]),
  );

  return products.map((product) => {
    const commerce = catalogCommerceFieldsOf(product);
    if (commerce.item_type !== "product" || !commerce.track_inventory) {
      return structuredClone(product);
    }

    if (product.variants.length > 0) {
      let total = 0;
      const variants = product.variants.map((variant) => {
        const quantity =
          byItem.get(inventoryKey(product.id, variant.id))?.quantity ?? 0;
        if (!Number.isSafeInteger(quantity) || quantity < 0) {
          throw new Error("location inventory projection is invalid");
        }
        total += quantity;
        if (!Number.isSafeInteger(total)) {
          throw new Error("location inventory projection overflow");
        }
        return {
          ...variant,
          stock_quantity: quantity,
        };
      });

      return {
        ...product,
        variants,
        stock_quantity: total,
        status: statusForLocation(
          product.status,
          total,
          product.low_stock_threshold,
        ),
      } as T;
    }

    const quantity =
      byItem.get(inventoryKey(product.id))?.quantity ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new Error("location inventory projection is invalid");
    }
    return {
      ...product,
      stock_quantity: quantity,
      status: statusForLocation(
        product.status,
        quantity,
        product.low_stock_threshold,
      ),
    } as T;
  });
}
