import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogCommerceFromMetadata,
  catalogCommerceMetadataPatch,
  normalizeCatalogCommerceInput,
} from "../src/services/catalogCommerceMetadata";

test("persists concrete locations for a multi-location service", () => {
  const fields = normalizeCatalogCommerceInput({
    item_type: "service",
    track_inventory: false,
    service_details: {
      booking_required: true,
      buffer_minutes: 0,
      price_type: "fixed",
      location_mode: "flexible",
      location_modes: ["merchant", "online"],
    },
  });

  assert.equal(fields.service_details?.location_mode, "flexible");
  assert.deepEqual(fields.service_details?.location_modes, ["merchant", "online"]);

  const roundTrip = catalogCommerceFromMetadata(catalogCommerceMetadataPatch(fields));
  assert.equal(roundTrip.service_details?.location_mode, "flexible");
  assert.deepEqual(roundTrip.service_details?.location_modes, ["merchant", "online"]);
});

test("upgrades legacy flexible services to explicit choices", () => {
  const legacy = catalogCommerceFromMetadata({
    fawri_catalog_v2: {
      version: 2,
      item_type: "service",
      track_inventory: false,
      service_details: {
        booking_required: true,
        buffer_minutes: 0,
        price_type: "fixed",
        location_mode: "flexible",
      },
    },
  });

  assert.equal(legacy.service_details?.location_mode, "flexible");
  assert.deepEqual(legacy.service_details?.location_modes, ["merchant", "customer", "online"]);
});

test("canonicalizes a single explicit location back to its concrete mode", () => {
  const fields = normalizeCatalogCommerceInput({
    item_type: "service",
    track_inventory: false,
    service_details: {
      booking_required: false,
      buffer_minutes: 0,
      price_type: "custom",
      location_mode: "flexible",
      location_modes: ["customer"],
    },
  });

  assert.equal(fields.service_details?.location_mode, "customer");
  assert.deepEqual(fields.service_details?.location_modes, ["customer"]);
});
