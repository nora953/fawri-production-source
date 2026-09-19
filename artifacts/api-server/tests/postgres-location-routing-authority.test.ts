import assert from "node:assert/strict";
import test from "node:test";

import {
  LocationRoutingAuthorityError,
  routeOrderToLocationWithTarget,
} from "../src/services/postgresLocationRoutingAuthority";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function target(params?: {
  locations?: Record<string, unknown>[];
  inventory?: Record<string, unknown>[];
}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const value: OperationalQueryTarget = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      queries.push({ sql, values: [...values] });
      if (sql.includes("FROM merchant_locations")) {
        return {
          rows: (params?.locations || [
            {
              id: "location-a",
              merchant_id: "merchant-a",
              online_fulfillment_enabled: true,
              operational_status: "open",
              accept_online_orders_while_closed: false,
              merchant_priority: 1,
              latitude: 33.3152,
              longitude: 44.3661,
              inventory_fresh_at: "2026-09-19T04:00:00.000Z",
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
              inventory_fresh_at: "2026-09-19T04:00:00.000Z",
            },
          ]) as T[],
        };
      }
      if (sql.includes("FROM location_inventory_levels")) {
        return {
          rows: (params?.inventory || [
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
  return { target: value, queries };
}

test("PostgreSQL routing adapter stays tenant scoped and uses eligible locations only", async () => {
  const fixture = target();
  const result = await routeOrderToLocationWithTarget(fixture.target, {
    merchantId: "merchant-a",
    requestedItems: [{ product_id: "product-a", quantity: 2 }],
    eligibleLocationIds: ["location-b"],
    inventoryFreshAfter: "2026-09-19T03:59:00.000Z",
  });

  assert.deepEqual(result, {
    status: "routed",
    location_id: "location-b",
    reason: "merchant_priority",
  });
  assert.match(fixture.queries[0].sql, /WHERE merchant_id = \$1/);
  assert.deepEqual(fixture.queries[0].values, ["merchant-a"]);
  assert.match(fixture.queries[1].sql, /WHERE merchant_id = \$1/);
  assert.deepEqual(fixture.queries[1].values, ["merchant-a", ["product-a"]]);
});

test("customer coordinates rank the nearest eligible stocked location", async () => {
  const fixture = target();
  const result = await routeOrderToLocationWithTarget(fixture.target, {
    merchantId: "merchant-a",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    eligibleLocationIds: ["location-a", "location-b"],
    inventoryFreshAfter: "2026-09-19T03:59:00.000Z",
    customerLatitude: 33.315,
    customerLongitude: 44.366,
  });

  assert.deepEqual(result, {
    status: "routed",
    location_id: "location-a",
    reason: "nearest_eligible",
  });
});

test("stale inventory returns pending confirmation instead of auto-routing", async () => {
  const fixture = target();
  const result = await routeOrderToLocationWithTarget(fixture.target, {
    merchantId: "merchant-a",
    requestedItems: [{ product_id: "product-a", quantity: 1 }],
    eligibleLocationIds: ["location-a", "location-b"],
    inventoryFreshAfter: "2026-09-19T05:00:00.000Z",
  });

  assert.deepEqual(result, {
    status: "pending_fulfillment_confirmation",
    candidate_location_ids: ["location-a", "location-b"],
    reason: "inventory_stale",
  });
});

test("adapter rejects cross-tenant location rows even if the SQL target misbehaves", async () => {
  const fixture = target({
    locations: [
      {
        id: "location-bad",
        merchant_id: "merchant-b",
        online_fulfillment_enabled: true,
        operational_status: "open",
        accept_online_orders_while_closed: false,
        merchant_priority: 1,
        latitude: null,
        longitude: null,
        inventory_fresh_at: "2026-09-19T04:00:00.000Z",
      },
    ],
    inventory: [],
  });

  await assert.rejects(
    () =>
      routeOrderToLocationWithTarget(fixture.target, {
        merchantId: "merchant-a",
        requestedItems: [{ product_id: "product-a", quantity: 1 }],
        eligibleLocationIds: ["location-bad"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof LocationRoutingAuthorityError);
      assert.equal(error.code, "LOCATION_ROUTING_TENANT_VIOLATION");
      return true;
    },
  );
});

test("adapter rejects inventory rows from another tenant", async () => {
  const fixture = target({
    inventory: [
      {
        merchant_id: "merchant-b",
        location_id: "location-a",
        product_id: "product-a",
        variant_id: null,
        quantity: 5,
      },
    ],
  });

  await assert.rejects(
    () =>
      routeOrderToLocationWithTarget(fixture.target, {
        merchantId: "merchant-a",
        requestedItems: [{ product_id: "product-a", quantity: 1 }],
        eligibleLocationIds: ["location-a"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof LocationRoutingAuthorityError);
      assert.equal(error.code, "LOCATION_ROUTING_TENANT_VIOLATION");
      return true;
    },
  );
});
