import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { beforeEach, after } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-catalog-test-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

import {
  adjustCatalogInventory,
  CatalogRuntimeError,
  createCatalogProduct,
  deleteCatalogProduct,
  deleteMerchantCatalogData,
  getCatalogProduct,
  importCatalogProducts,
  listCatalogProducts,
  setCatalogInventory,
  updateCatalogProduct,
} from "../src/services/catalogInventoryRuntime";
import { deleteMerchantRuntimeData } from "../src/services/merchantRuntime";

beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function expectCatalogError(
  callback: () => unknown,
  code: string,
): CatalogRuntimeError {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof CatalogRuntimeError);
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected catalog error ${code}`);
}

function createProduct(
  merchantId: string,
  key: string,
  overrides: Record<string, unknown> = {},
) {
  return createCatalogProduct({
    merchantId,
    idempotencyKey: key,
    input: {
      name: "Test product",
      sku: `SKU-${key}`,
      price_iqd: 10_000,
      stock_quantity: 5,
      ...overrides,
    },
  }).product;
}

test("create is idempotent and rejects key reuse with a different request", () => {
  const request = {
    merchantId: "merchant-a",
    idempotencyKey: "create-request-0001",
    input: {
      name: "Phone case",
      sku: "CASE-01",
      barcode: "10000001",
      price_iqd: 12_000,
      stock_quantity: 8,
    },
  };

  const first = createCatalogProduct(request);
  const replay = createCatalogProduct(request);

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.product.id, first.product.id);
  assert.equal(listCatalogProducts("merchant-a").length, 1);

  expectCatalogError(
    () =>
      createCatalogProduct({
        ...request,
        input: { ...request.input, name: "Different product" },
      }),
    "CATALOG_IDEMPOTENCY_CONFLICT",
  );
});

test("tenant isolation permits tenant-local identifiers but blocks cross-tenant reads", () => {
  const left = createProduct("merchant-left", "tenant-left-0001", {
    sku: "SHARED-SKU",
  });
  const right = createProduct("merchant-right", "tenant-right-0001", {
    sku: "SHARED-SKU",
  });

  assert.equal(getCatalogProduct("merchant-left", left.id).merchant_id, "merchant-left");
  assert.equal(getCatalogProduct("merchant-right", right.id).merchant_id, "merchant-right");
  expectCatalogError(
    () => getCatalogProduct("merchant-right", left.id),
    "CATALOG_PRODUCT_NOT_FOUND",
  );
  expectCatalogError(
    () =>
      updateCatalogProduct({
        merchantId: "merchant-right",
        productId: left.id,
        expectedVersion: left.version,
        input: { name: "Cross-tenant overwrite" },
      }),
    "CATALOG_PRODUCT_NOT_FOUND",
  );
  expectCatalogError(
    () =>
      setCatalogInventory({
        merchantId: "merchant-right",
        productId: left.id,
        expectedVersion: left.version,
        quantity: 0,
      }),
    "CATALOG_PRODUCT_NOT_FOUND",
  );
  expectCatalogError(
    () =>
      deleteCatalogProduct({
        merchantId: "merchant-right",
        productId: left.id,
        expectedVersion: left.version,
      }),
    "CATALOG_PRODUCT_NOT_FOUND",
  );
  assert.equal(getCatalogProduct("merchant-left", left.id).name, "Test product");
});

test("merchant-wide SKU and barcode uniqueness includes variants", () => {
  createProduct("merchant-a", "identifier-base-0001", {
    sku: "BASE-SKU",
    barcode: "BASE-BARCODE",
  });

  expectCatalogError(
    () =>
      createProduct("merchant-a", "identifier-conflict-0002", {
        sku: " base-sku ",
      }),
    "CATALOG_SKU_DUPLICATE",
  );

  expectCatalogError(
    () =>
      createProduct("merchant-a", "variant-barcode-0003", {
        sku: "OTHER-SKU",
        stock_quantity: 2,
        variants: [
          {
            name: "Black",
            barcode: "base-barcode",
            stock_quantity: 2,
            options: { color: "Black" },
          },
        ],
      }),
    "CATALOG_BARCODE_DUPLICATE",
  );
});

test("duplicate variants, invalid prices, and embedded images fail closed", () => {
  expectCatalogError(
    () =>
      createProduct("merchant-a", "duplicate-variants-0001", {
        stock_quantity: 4,
        variants: [
          { name: "M Black", stock_quantity: 2, options: { Size: "M", Color: "Black" } },
          { name: "Black M", stock_quantity: 2, options: { color: "black", size: "m" } },
        ],
      }),
    "CATALOG_VARIANT_DUPLICATE",
  );

  expectCatalogError(
    () =>
      createProduct("merchant-a", "invalid-price-0002", {
        price_iqd: -1,
      }),
    "CATALOG_PRICE_INVALID",
  );

  expectCatalogError(
    () =>
      createProduct("merchant-a", "invalid-compare-0003", {
        price_iqd: 10_000,
        compare_at_price_iqd: 9_000,
      }),
    "CATALOG_COMPARE_PRICE_INVALID",
  );

  expectCatalogError(
    () =>
      createProduct("merchant-a", "embedded-image-0004", {
        image_refs: [{ url: "data:image/png;base64,AAAA" }],
      }),
    "CATALOG_IMAGE_BINARY_FORBIDDEN",
  );
});

test("variant media, options, identifiers and pricing survive create/edit/add/remove round trips", () => {
  const created = createProduct("merchant-a", "variant-roundtrip-0001", {
    sku: "TEE-PARENT",
    barcode: "TEE-PARENT-BAR",
    price_iqd: 20_000,
    stock_quantity: 5,
    image_refs: [
      {
        url: "https://cdn.example.test/tee.jpg",
        alt: "T-shirt",
      },
    ],
    variants: [
      {
        name: "Black / M",
        sku: "TEE-BLK-M",
        barcode: "TEE-BAR-M",
        price_iqd: 21_000,
        stock_quantity: 2,
        options: { Color: "Black", Size: "M" },
        image_refs: [
          {
            storage_key: "catalog/merchant-a/tee-black-m.jpg",
            alt: "Black medium",
          },
        ],
      },
      {
        name: "Blue / L",
        sku: "TEE-BLU-L",
        barcode: "TEE-BAR-L",
        stock_quantity: 3,
        options: { Color: "Blue", Size: "L" },
      },
    ],
  });

  assert.equal(created.stock_quantity, 5);
  assert.equal(created.image_refs[0].url, "https://cdn.example.test/tee.jpg");
  assert.equal(created.variants[0].sku, "TEE-BLK-M");
  assert.equal(created.variants[0].barcode, "TEE-BAR-M");
  assert.equal(created.variants[0].price_iqd, 21_000);
  assert.deepEqual(created.variants[0].options, { Color: "Black", Size: "M" });
  assert.equal(
    created.variants[0].image_refs[0].storage_key,
    "catalog/merchant-a/tee-black-m.jpg",
  );

  const updated = updateCatalogProduct({
    merchantId: "merchant-a",
    productId: created.id,
    expectedVersion: created.version,
    input: {
      image_refs: [
        {
          id: created.image_refs[0].id,
          url: "https://cdn.example.test/tee-v2.jpg",
          alt: "T-shirt updated",
        },
      ],
      variants: [
        {
          id: created.variants[0].id,
          name: "Jet Black / M",
          sku: "TEE-BLK-M",
          barcode: "TEE-BAR-M",
          price_iqd: 22_000,
          stock_quantity: 2,
          options: { Color: "Jet Black", Size: "M" },
          image_refs: created.variants[0].image_refs,
        },
        {
          name: "Green / XL",
          sku: "TEE-GRN-XL",
          barcode: "TEE-BAR-XL",
          price_iqd: 23_000,
          stock_quantity: 4,
          options: { Color: "Green", Size: "XL" },
          image_refs: [{ url: "https://cdn.example.test/tee-green-xl.jpg" }],
        },
      ],
    },
  });

  assert.equal(updated.version, 2);
  assert.equal(updated.stock_quantity, 6);
  assert.equal(updated.variants.length, 2);
  assert.equal(updated.variants[0].id, created.variants[0].id);
  assert.equal(updated.variants.some((variant) => variant.id === created.variants[1].id), false);
  assert.equal(updated.variants[0].name, "Jet Black / M");
  assert.equal(updated.variants[0].price_iqd, 22_000);
  assert.deepEqual(updated.variants[0].options, { Color: "Jet Black", Size: "M" });
  assert.equal(updated.variants[1].sku, "TEE-GRN-XL");
  assert.equal(updated.variants[1].barcode, "TEE-BAR-XL");
  assert.equal(updated.variants[1].stock_quantity, 4);
  assert.equal(updated.variants[1].image_refs[0].url, "https://cdn.example.test/tee-green-xl.jpg");
  assert.equal(updated.image_refs[0].url, "https://cdn.example.test/tee-v2.jpg");

  const removedAll = updateCatalogProduct({
    merchantId: "merchant-a",
    productId: updated.id,
    expectedVersion: updated.version,
    input: {
      variants: [],
      stock_quantity: updated.stock_quantity,
    },
  });
  assert.equal(removedAll.variants.length, 0);
  assert.equal(removedAll.stock_quantity, 6);
});

test("product-level quantity cannot overwrite variant-managed stock", () => {
  const product = createProduct("merchant-a", "variant-root-stock-0001", {
    stock_quantity: 5,
    variants: [
      { name: "Small", sku: "ROOT-S", stock_quantity: 2, options: { size: "S" } },
      { name: "Large", sku: "ROOT-L", stock_quantity: 3, options: { size: "L" } },
    ],
  });

  expectCatalogError(
    () =>
      updateCatalogProduct({
        merchantId: "merchant-a",
        productId: product.id,
        expectedVersion: product.version,
        input: { stock_quantity: 999 },
      }),
    "CATALOG_STOCK_MISMATCH",
  );
  assert.equal(getCatalogProduct("merchant-a", product.id).stock_quantity, 5);
});

test("negative stock is rejected and idempotent adjustments apply once", () => {
  const product = createProduct("merchant-a", "stock-create-0001", {
    stock_quantity: 2,
  });

  expectCatalogError(
    () =>
      adjustCatalogInventory({
        merchantId: "merchant-a",
        productId: product.id,
        expectedVersion: product.version,
        delta: -3,
        idempotencyKey: "stock-negative-0001",
      }),
    "CATALOG_NEGATIVE_STOCK",
  );

  const first = adjustCatalogInventory({
    merchantId: "merchant-a",
    productId: product.id,
    expectedVersion: product.version,
    delta: -1,
    reason: "order reservation",
    idempotencyKey: "stock-adjust-0002",
  });
  const replay = adjustCatalogInventory({
    merchantId: "merchant-a",
    productId: product.id,
    expectedVersion: product.version,
    delta: -1,
    reason: "order reservation",
    idempotencyKey: "stock-adjust-0002",
  });

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.product.stock_quantity, 1);
  assert.equal(replay.product.stock_quantity, 1);
  assert.equal(getCatalogProduct("merchant-a", product.id).stock_quantity, 1);
});

test("stale concurrent updates return the current product instead of overwriting", () => {
  const product = createProduct("merchant-a", "concurrency-create-0001");

  const updated = updateCatalogProduct({
    merchantId: "merchant-a",
    productId: product.id,
    expectedVersion: product.version,
    input: { name: "Updated by device A" },
  });
  assert.equal(updated.version, 2);

  const conflict = expectCatalogError(
    () =>
      updateCatalogProduct({
        merchantId: "merchant-a",
        productId: product.id,
        expectedVersion: product.version,
        input: { name: "Stale device B" },
      }),
    "CATALOG_VERSION_CONFLICT",
  );
  assert.equal(conflict.details?.current_version, 2);
  assert.equal(
    (conflict.details?.current_product as { name: string }).name,
    "Updated by device A",
  );
  assert.equal(getCatalogProduct("merchant-a", product.id).name, "Updated by device A");
});

test("variant inventory requires variant scope and keeps aggregate stock consistent", () => {
  const product = createProduct("merchant-a", "variant-stock-0001", {
    stock_quantity: 5,
    variants: [
      { name: "Small", sku: "VAR-S", stock_quantity: 2, options: { size: "S" } },
      { name: "Large", sku: "VAR-L", stock_quantity: 3, options: { size: "L" } },
    ],
  });

  expectCatalogError(
    () =>
      setCatalogInventory({
        merchantId: "merchant-a",
        productId: product.id,
        expectedVersion: product.version,
        quantity: 4,
      }),
    "CATALOG_VARIANT_REQUIRED",
  );

  const next = setCatalogInventory({
    merchantId: "merchant-a",
    productId: product.id,
    variantId: product.variants[0].id,
    expectedVersion: product.version,
    quantity: 4,
  });
  assert.equal(next.variants[0].stock_quantity, 4);
  assert.equal(next.stock_quantity, 7);
});

test("import is atomic, idempotent, and duplicate-safe", () => {
  const items = [
    {
      external_ref: "erp-1",
      name: "Imported one",
      sku: "IMP-1",
      price_iqd: 1_000,
      stock_quantity: 1,
    },
    {
      external_ref: "erp-2",
      name: "Imported two",
      barcode: "IMP-BAR-2",
      price_iqd: 2_000,
      stock_quantity: 2,
    },
  ];

  const first = importCatalogProducts({
    merchantId: "merchant-a",
    idempotencyKey: "import-batch-0001",
    items,
  });
  const replay = importCatalogProducts({
    merchantId: "merchant-a",
    idempotencyKey: "import-batch-0001",
    items,
  });

  assert.equal(first.created_count, 2);
  assert.equal(replay.replayed, true);
  assert.deepEqual(
    replay.products.map((product) => product.id),
    first.products.map((product) => product.id),
  );
  assert.equal(listCatalogProducts("merchant-a").length, 2);

  expectCatalogError(
    () =>
      importCatalogProducts({
        merchantId: "merchant-a",
        idempotencyKey: "import-batch-0002",
        items,
      }),
    "CATALOG_EXTERNAL_REF_DUPLICATE",
  );
  assert.equal(listCatalogProducts("merchant-a").length, 2);

  expectCatalogError(
    () =>
      importCatalogProducts({
        merchantId: "merchant-a",
        idempotencyKey: "import-no-identity-0003",
        items: [{ name: "No stable identity", price_iqd: 1, stock_quantity: 0 }],
      }),
    "CATALOG_IMPORT_IDENTITY_REQUIRED",
  );
  assert.equal(listCatalogProducts("merchant-a").length, 2);
});

test("product deletion and merchant deletion remove owned catalog data only", () => {
  const first = createProduct("merchant-a", "delete-product-0001", {
    image_refs: [{ url: "https://cdn.example.test/product.jpg" }],
    stock_quantity: 1,
    variants: [
      {
        name: "Default",
        sku: "DELETE-VAR-1",
        stock_quantity: 1,
        options: { size: "One" },
        image_refs: [{ storage_key: "catalog/delete/variant.jpg" }],
      },
    ],
  });
  createProduct("merchant-b", "delete-other-0002");

  const deleted = deleteCatalogProduct({
    merchantId: "merchant-a",
    productId: first.id,
    expectedVersion: first.version,
  });
  assert.equal(deleted.deleted_product_id, first.id);
  assert.equal(listCatalogProducts("merchant-a").length, 0);

  createProduct("merchant-a", "delete-merchant-0003", {
    sku: "DELETE-A-3",
  });
  const summary = deleteMerchantRuntimeData("merchant-a");
  assert.equal(summary.catalogProducts, 1);
  assert.equal(listCatalogProducts("merchant-a").length, 0);
  assert.equal(listCatalogProducts("merchant-b").length, 1);

  const direct = deleteMerchantCatalogData("merchant-a");
  assert.equal(direct.catalogProducts, 0);
});
