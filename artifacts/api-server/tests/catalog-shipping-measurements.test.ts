import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { beforeEach, after } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-measurements-test-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

import {
  CatalogRuntimeError,
  createCatalogProduct,
  getCatalogProduct,
  importCatalogProducts,
  listCatalogProducts,
  resolveProductPhysicalMeasurements,
  setCatalogInventory,
  updateCatalogProduct,
} from "../src/services/catalogInventoryRuntime";

beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function create(overrides: Record<string, unknown> = {}) {
  return createCatalogProduct({
    merchantId: "merchant-a",
    idempotencyKey: `measure-${Math.random().toString(36).slice(2)}-request`,
    input: {
      name: "Measured product",
      sku: `SKU-${Math.random().toString(36).slice(2)}`,
      price_iqd: 15_000,
      stock_quantity: 3,
      ...overrides,
    },
  }).product;
}

function expectError(callback: () => unknown, code: string) {
  assert.throws(callback, (error) =>
    error instanceof CatalogRuntimeError && error.code === code,
  );
}

test("measurements are fully optional for products and variants", () => {
  const product = create({
    stock_quantity: 2,
    variants: [
      { name: "M", stock_quantity: 2, options: { Size: "M" } },
    ],
  });
  assert.equal(product.weight_g, undefined);
  assert.equal(product.length_mm, undefined);
  assert.equal(product.variants[0].weight_g, undefined);
  assert.deepEqual(resolveProductPhysicalMeasurements(product, product.variants[0]), {
    weight_g: null,
    dimensions: null,
    provenance: { weight: null, dimensions: null },
  });
});

test("product measurements create/list/detail/update/import round-trip without disturbing catalog fields", () => {
  const product = create({
    weight_g: 1250,
    length_mm: 320,
    width_mm: 210,
    height_mm: 95,
    image_refs: [{ url: "https://cdn.example.test/item.jpg", alt: "item" }],
  });
  assert.equal(product.weight_g, 1250);
  assert.deepEqual(
    [product.length_mm, product.width_mm, product.height_mm],
    [320, 210, 95],
  );
  assert.equal(listCatalogProducts("merchant-a")[0].weight_g, 1250);
  assert.equal(getCatalogProduct("merchant-a", product.id).height_mm, 95);
  assert.equal(product.image_refs.length, 1);

  const updated = updateCatalogProduct({
    merchantId: "merchant-a",
    productId: product.id,
    expectedVersion: product.version,
    input: { weight_g: 1500 },
  });
  assert.equal(updated.weight_g, 1500);
  assert.deepEqual(
    [updated.length_mm, updated.width_mm, updated.height_mm],
    [320, 210, 95],
  );

  const imported = importCatalogProducts({
    merchantId: "merchant-a",
    idempotencyKey: "measurement-import-request-0001",
    items: [
      {
        name: "Imported measured item",
        external_ref: "IMP-MEASURE-1",
        price_iqd: 9_000,
        stock_quantity: 4,
        weight_g: 750,
        length_mm: 100,
        width_mm: 80,
        height_mm: 60,
      },
      {
        name: "Legacy import without measurements",
        external_ref: "IMP-LEGACY-1",
        price_iqd: 8_000,
        stock_quantity: 1,
      },
    ],
  });
  assert.equal(imported.products[0].weight_g, 750);
  assert.equal(imported.products[1].weight_g, undefined);
});

test("variant measurements override independently and otherwise inherit product facts", () => {
  const product = create({
    weight_g: 2000,
    length_mm: 400,
    width_mm: 300,
    height_mm: 200,
    stock_quantity: 5,
    variants: [
      {
        name: "Light",
        stock_quantity: 2,
        weight_g: 1500,
        options: { Size: "M" },
      },
      {
        name: "Tall",
        stock_quantity: 3,
        length_mm: 500,
        width_mm: 310,
        height_mm: 210,
        options: { Size: "L" },
      },
    ],
  });
  const light = resolveProductPhysicalMeasurements(product, product.variants[0]);
  assert.equal(light.weight_g, 1500);
  assert.deepEqual(light.dimensions, { length_mm: 400, width_mm: 300, height_mm: 200 });
  assert.deepEqual(light.provenance, { weight: "variant", dimensions: "product" });

  const tall = resolveProductPhysicalMeasurements(product, product.variants[1]);
  assert.equal(tall.weight_g, 2000);
  assert.deepEqual(tall.dimensions, { length_mm: 500, width_mm: 310, height_mm: 210 });
  assert.deepEqual(tall.provenance, { weight: "product", dimensions: "variant" });
});

test("invalid, zero, non-finite, out-of-bound and partial measurements fail closed", () => {
  for (const weight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 100_000_001]) {
    expectError(() => create({ weight_g: weight }), "CATALOG_MEASUREMENT_INVALID");
  }
  for (const length of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 100_001]) {
    expectError(
      () => create({ length_mm: length, width_mm: 10, height_mm: 10 }),
      "CATALOG_MEASUREMENT_INVALID",
    );
  }
  expectError(
    () => create({ length_mm: 100, width_mm: 50 }),
    "CATALOG_DIMENSIONS_PARTIAL",
  );
  expectError(
    () => create({
      stock_quantity: 1,
      variants: [{ name: "Bad", stock_quantity: 1, length_mm: 10, options: { Size: "S" } }],
    }),
    "CATALOG_DIMENSIONS_PARTIAL",
  );
});

test("measurement updates preserve optimistic version and inventory authority", () => {
  const product = create({ weight_g: 500 });
  const updated = updateCatalogProduct({
    merchantId: "merchant-a",
    productId: product.id,
    expectedVersion: product.version,
    input: { weight_g: 600 },
  });
  assert.equal(updated.version, product.version + 1);
  expectError(
    () => updateCatalogProduct({
      merchantId: "merchant-a",
      productId: product.id,
      expectedVersion: product.version,
      input: { weight_g: 700 },
    }),
    "CATALOG_VERSION_CONFLICT",
  );

  const inventoryUpdated = setCatalogInventory({
    merchantId: "merchant-a",
    productId: product.id,
    expectedVersion: updated.version,
    quantity: 9,
  });
  assert.equal(inventoryUpdated.stock_quantity, 9);
  assert.equal(inventoryUpdated.weight_g, 600);
});
