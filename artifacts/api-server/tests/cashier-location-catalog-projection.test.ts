import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct } from "../src/services/catalogInventoryRuntime";
import type { LocationInventoryLevel } from "../src/services/postgresLocationInventoryAuthority";
import { projectCashierCatalogProductsToLocation } from "../src/services/cashierLocationCatalogProjection";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct & {
  item_type: "product";
  track_inventory: boolean;
} {
  return {
    id: "product-1",
    merchant_id: "merchant-1",
    name: "Tracked product",
    price_iqd: 1000,
    stock_quantity: 99,
    low_stock_threshold: 3,
    status: "available",
    allow_fawri_reply: true,
    image_refs: [],
    variants: [],
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
    version: 7,
    item_type: "product",
    track_inventory: true,
    ...overrides,
  };
}

function level(input: {
  productId: string;
  variantId?: string;
  quantity: number;
}): LocationInventoryLevel {
  return {
    id: `level-${input.productId}-${input.variantId || "product"}`,
    merchant_id: "merchant-1",
    location_id: "location-a",
    product_id: input.productId,
    ...(input.variantId ? { variant_id: input.variantId } : {}),
    quantity: input.quantity,
    low_stock_threshold: 3,
    version: 2,
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
  };
}

test("cashier snapshot uses location quantity instead of merchant-global quantity", () => {
  const [projected] = projectCashierCatalogProductsToLocation(
    [product()],
    [level({ productId: "product-1", quantity: 2 })],
  );
  assert.equal(projected.stock_quantity, 2);
  assert.equal(projected.status, "low_stock");
});

test("missing location inventory fails closed to zero without global fallback", () => {
  const [projected] = projectCashierCatalogProductsToLocation([product()], []);
  assert.equal(projected.stock_quantity, 0);
  assert.equal(projected.status, "out_of_stock");
});

test("variant projection is location-scoped and missing variants become zero", () => {
  const source = product({
    id: "product-variants",
    stock_quantity: 50,
    low_stock_threshold: 1,
    variants: [
      {
        id: "variant-a",
        name: "A",
        stock_quantity: 20,
        options: { Size: "A" },
        image_refs: [],
        created_at: "2026-09-19T00:00:00.000Z",
        updated_at: "2026-09-19T00:00:00.000Z",
      },
      {
        id: "variant-b",
        name: "B",
        stock_quantity: 30,
        options: { Size: "B" },
        image_refs: [],
        created_at: "2026-09-19T00:00:00.000Z",
        updated_at: "2026-09-19T00:00:00.000Z",
      },
    ],
  });
  const [projected] = projectCashierCatalogProductsToLocation(
    [source],
    [level({ productId: "product-variants", variantId: "variant-a", quantity: 4 })],
  );
  assert.equal(projected.variants[0].stock_quantity, 4);
  assert.equal(projected.variants[1].stock_quantity, 0);
  assert.equal(projected.stock_quantity, 4);
  assert.equal(projected.status, "available");
});

test("non-inventory products are not rewritten by location projection", () => {
  const source = product({
    id: "not-tracked",
    stock_quantity: 23,
    status: "available",
  });
  source.track_inventory = false;
  const [projected] = projectCashierCatalogProductsToLocation([source], []);
  assert.equal(projected.stock_quantity, 23);
  assert.equal(projected.status, "available");
});
