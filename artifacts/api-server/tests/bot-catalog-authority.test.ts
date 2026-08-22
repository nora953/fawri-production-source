import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-bot-catalog-test-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.NODE_ENV = "test";

import {
  BotCatalogAuthorityError,
  readBotCatalogProducts,
  resolveCatalogFulfillment,
} from "../src/services/botCatalogAuthority";
import { createCatalogProduct } from "../src/services/catalogInventoryRuntime";

beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function createProduct(
  merchantId: string,
  key: string,
  overrides: Record<string, unknown> = {},
) {
  return createCatalogProduct({
    merchantId,
    idempotencyKey: key,
    input: {
      name: "Catalog product",
      sku: `SKU-${key}`,
      price_iqd: 10_000,
      stock_quantity: 5,
      ...overrides,
    },
  }).product;
}

test("bot adapter preserves catalog facts without exposing merchant stock counts", () => {
  const canonical = createProduct("merchant-a", "adapter-contract-0001", {
    external_ref: "ERP-1001",
    name: "Running Shoe",
    sku: "SHOE-BASE",
    barcode: "BASE-1001",
    category: "Shoes",
    description: "Lightweight running shoe",
    price_iqd: 25_000,
    compare_at_price_iqd: 30_000,
    stock_quantity: 3,
    image_refs: [
      {
        id: "img-product-front",
        url: "https://example.test/products/shoe-front.jpg",
        alt: "Running Shoe front",
      },
    ],
    variants: [
      {
        id: "variant-black-42",
        name: "Black / 42",
        sku: "SHOE-BLK-42",
        barcode: "VAR-1001",
        price_iqd: 27_000,
        stock_quantity: 3,
        options: { Color: "Black", Size: "42" },
        image_refs: [
          {
            id: "img-variant-black",
            storage_key: "catalog/shoe-black-42.jpg",
            alt: "Black size 42",
          },
        ],
      },
    ],
  });

  const products = readBotCatalogProducts("merchant-a");
  assert.equal(products.length, 1);
  const [product] = products;

  assert.equal(product.id, canonical.id);
  assert.equal(product.merchant_id, "merchant-a");
  assert.equal(product.code, "ERP-1001");
  assert.equal(product.price_iqd, 25_000);
  assert.equal(product.current_price, 25_000);
  assert.equal(product.original_price, 30_000);
  assert.equal(product.is_available, true);
  assert.equal(product.availability, "available");
  assert.equal(product.quantity, 1);
  assert.equal("stock_quantity" in product, false);
  assert.equal(product.image_refs[0].url, "https://example.test/products/shoe-front.jpg");
  assert.deepEqual(product.variants[0].options, { Color: "Black", Size: "42" });
  assert.equal(product.variants[0].sku, "SHOE-BLK-42");
  assert.equal(product.variants[0].barcode, "VAR-1001");
  assert.equal(product.variants[0].current_price, 27_000);
  assert.equal(product.variants[0].is_available, true);
  assert.equal(product.variants[0].quantity, 1);
  assert.equal("stock_quantity" in product.variants[0], false);
  assert.equal(
    product.variants[0].image_refs[0].storage_key,
    "catalog/shoe-black-42.jpg",
  );
  assert.ok(product.catalog_search_terms.includes("ERP-1001"));
  assert.ok(product.catalog_search_terms.includes("SHOE-BLK-42"));
  assert.ok(product.catalog_search_terms.includes("VAR-1001"));
  assert.ok(product.catalog_search_terms.includes("Black"));
  assert.ok(product.catalog_search_terms.includes("42"));
});

test("fulfillment disclosure is scoped to the requested quantity", () => {
  const product = createProduct("merchant-a", "fulfillment-scope-0001", {
    name: "Private Stock Product",
    stock_quantity: 11,
  });

  const withinStock = resolveCatalogFulfillment(product, 3);
  assert.deepEqual(withinStock, {
    requested_quantity: 3,
    is_available: true,
    can_fulfill_full_request: true,
    fulfillable_quantity: 3,
    inventory_disclosure: "request_scoped",
  });
  assert.equal("stock_quantity" in withinStock, false);
  assert.equal("quantity" in withinStock, false);

  const aboveStock = resolveCatalogFulfillment(product, 12);
  assert.deepEqual(aboveStock, {
    requested_quantity: 12,
    is_available: true,
    can_fulfill_full_request: false,
    fulfillable_quantity: 11,
    inventory_disclosure: "request_scoped",
  });
  assert.equal("stock_quantity" in aboveStock, false);
});

test("variant fulfillment discloses only the amount that can satisfy the request", () => {
  const product = createProduct("merchant-a", "variant-fulfillment-0001", {
    name: "Variant Product",
    variants: [
      {
        id: "variant-limited",
        name: "Limited Variant",
        stock_quantity: 2,
        options: { Size: "M" },
      },
      {
        id: "variant-other",
        name: "Other Variant",
        stock_quantity: 9,
        options: { Size: "L" },
      },
    ],
  });

  const resolution = resolveCatalogFulfillment(product, 3, "variant-limited");
  assert.deepEqual(resolution, {
    requested_quantity: 3,
    is_available: true,
    can_fulfill_full_request: false,
    fulfillable_quantity: 2,
    inventory_disclosure: "request_scoped",
  });
});

