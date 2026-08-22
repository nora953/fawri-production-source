import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogAvailabilityAnswer,
  catalogPriceAnswer,
  requestedCatalogQuantity,
} from "../src/services/knowledge/catalogFactDisclosure";

const productCommerce = { item_type: "product", track_inventory: true } as const;
const serviceCommerce = {
  item_type: "service",
  track_inventory: false,
  service_details: {
    buffer_minutes: 0,
    booking_required: true,
    price_type: "fixed",
    location_mode: "merchant",
  },
} as const;

test("generic availability never reveals the merchant total stock", () => {
  const answer = catalogAvailabilityAnswer({
    language: "ar",
    itemName: "قميص",
    status: "available",
    authoritativeQuantity: 11,
    commerce: productCommerce,
    requestedQuantity: null,
  });
  assert.equal(answer, "قميص متوفر حاليًا.");
  assert.equal(answer.includes("11"), false);
});

test("requested quantity disclosure is limited to what the customer asked for", () => {
  assert.equal(requestedCatalogQuantity("اريد 3 قطع من القميص"), 3);
  const answer = catalogAvailabilityAnswer({
    language: "ar",
    itemName: "قميص",
    status: "available",
    authoritativeQuantity: 11,
    commerce: productCommerce,
    requestedQuantity: 3,
  });
  assert.equal(answer, "نعم، 3 من قميص متوفرة حاليًا.");
  assert.equal(answer.includes("11"), false);
});

test("shortage may disclose only the fulfillable quantity", () => {
  const answer = catalogAvailabilityAnswer({
    language: "ar",
    itemName: "قميص",
    status: "available",
    authoritativeQuantity: 2,
    commerce: productCommerce,
    requestedQuantity: 3,
  });
  assert.equal(answer, "المتوفر حاليًا من قميص هو 2 فقط.");
});

test("model numbers are not mistaken for requested quantities", () => {
  assert.equal(requestedCatalogQuantity("هل iphone 15 متوفر؟"), null);
});

test("service availability is status based and ignores product stock quantity", () => {
  const answer = catalogAvailabilityAnswer({
    language: "ar",
    itemName: "تنظيف بشرة",
    status: "available",
    authoritativeQuantity: 0,
    commerce: serviceCommerce,
    requestedQuantity: null,
  });
  assert.equal(answer, "تنظيف بشرة متوفر حاليًا.");
});

test("service price type controls the customer-safe price wording", () => {
  const fromAnswer = catalogPriceAnswer({
    language: "ar",
    itemName: "صبغ شعر",
    unitPriceIqd: 35000,
    commerce: {
      ...serviceCommerce,
      service_details: { ...serviceCommerce.service_details, price_type: "from" },
    },
  });
  assert.equal(fromAnswer, "سعر صبغ شعر يبدأ من 35,000 دينار.");

  const customAnswer = catalogPriceAnswer({
    language: "ar",
    itemName: "تصميم داخلي",
    unitPriceIqd: 0,
    commerce: {
      ...serviceCommerce,
      service_details: { ...serviceCommerce.service_details, price_type: "custom" },
    },
  });
  assert.equal(customAnswer.includes("0"), false);
});
