import assert from "node:assert/strict";
import test from "node:test";

import {
  planOnlineOrderFulfillmentWithTarget,
} from "../src/services/postgresOnlineOrderFulfillmentPlanner";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function fixture(params?: {
  settings?: Record<string, unknown>;
  mappings?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  inventory?: Record<string, unknown>[];
}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
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
              version: 3,
              delivery_enabled: true,
              delivery_pricing_mode: "per_area",
              delivery_fee_iqd: 0,
              free_delivery_threshold_iqd: null,
              delivery_areas: [],
              delivery_estimated_days_min: 1,
              delivery_estimated_days_max: 3,
              ...(params?.settings || {}),
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
              fee_iqd: 5000,
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

      if (sql.includes("FROM merchant_locations")) {
        return {
          rows: (params?.locations ?? [
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
          ]) as T[],
        };
      }

      if (sql.includes("FROM location_inventory_levels")) {
        return {
          rows: (params?.inventory ?? [
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
          ]) as T[],
        };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  return { target, queries };
}

test("planner composes canonical service area with nearest fresh location routing", async () => {
  const f = fixture();
  const result = await planOnlineOrderFulfillmentWithTarget(f.target, {
    merchantId: "merchant-a",
    area: "بغداد - بالمنصور",
    requestedItems: [{ product_id: "product-a", quantity: 2 }],
    customerLatitude: 33.315,
    customerLongitude: 44.366,
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  if (result.status !== "routing_ready") return;
  assert.equal(result.service_area.area_rate_id, "rate-mansour");
  assert.deepEqual(result.service_area.eligible_location_ids, [
    "location-a",
    "location-b",
  ]);
  assert.deepEqual(result.routing, {
    status: "routed",
    location_id: "location-a",
    reason: "nearest_eligible",
  });
  assert.equal(
    result.inventory_fresh_after,
    "2026-09-19T11:55:00.000Z",
  );
  assert.equal(result.inventory_freshness_max_age_minutes, 5);
  assert.equal(result.inventory_stale_policy, "reroute_then_pending");
});

test("planner returns routing unavailable before inventory lookup when area has no location mapping", async () => {
  const f = fixture({ mappings: [] });
  const result = await planOnlineOrderFulfillmentWithTarget(f.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.deepEqual(result, {
    status: "routing_unavailable",
    service_area: {
      status: "unavailable",
      reason: "area_location_mapping_missing",
    },
  });
  assert.equal(
    f.queries.some((query) => query.sql.includes("FROM location_inventory_levels")),
    false,
  );
});

test("planner exposes stale inventory as pending fulfillment confirmation", async () => {
  const f = fixture({
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
  const result = await planOnlineOrderFulfillmentWithTarget(f.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  if (result.status !== "routing_ready") return;
  assert.deepEqual(result.routing, {
    status: "pending_fulfillment_confirmation",
    candidate_location_ids: ["location-a", "location-b"],
    reason: "inventory_stale",
  });
});

test("service-only order routes without inventory rows or freshness", async () => {
  const f = fixture({
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
        inventory_fresh_at: null,
      },
      {
        id: "location-b",
        merchant_id: "merchant-a",
        online_fulfillment_enabled: true,
        operational_status: "open",
        accept_online_orders_while_closed: false,
        merchant_priority: 9,
        latitude: null,
        longitude: null,
        inventory_fresh_at: null,
      },
    ],
    inventory: [],
  });
  const result = await planOnlineOrderFulfillmentWithTarget(f.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  if (result.status !== "routing_ready") return;
  assert.deepEqual(result.routing, {
    status: "routed",
    location_id: "location-b",
    reason: "merchant_priority",
  });
});


test("planner uses merchant-configured freshness duration", async () => {
  const f = fixture({
    settings: {
      inventory_freshness_max_age_minutes: 15,
      inventory_stale_policy: "reroute_then_pending",
    },
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
        inventory_fresh_at: "2026-09-19T11:50:01.000Z",
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
        quantity: 5,
      },
    ],
  });

  const result = await planOnlineOrderFulfillmentWithTarget(f.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.status, "routing_ready");
  if (result.status !== "routing_ready") return;
  assert.equal(result.inventory_fresh_after, "2026-09-19T11:45:00.000Z");
  assert.equal(result.inventory_freshness_max_age_minutes, 15);
  assert.deepEqual(result.routing, {
    status: "routed",
    location_id: "location-a",
    reason: "merchant_priority",
  });
});

test("planner applies merchant stale inventory policy", async () => {
  const staleLocation = {
    id: "location-a",
    merchant_id: "merchant-a",
    online_fulfillment_enabled: true,
    operational_status: "open",
    accept_online_orders_while_closed: false,
    merchant_priority: 5,
    latitude: null,
    longitude: null,
    inventory_fresh_at: "2026-09-19T11:00:00.000Z",
  };
  const shared = {
    locations: [staleLocation],
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
        quantity: 5,
      },
    ],
  };

  const allowStale = fixture({
    ...shared,
    settings: {
      inventory_freshness_max_age_minutes: 5,
      inventory_stale_policy: "allow_stale",
    },
  });
  const routed = await planOnlineOrderFulfillmentWithTarget(allowStale.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });
  assert.equal(routed.status, "routing_ready");
  if (routed.status === "routing_ready") {
    assert.equal(routed.inventory_stale_policy, "allow_stale");
    assert.deepEqual(routed.routing, {
      status: "routed",
      location_id: "location-a",
      reason: "merchant_priority",
    });
  }

  const freshOnly = fixture({
    ...shared,
    settings: {
      inventory_freshness_max_age_minutes: 5,
      inventory_stale_policy: "fresh_only",
    },
  });
  const blocked = await planOnlineOrderFulfillmentWithTarget(freshOnly.target, {
    merchantId: "merchant-a",
    area: "المنصور",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    now: "2026-09-19T12:00:00.000Z",
  });
  assert.equal(blocked.status, "routing_ready");
  if (blocked.status === "routing_ready") {
    assert.equal(blocked.inventory_stale_policy, "fresh_only");
    assert.deepEqual(blocked.routing, {
      status: "unfulfillable",
      reason: "inventory_stale",
    });
  }
});