test("bot adapter is tenant-scoped and never searches another merchant catalog", () => {
  createProduct("merchant-left", "tenant-left-bot-0001", {
    name: "Left Product",
    sku: "SHARED-BOT-SKU",
  });
  createProduct("merchant-right", "tenant-right-bot-0001", {
    name: "Right Product",
    sku: "SHARED-BOT-SKU",
  });

  assert.deepEqual(
    readBotCatalogProducts("merchant-left").map((product) => product.name),
    ["Left Product"],
  );
  assert.deepEqual(
    readBotCatalogProducts("merchant-right").map((product) => product.name),
    ["Right Product"],
  );
});

test("hidden, draft, and reply-disabled products are excluded while out-of-stock availability remains explicit", () => {
  createProduct("merchant-a", "visible-product-0001", {
    name: "Visible Product",
    stock_quantity: 5,
  });
  createProduct("merchant-a", "out-of-stock-product-0001", {
    name: "Out Of Stock Product",
    stock_quantity: 0,
  });
  createProduct("merchant-a", "hidden-product-0001", {
    name: "Hidden Product",
    status: "hidden_from_fawri",
  });
  createProduct("merchant-a", "draft-product-0001", {
    name: "Draft Product",
    status: "draft",
  });
  createProduct("merchant-a", "reply-disabled-product-0001", {
    name: "Reply Disabled Product",
    allow_fawri_reply: false,
  });

  const products = readBotCatalogProducts("merchant-a");
  assert.deepEqual(
    products.map((product) => product.name).sort(),
    ["Out Of Stock Product", "Visible Product"],
  );
  const unavailable = products.find(
    (product) => product.name === "Out Of Stock Product",
  );
  assert.equal(unavailable?.status, "out_of_stock");
  assert.equal(unavailable?.is_available, false);
  assert.equal(unavailable?.availability, "unavailable");
  assert.equal(unavailable?.quantity, 0);
  assert.equal(unavailable ? "stock_quantity" in unavailable : true, false);
});

test("legacy productsByMerchant JSON is ignored even when it conflicts with the server catalog", () => {
  createProduct("merchant-a", "canonical-wins-0001", {
    name: "Canonical Product",
    sku: "CANONICAL-SKU",
  });

  fs.writeFileSync(
    path.join(dataDir, "fawri-runtime-db.json"),
    JSON.stringify(
      {
        productsByMerchant: {
          "merchant-a": [
            {
              id: "legacy-only-product",
              merchant_id: "merchant-a",
              name: "Legacy Product",
              sku: "LEGACY-SKU",
              current_price: 1,
              quantity: 999,
              status: "available",
              allow_fawri_reply: true,
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const products = readBotCatalogProducts("merchant-a");
  assert.deepEqual(products.map((product) => product.name), ["Canonical Product"]);
  assert.equal(products.some((product) => product.sku === "LEGACY-SKU"), false);
});

test("missing server catalog returns no products and never falls back to legacy JSON", () => {
  fs.writeFileSync(
    path.join(dataDir, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {
        "merchant-a": [
          {
            name: "Legacy Only Product",
            current_price: 500,
            quantity: 4,
          },
        ],
      },
    }),
    "utf8",
  );

  assert.deepEqual(readBotCatalogProducts("merchant-a"), []);
});

test("unavailable or invalid server catalog fails closed without legacy fallback", () => {
  fs.writeFileSync(
    path.join(dataDir, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {
        "merchant-a": [
          {
            name: "Legacy Guess",
            current_price: 123,
            quantity: 5,
          },
        ],
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dataDir, "catalog-inventory.json"),
    JSON.stringify({ version: 999, merchants: {} }),
    "utf8",
  );

  assert.throws(
    () => readBotCatalogProducts("merchant-a"),
    (error: unknown) => {
      assert.ok(error instanceof BotCatalogAuthorityError);
      assert.equal(error.code, "BOT_CATALOG_AUTHORITY_UNAVAILABLE");
      assert.equal(error.status, 503);
      return true;
    },
  );
});

test("generic bot router cannot read or write the legacy productsByMerchant map", () => {
  const routeSource = fs.readFileSync(
    new URL("../src/routes/indexModulePart1.ts", import.meta.url),
    "utf8",
  );

  assert.match(routeSource, /readBotCatalogProducts\(merchantId\)/);
  assert.match(routeSource, /LEGACY_PRODUCT_AUTHORITY_DISABLED/);
  assert.match(routeSource, /quarantinedLegacyProductsByMerchant/);
  assert.doesNotMatch(routeSource, /\bproductsByMerchant\.(?:get|set|delete|clear)\b/);
  assert.doesNotMatch(routeSource, /\bnormalizeProducts\b/);
});
