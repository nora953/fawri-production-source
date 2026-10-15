import test from "node:test";
import assert from "node:assert/strict";

import { catalogPriceAnswer } from "../src/services/knowledge/catalogFactDisclosure";

const productCommerce = {
  item_type: "product",
  track_inventory: true,
} as const;

test("catalog fact pricing preserves IQD whole-unit behavior", () => {
  assert.equal(
    catalogPriceAnswer({
      language: "en",
      itemName: "Widget",
      unitPriceIqd: 15_000,
      currencyCode: "IQD",
      commerce: productCommerce,
    }),
    "Widget is 15,000 IQD.",
  );
});

test("catalog fact pricing converts USD minor units before disclosure", () => {
  assert.equal(
    catalogPriceAnswer({
      language: "en",
      itemName: "Widget",
      unitPriceIqd: 1_999,
      currencyCode: "USD",
      commerce: productCommerce,
    }),
    "Widget is 19.99 USD.",
  );
});

test("catalog fact pricing respects three-fraction currencies", () => {
  assert.equal(
    catalogPriceAnswer({
      language: "en",
      itemName: "Widget",
      unitPriceIqd: 1_234,
      currencyCode: "JOD",
      commerce: productCommerce,
    }),
    "Widget is 1.234 JOD.",
  );
});

test("promotion disclosure formats both effective and base prices by currency scale", () => {
  assert.equal(
    catalogPriceAnswer({
      language: "en",
      itemName: "Widget",
      unitPriceIqd: 1_999,
      baseUnitPriceIqd: 2_599,
      currencyCode: "USD",
      promotionApplied: true,
      commerce: productCommerce,
    }),
    "Widget is currently 19.99 USD on offer, instead of 25.99 USD.",
  );
});
