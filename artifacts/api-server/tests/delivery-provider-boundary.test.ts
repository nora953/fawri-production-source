import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliveryProviderBoundaryError,
  DeliveryProviderRegistry,
  type DeliveryProviderAdapter,
  type DeliveryShipmentDraft,
} from "../src/services/deliveryProviderBoundary";

function fakeAdapter(provider = "future_courier"): DeliveryProviderAdapter {
  return {
    provider,
    capabilities: new Set([
      "create_shipment",
      "track_shipment",
      "webhooks",
      "cash_on_delivery",
    ]),
    async createShipment(draft: DeliveryShipmentDraft) {
      return {
        provider,
        external_shipment_id: `shipment-${draft.order_id}`,
        tracking_number: `track-${draft.order_id}`,
        tracking_url: null,
        status: "submitted",
      };
    },
    async trackShipment(shipment) {
      return {
        ...shipment,
        status: "in_transit",
      };
    },
    async parseWebhook() {
      return {
        provider,
        provider_event_id: "event-1",
        external_shipment_id: "shipment-order-1",
        authenticity_verified: true,
        status: "delivered",
        occurred_at: "2026-10-06T12:00:00.000Z",
        cod_collected_iqd: 25000,
        payload_sha256: "a".repeat(64),
      };
    },
  };
}

test("delivery provider boundary is opt-in and has no provider by default", () => {
  const registry = new DeliveryProviderRegistry();
  assert.deepEqual(registry.list(), []);
  assert.equal(registry.has("future_courier"), false);
});

test("future courier can be added without changing order-domain code", async () => {
  const registry = new DeliveryProviderRegistry();
  const adapter = fakeAdapter();
  registry.register(adapter);

  assert.equal(registry.has("future_courier"), true);
  assert.equal(
    registry.requireCapability("future_courier", "create_shipment"),
    adapter,
  );
  assert.equal(
    registry.requireCapability("future_courier", "webhooks"),
    adapter,
  );

  const shipment = await adapter.createShipment?.({
    merchant_id: "merchant-1",
    order_id: "order-1",
    order_reference: "FWR-1001",
    recipient: {
      name: "Customer",
      phone: "+9647700000000",
    },
    destination: {
      country_code: "IQ",
      governorate: "Baghdad",
      area: "Karrada",
      address_line: "Street 1",
    },
    cash_on_delivery: {
      amount_iqd: 25000,
      currency: "IQD",
    },
  });

  assert.equal(shipment?.status, "submitted");
  assert.equal(shipment?.external_shipment_id, "shipment-order-1");
});

test("provider capabilities must match implemented adapter methods", () => {
  const registry = new DeliveryProviderRegistry();

  assert.throws(
    () =>
      registry.register({
        provider: "broken_courier",
        capabilities: new Set(["create_shipment"]),
      }),
    (error: unknown) =>
      error instanceof DeliveryProviderBoundaryError &&
      error.code === "DELIVERY_PROVIDER_INVALID",
  );
});

test("duplicate provider keys and unsupported capabilities fail closed", () => {
  const registry = new DeliveryProviderRegistry();
  registry.register(fakeAdapter("future_courier"));

  assert.throws(
    () => registry.register(fakeAdapter("FUTURE_COURIER")),
    (error: unknown) =>
      error instanceof DeliveryProviderBoundaryError &&
      error.code === "DELIVERY_PROVIDER_DUPLICATE",
  );

  assert.throws(
    () => registry.requireCapability("future_courier", "cancel_shipment"),
    (error: unknown) =>
      error instanceof DeliveryProviderBoundaryError &&
      error.code === "DELIVERY_PROVIDER_CAPABILITY_UNAVAILABLE",
  );
});

test("provider key is constrained so external integrations cannot inject arbitrary names", () => {
  const registry = new DeliveryProviderRegistry();

  assert.throws(
    () => registry.has("../../provider"),
    (error: unknown) =>
      error instanceof DeliveryProviderBoundaryError &&
      error.code === "DELIVERY_PROVIDER_INVALID",
  );
});
