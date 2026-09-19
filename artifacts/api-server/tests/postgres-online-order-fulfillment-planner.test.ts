import assert from "node:assert/strict";
import test from "node:test";

import {
  planOnlineOrderFulfillmentWithTarget,
} from "../src/services/postgresOnlineOrderFulfillmentPlanner";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function buildFixture(params?: {
  mappings?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  inventory?: Record<string, unknown>[];
}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const locations =
    params?.locations ??
    [
      {
        id: "location-a",
        merchant_id: "merchant-a",
        online_fulfillment_enabled: true,
        operational_status: "open",
        accept_online_orders_while_closed: false,
        merchant_priority: 1,
        latitude: 33.3152,
        longitude: 44.3661,
        inventory_fresh_at: "2026-09-19T11:59:00.000Z",
      },
      {
        id: "location-b",
        merchant_id: "merchant-a",
        online_fulfillment_enabled: true,
        operational_status: "open",
        accept_online_orders_while_closed: false,
        merchant_priority: 10,
        latitude: 33.30,
        longitude: 44.40,
        inventory_fresh_at: "2026-09-19T11:59:00.000Z",
      },
    ];
  const inventory =
    params?.inventory ??
    [
      {
        merchant_id: "merchant-a",
        location_id: "location-a",
        product_id: "product-a",
        variant_id: null,
        quantity: 5,
      },
      {
        merchant_id: "merchant-a",
        location_id: "location-b",
        product_id: "product-a",
        variant_id: null,
        quantity: 5,
      },
    ];

  const target: OperationalQueryTarget = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      queries.push({ sql, values: [...values] });

      if (sql.includes("FROM merchant_settings")) {
        return {
          rows: [
            {
              merchant_id: "merchant-a",
              version: 7,
              delivery_enabled: true,
              delivery_pricing_mode: "per_area",
              delivery_fee_iqd: 0,
              free_delivery_threshold_iqd: null,
              delivery_estimated_days_min: 1,
              delivery_estimated_days_max: 3,
              delivery_areas: [],
            },
          ] as T[],
        };
      }

      if (sql.includes("FROM merchant_delivery_area_rates")) {
        return {
          rows: [
            {
              id: "rate-mansour",
              merchant_id: "merchant-a",
              area_name: "المنصور",
              normalized_area_name: normalizeDeliveryAreaName("المنصور"),
              fee_iqd: 5_000,
              enabled: true,
            },
          ] as T[],
        };
      }

      if (sql.includes("FROM merchant_location_delivery_areas")) {
        return {
          rows: (params?.mappings ?? [
            {
              merchant_id: "merchant-a",
              location_id: "location-a",
              delivery_area_rate_id: "rate-mansour",
            },
            {
              merchant_id: "merchant-a",
              location_id: "location-b",
              delivery_area_rate_id: "rate-mansour",
            },
          ]) as T[],
        };
      }

      if (sql.includes("FROM location_inventory_levels")) {
        return { rows: inventory as T[] };
      }

      if (sql.includes("FROM merchant_locations")) {
        return { rows: locations as T[] };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  return { target, queries };
}

test("planner composes canonical service area and nearest fresh routing", async () => {
  const fixture = buildFixture();
  const result = await planOnlineOrderFulfillmentWithTarget(fixture.target, {
    merchantId: "merchant-a",
    area: "بغداد - بالمنصور",
    subtotalIqd: 20_000,
    requestedItems: [{ product_id: "product-a", quantity: 2 }],
    customerLatitude: 33.315,
    customerLongitude: 44.366,
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  assert.deepEqual(result.eligible_location_ids, ["location-a", "location-b"]);
  assert.equal(result.delivery_quote.area_rate_id, "rate-mansour");
  assert.equal(result.delivery_quote.effective_fee_iqd, 5_000);
  assert.deepEqual(result.routing, {
    status: "routed",
    location_id: "location-a",
    reason: "nearest_eligible",
  });
});

test("planner fails closed before routing when covered area has no location mapping", async () => {
  const fixture = buildFixture({ mappings: [] });
  const result = await planOnlineOrderFulfillmentWithTarget(fixture.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    subtotalIqd: 20_000,
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.deepEqual(result, {
    status: "delivery_unavailable",
    reason: "area_not_assigned_to_location",
    delivery_quote: result.delivery_quote,
    eligible_location_ids: [],
  });
  assert.equal(
    fixture.queries.some((entry) =>
      entry.sql.includes("FROM location_inventory_levels"),
    ),
    false,
  );
});

test("planner returns pending fulfillment confirmation when all eligible stock is stale", async () => {
  const fixture = buildFixture({
    locations: [
      {
        id: "location-a",
        merchant_id: "merchant-a",
        online_fulfillment_enabled: true,
        operational_status: "open",
        accept_online_orders_while_closed: false,
        merchant_priority: 1,
        latitude: null,
        longitude: null,
        inventory_fresh_at: "2026-09-19T11:50:00.000Z",
      },
      {
        id: "location-b",
        merchant_id: "merchant-a",
        online_fulfillment_enabled: true,
        operational_status: "open",
        accept_online_orders_while_closed: false,
        merchant_priority: 2,
        latitude: null,
        longitude: null,
        inventory_fresh_at: "2026-09-19T11:54:59.000Z",
      },
    ],
  });
  const result = await planOnlineOrderFulfillmentWithTarget(fixture.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  assert.deepEqual(result.routing, {
    status: "pending_fulfillment_confirmation",
    candidate_location_ids: ["location-a", "location-b"],
    reason: "inventory_stale",
  });
});

test("planner never combines inventory across locations", async () => {
  const fixture = buildFixture({
    inventory: [
      {
        merchant_id: "merchant-a",
        location_id: "location-a",
        product_id: "product-a",
        variant_id: null,
        quantity: 1,
      },
      {
        merchant_id: "merchant-a",
        location_id: "location-b",
        product_id: "product-a",
        variant_id: null,
        quantity: 1,
      },
    ],
  });
  const result = await planOnlineOrderFulfillmentWithTarget(fixture.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 2 }],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  assert.deepEqual(result.routing, {
    status: "unfulfillable",
    reason: "insufficient_single_location_inventory",
  });
});

test("planner freshness default is exactly five minutes at the boundary", async () => {
  const fixture = buildFixture({
    locations: [
      {
        id: "location-a",
        merchant_id: "merchant-a",
        online_fulfillment_enabled: true,
        operational_status: "open",
        accept_online_orders_while_closed: false,
        merchant_priority: 1,
        latitude: null,
        longitude: null,
        inventory_fresh_at: "2026-09-19T11:55:00.000Z",
      },
    ],
    mappings: [
      {
        merchant_id: "merchant-a",
        location_id: "location-a",
        delivery_area_rate_id: "rate-mansour",
      },
    ],
    inventory: [
      {
        merchant_id: "merchant-a",
        location_id: "location-a",
        product_id: "product-a",
        variant_id: null,
        quantity: 2,
      },
    ],
  });

  const result = await planOnlineOrderFulfillmentWithTarget(fixture.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  assert.deepEqual(result.routing, {
    status: "routed",
    location_id: "location-a",
    reason: "merchant_priority",
  });
});
