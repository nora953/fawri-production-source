import assert from "node:assert/strict";
import test from "node:test";

import {
  routeOrderToLocation,
  type RoutingCandidate,
} from "../src/services/locationRoutingEngine";

function candidate(
  id: string,
  overrides: Partial<RoutingCandidate> = {},
): RoutingCandidate {
  return {
    location_id: id,
    service_area_eligible: true,
    online_fulfillment_enabled: true,
    operational_status: "open",
    accept_online_orders_while_closed: false,
    inventory_fresh: true,
    merchant_priority: 0,
    inventory: [
      { product_id: "product-a", quantity: 5 },
      { product_id: "product-b", variant_id: "variant-b1", quantity: 3 },
    ],
    ...overrides,
  };
}

const requested = [
  { product_id: "product-a", quantity: 2 },
  { product_id: "product-b", variant_id: "variant-b1", quantity: 1 },
];

test("duplicate order lines for the same item are summed before routing", () => {
  const result = routeOrderToLocation({
    requested_items: [
      { product_id: "product-a", quantity: 3 },
      { product_id: "product-a", quantity: 3 },
    ],
    candidates: [
      candidate("location-a", {
        inventory: [{ product_id: "product-a", quantity: 5 }],
      }),
    ],
  });

  assert.deepEqual(result, {
    status: "unfulfillable",
    reason: "insufficient_single_location_inventory",
  });
});

test("service-only orders route without inventory or freshness requirements", () => {
  const result = routeOrderToLocation({
    requested_items: [],
    candidates: [
      candidate("location-stale", {
        inventory_fresh: false,
        merchant_priority: 2,
        inventory: [],
      }),
      candidate("location-priority", {
        inventory_fresh: false,
        merchant_priority: 9,
        inventory: [],
      }),
    ],
  });

  assert.deepEqual(result, {
    status: "routed",
    location_id: "location-priority",
    reason: "merchant_priority",
  });
});

test("routing never combines stock across locations", () => {
  const result = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-a", {
        inventory: [
          { product_id: "product-a", quantity: 2 },
          { product_id: "product-b", variant_id: "variant-b1", quantity: 0 },
        ],
      }),
      candidate("location-b", {
        inventory: [
          { product_id: "product-a", quantity: 0 },
          { product_id: "product-b", variant_id: "variant-b1", quantity: 1 },
        ],
      }),
    ],
  });

  assert.deepEqual(result, {
    status: "unfulfillable",
    reason: "insufficient_single_location_inventory",
  });
});

test("service area and online fulfillment are hard eligibility gates", () => {
  const outside = routeOrderToLocation({
    requested_items: requested,
    candidates: [candidate("location-a", { service_area_eligible: false })],
  });
  assert.equal(outside.status, "unfulfillable");
  assert.equal(outside.reason, "outside_service_area");

  const disabled = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-a", { online_fulfillment_enabled: false }),
    ],
  });
  assert.equal(disabled.status, "unfulfillable");
  assert.equal(disabled.reason, "online_fulfillment_disabled");
});

test("temporarily unavailable locations are never routed", () => {
  const result = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-a", {
        operational_status: "temporarily_unavailable",
        merchant_priority: 100,
      }),
      candidate("location-b", { merchant_priority: 1 }),
    ],
  });

  assert.deepEqual(result, {
    status: "routed",
    location_id: "location-b",
    reason: "merchant_priority",
  });
});

test("closed location is eligible only when merchant explicitly allows online orders", () => {
  const denied = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-a", {
        operational_status: "closed",
        accept_online_orders_while_closed: false,
      }),
    ],
  });
  assert.equal(denied.status, "unfulfillable");
  assert.equal(denied.reason, "location_unavailable");

  const allowed = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-a", {
        operational_status: "closed",
        accept_online_orders_while_closed: true,
      }),
    ],
  });
  assert.deepEqual(allowed, {
    status: "routed",
    location_id: "location-a",
    reason: "merchant_priority",
  });
});

test("stale stock does not auto-route and becomes pending confirmation", () => {
  const result = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-b", {
        inventory_fresh: false,
        merchant_priority: 5,
      }),
      candidate("location-a", {
        inventory_fresh: false,
        merchant_priority: 10,
      }),
    ],
  });

  assert.deepEqual(result, {
    status: "pending_fulfillment_confirmation",
    candidate_location_ids: ["location-a", "location-b"],
    reason: "inventory_stale",
  });
});

test("nearest eligible location wins before merchant priority", () => {
  const result = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-priority", {
        merchant_priority: 100,
        distance_meters: 5000,
      }),
      candidate("location-near", {
        merchant_priority: 1,
        distance_meters: 800,
      }),
    ],
  });

  assert.deepEqual(result, {
    status: "routed",
    location_id: "location-near",
    reason: "nearest_eligible",
  });
});

test("merchant priority breaks ties and is deterministic when distance is unavailable", () => {
  const priority = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-a", { merchant_priority: 2 }),
      candidate("location-b", { merchant_priority: 8 }),
    ],
  });
  assert.deepEqual(priority, {
    status: "routed",
    location_id: "location-b",
    reason: "merchant_priority",
  });

  const stable = routeOrderToLocation({
    requested_items: requested,
    candidates: [
      candidate("location-b", { merchant_priority: 8 }),
      candidate("location-a", { merchant_priority: 8 }),
    ],
  });
  assert.deepEqual(stable, {
    status: "routed",
    location_id: "location-a",
    reason: "merchant_priority",
  });
});


test("merchant may explicitly accept stale inventory risk", () => {
  const result = routeOrderToLocation({
    requested_items: requested,
    stale_inventory_policy: "allow_stale",
    candidates: [
      candidate("location-a", {
        inventory_fresh: false,
        merchant_priority: 1,
      }),
      candidate("location-b", {
        inventory_fresh: false,
        merchant_priority: 9,
      }),
    ],
  });

  assert.deepEqual(result, {
    status: "routed",
    location_id: "location-b",
    reason: "merchant_priority",
  });
});

test("fresh-only policy excludes stale locations instead of auto-routing", () => {
  const result = routeOrderToLocation({
    requested_items: requested,
    stale_inventory_policy: "fresh_only",
    candidates: [
      candidate("location-a", {
        inventory_fresh: false,
        merchant_priority: 100,
      }),
    ],
  });

  assert.deepEqual(result, {
    status: "unfulfillable",
    reason: "inventory_stale",
  });
});

test("all stale policies still prefer a fresh eligible location when one exists", () => {
  for (const stalePolicy of [
    "reroute_then_pending",
    "allow_stale",
    "fresh_only",
  ] as const) {
    const result = routeOrderToLocation({
      requested_items: requested,
      stale_inventory_policy: stalePolicy,
      candidates: [
        candidate("location-stale", {
          inventory_fresh: false,
          merchant_priority: 100,
        }),
        candidate("location-fresh", {
          inventory_fresh: true,
          merchant_priority: 1,
        }),
      ],
    });

    assert.deepEqual(result, {
      status: "routed",
      location_id: "location-fresh",
      reason: "merchant_priority",
    });
  }
});
