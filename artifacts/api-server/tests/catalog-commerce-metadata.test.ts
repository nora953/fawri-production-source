import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogCommerceFromMetadata,
  catalogCommerceMetadataPatch,
  normalizeCatalogCommerceInput,
} from "../src/services/catalogCommerceMetadata";

test("legacy catalog rows default to inventory-tracked products", () => {
  assert.deepEqual(catalogCommerceFromMetadata({}), {
    item_type: "product",
    track_inventory: true,
  });
});

test("service commerce metadata preserves booking facts without inventory", () => {
  const service = normalizeCatalogCommerceInput({
    item_type: "service",
    track_inventory: false,
    service_details: {
      duration_minutes: 60,
      buffer_minutes: 15,
      booking_required: true,
      price_type: "from",
      location_mode: "customer",
    },
  });

  assert.deepEqual(service, {
    item_type: "service",
    track_inventory: false,
    service_details: {
      duration_minutes: 60,
      buffer_minutes: 15,
      booking_required: true,
      price_type: "from",
      location_mode: "customer",
    },
  });

  const metadata = catalogCommerceMetadataPatch(service);
  assert.deepEqual(catalogCommerceFromMetadata(metadata), service);
});

test("services cannot opt into product inventory tracking", () => {
  assert.throws(
    () =>
      normalizeCatalogCommerceInput({
        item_type: "service",
        track_inventory: true,
      }),
    (error: unknown) =>
      (error as { code?: string })?.code === "CATALOG_SERVICE_INVENTORY_UNSUPPORTED",
  );
});

test("service duration and buffer are bounded", () => {
  assert.throws(
    () =>
      normalizeCatalogCommerceInput({
        item_type: "service",
        service_details: { duration_minutes: 0 },
      }),
    (error: unknown) =>
      (error as { code?: string })?.code === "CATALOG_SERVICE_FIELD_INVALID",
  );

  assert.throws(
    () =>
      normalizeCatalogCommerceInput({
        item_type: "service",
        service_details: { buffer_minutes: 481 },
      }),
    (error: unknown) =>
      (error as { code?: string })?.code === "CATALOG_SERVICE_FIELD_INVALID",
  );
});

test("product inventory tracking can be disabled explicitly", () => {
  assert.deepEqual(
    normalizeCatalogCommerceInput({
      item_type: "product",
      track_inventory: false,
    }),
    {
      item_type: "product",
      track_inventory: false,
    },
  );
});
