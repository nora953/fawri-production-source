import assert from "node:assert/strict";
import test from "node:test";

import {
  OnlineOrderFulfillmentCommitError,
  ensureOnlineOrderFulfillmentCommittedWithTarget,
  releaseOnlineOrderFulfillmentInventoryWithTarget,
} from "../src/services/postgresOnlineOrderFulfillmentCommit";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function serviceMetadata() {
  return {
    fawri_catalog_v2: {
      version: 1,
      item_type: "service",
      track_inventory: false,
      service_details: {
        duration_minutes: 30,
        buffer_minutes: 0,
        booking_required: false,
        price_type: "fixed",
        location_mode: "merchant",
      },
    },
  };
}

function fixture(params?: {
  orderItems?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  inventory?: Record<string, unknown>[];
}) {
  const now = new Date().toISOString();
  const state = {
    inventory: structuredClone(
      params?.inventory ?? [
        {
          id: "level-a",
          merchant_id: "merchant-a",
          location_id: "location-a",
          product_id: "product-a",
          variant_id: null,
          quantity: 5,
          version: 2,
        },
        {
          id: "level-b",
          merchant_id: "merchant-a",
          location_id: "location-b",
          product_id: "product-a",
          variant_id: null,
          quantity: 7,
          version: 4,
        },
      ],
    ) as Array<Record<string, unknown>>,
    mutations: [] as Array<{ sql: string; values: unknown[] }>,
    orderUpdates: [] as Array<{ sql: string; values: unknown[] }>,
    legacyProductUpdates: 0,
    legacyVariantUpdates: 0,
  };

  const target: OperationalQueryTarget = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      if (sql.includes("FROM order_items")) {
        return {
          rows: (params?.orderItems ?? [
            {
              id: "item-a",
              merchant_id: "merchant-a",
              product_id: "product-a",
              product_variant_id: null,
              quantity: 2,
              product_metadata: {},
              product_deleted_at: null,
              variant_product_id: null,
              has_variants: false,
            },
          ]) as T[],
        };
      }

      if (sql.includes("FROM merchant_settings")) {
        return {
          rows: [
            {
              merchant_id: "merchant-a",
              version: 1,
              delivery_enabled: true,
              delivery_pricing_mode: "per_area",
              delivery_fee_iqd: 0,
              free_delivery_threshold_iqd: null,
              delivery_areas: [],
              delivery_estimated_days_min: 1,
              delivery_estimated_days_max: 3,
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
          rows: [
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
          ] as T[],
        };
      }

      if (
        sql.includes("FROM merchant_locations") &&
        !sql.trimStart().startsWith("UPDATE")
      ) {
        return {
          rows: (params?.locations ?? [
            {
              id: "location-a",
              merchant_id: "merchant-a",
              online_fulfillment_enabled: true,
              operational_status: "open",
              accept_online_orders_while_closed: false,
              merchant_priority: 1,
              latitude: null,
              longitude: null,
              inventory_fresh_at: now,
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
              inventory_fresh_at: now,
            },
          ]) as T[],
        };
      }

      if (
        sql.includes("FROM location_inventory_levels") &&
        !sql.includes("FOR UPDATE")
      ) {
        return {
          rows: state.inventory.map((row) => ({
            merchant_id: row.merchant_id,
            location_id: row.location_id,
            product_id: row.product_id,
            variant_id: row.variant_id,
            quantity: row.quantity,
          })) as T[],
        };
      }

      if (
        sql.includes("FROM location_inventory_levels") &&
        sql.includes("FOR UPDATE")
      ) {
        const [, locationId, productId, variantId] = values;
        const level = state.inventory.find(
          (row) =>
            row.location_id === locationId &&
            row.product_id === productId &&
            (row.variant_id ?? null) === (variantId ?? null),
        );
        return { rows: (level ? [level] : []) as T[] };
      }

      if (sql.startsWith("UPDATE location_inventory_levels")) {
        const [, locationId, productId, variantId, after, version] = values;
        const level = state.inventory.find(
          (row) =>
            row.location_id === locationId &&
            row.product_id === productId &&
            (row.variant_id ?? null) === (variantId ?? null) &&
            row.version === version,
        );
        if (!level) return { rows: [] as T[] };
        level.quantity = after;
        level.version = Number(version) + 1;
        return { rows: [{ id: level.id }] as T[] };
      }

      if (sql.startsWith("UPDATE product_variants")) {
        state.legacyVariantUpdates += 1;
        return {
          rows: (sql.includes("RETURNING id") ? [{ id: "variant-a" }] : []) as T[],
        };
      }

      if (sql.startsWith("UPDATE products")) {
        state.legacyProductUpdates += 1;
        return {
          rows: (sql.includes("RETURNING id") ? [{ id: "product-a" }] : []) as T[],
        };
      }

      if (sql.includes("FROM inventory_mutations")) {
        const [, locationId, productId, variantId, idempotencyHash] = values;
        const mutation = state.mutations.find(
          (entry) =>
            entry.values[1] === "merchant-a" &&
            entry.values[2] === locationId &&
            entry.values[3] === productId &&
            (entry.values[4] ?? null) === (variantId ?? null) &&
            entry.values[9] === idempotencyHash,
        );
        return {
          rows: (mutation
            ? [{
                product_id: mutation.values[3],
                variant_id: mutation.values[4],
                before_quantity: mutation.values[5],
                after_quantity: mutation.values[6],
                expected_version: mutation.values[7],
                resulting_version: mutation.values[8],
              }]
            : []) as T[],
        };
      }

      if (sql.includes("INSERT INTO inventory_mutations")) {
        state.mutations.push({ sql, values: [...values] });
        return { rows: [] as T[] };
      }

      if (sql.startsWith("UPDATE merchant_locations")) {
        return { rows: [] as T[] };
      }

      if (sql.startsWith("UPDATE orders")) {
        state.orderUpdates.push({ sql, values: [...values] });
        return { rows: [] as T[] };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  return { target, state };
}

test("atomic fulfillment selects one location, rechecks stock and records one mutation", async () => {
  const f = fixture();
  const result = await ensureOnlineOrderFulfillmentCommittedWithTarget(f.target, {
    merchantId: "merchant-a",
    orderId: "order-a",
    customerArea: "المنصور",
    sourceChannel: "messenger",
    metadata: {},
  });

  assert.deepEqual(result, {
    location_id: "location-b",
    inventory_mutation_count: 1,
    replayed: false,
  });
  const levelB = f.state.inventory.find(
    (row) => row.location_id === "location-b",
  );
  assert.equal(levelB?.quantity, 5);
  assert.equal(levelB?.version, 5);
  assert.equal(f.state.mutations.length, 1);
  assert.equal(f.state.legacyProductUpdates, 1);
  assert.equal(f.state.orderUpdates.length, 1);
  assert.equal(f.state.orderUpdates[0].values[2], "location-b");
  const snapshot = JSON.parse(String(f.state.orderUpdates[0].values[3]));
  assert.equal(snapshot.location_id, "location-b");
  assert.equal(snapshot.inventory_committed, true);
  assert.equal(snapshot.inventory_mutation_count, 1);
  assert.deepEqual(snapshot.inventory_items, [
    {
      product_id: "product-a",
      quantity: 2,
      expected_version: 4,
      resulting_version: 5,
    },
  ]);
});

test("cancellation release restores the exact committed location inventory once", async () => {
  const f = fixture();
  await ensureOnlineOrderFulfillmentCommittedWithTarget(f.target, {
    merchantId: "merchant-a",
    orderId: "order-cancel-a",
    customerArea: "المنصور",
    sourceChannel: "messenger",
    metadata: {},
  });

  const levelA = f.state.inventory.find(
    (row) => row.location_id === "location-a",
  );
  const levelB = f.state.inventory.find(
    (row) => row.location_id === "location-b",
  );
  assert.equal(levelA?.quantity, 5);
  assert.equal(levelA?.version, 2);
  assert.equal(levelB?.quantity, 5);
  assert.equal(levelB?.version, 5);

  const snapshot = JSON.parse(String(f.state.orderUpdates[0].values[3]));
  const released = await releaseOnlineOrderFulfillmentInventoryWithTarget(
    f.target,
    {
      merchantId: "merchant-a",
      orderId: "order-cancel-a",
      fulfillmentLocationId: "location-b",
      metadata: { online_fulfillment_v1: snapshot },
    },
  );

  assert.equal(levelA?.quantity, 5);
  assert.equal(levelA?.version, 2);
  assert.equal(levelB?.quantity, 7);
  assert.equal(levelB?.version, 6);
  assert.equal(f.state.mutations.length, 2);
  assert.equal(f.state.legacyProductUpdates, 2);
  assert.equal(
    (released?.online_fulfillment_v1 as Record<string, unknown>)
      .inventory_release_reason,
    "order_cancelled",
  );
  assert.ok(
    String(
      (released?.online_fulfillment_v1 as Record<string, unknown>)
        .inventory_released_at || "",
    ),
  );

  const mutationCount = f.state.mutations.length;
  const replay = await releaseOnlineOrderFulfillmentInventoryWithTarget(
    f.target,
    {
      merchantId: "merchant-a",
      orderId: "order-cancel-a",
      fulfillmentLocationId: "location-b",
      metadata: released,
    },
  );
  assert.equal(replay, null);
  assert.equal(f.state.mutations.length, mutationCount);
  assert.equal(levelB?.quantity, 7);
  assert.equal(levelB?.version, 6);
});

test("legacy committed snapshot recovers exact inventory evidence from mutation history", async () => {
  const f = fixture();
  await ensureOnlineOrderFulfillmentCommittedWithTarget(f.target, {
    merchantId: "merchant-a",
    orderId: "order-legacy-cancel",
    customerArea: "المنصور",
    sourceChannel: "messenger",
    metadata: {},
  });

  const snapshot = JSON.parse(String(f.state.orderUpdates[0].values[3]));
  delete snapshot.inventory_items;
  const levelB = f.state.inventory.find(
    (row) => row.location_id === "location-b",
  );
  assert.equal(levelB?.quantity, 5);
  assert.equal(levelB?.version, 5);

  const released = await releaseOnlineOrderFulfillmentInventoryWithTarget(
    f.target,
    {
      merchantId: "merchant-a",
      orderId: "order-legacy-cancel",
      fulfillmentLocationId: "location-b",
      metadata: { online_fulfillment_v1: snapshot },
    },
  );

  assert.equal(levelB?.quantity, 7);
  assert.equal(levelB?.version, 6);
  assert.equal(f.state.mutations.length, 2);
  assert.equal(
    (released?.online_fulfillment_v1 as Record<string, unknown>)
      .inventory_release_reason,
    "order_cancelled",
  );
});

test("cancellation release fails closed if the order location differs from the committed location", async () => {
  const f = fixture();
  await ensureOnlineOrderFulfillmentCommittedWithTarget(f.target, {
    merchantId: "merchant-a",
    orderId: "order-cancel-mismatch",
    customerArea: "المنصور",
    sourceChannel: "messenger",
    metadata: {},
  });
  const snapshot = JSON.parse(String(f.state.orderUpdates[0].values[3]));
  const mutationsBefore = f.state.mutations.length;

  await assert.rejects(
    () =>
      releaseOnlineOrderFulfillmentInventoryWithTarget(f.target, {
        merchantId: "merchant-a",
        orderId: "order-cancel-mismatch",
        fulfillmentLocationId: "location-a",
        metadata: { online_fulfillment_v1: snapshot },
      }),
    (error: unknown) => {
      assert.ok(error instanceof OnlineOrderFulfillmentCommitError);
      assert.equal(error.code, "ORDER_FULFILLMENT_RELEASE_LOCATION_INVALID");
      return true;
    },
  );
  assert.equal(f.state.mutations.length, mutationsBefore);
});

test("stale inventory blocks confirmation before stock is locked or mutated", async () => {
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
        inventory_fresh_at: "2020-01-01T00:00:00.000Z",
      },
    ],
    inventory: [
      {
        id: "level-a",
        merchant_id: "merchant-a",
        location_id: "location-a",
        product_id: "product-a",
        variant_id: null,
        quantity: 5,
        version: 1,
      },
    ],
  });

  await assert.rejects(
    () =>
      ensureOnlineOrderFulfillmentCommittedWithTarget(f.target, {
        merchantId: "merchant-a",
        orderId: "order-a",
        customerArea: "المنصور",
        sourceChannel: "instagram",
        metadata: {},
      }),
    (error: unknown) => {
      assert.ok(error instanceof OnlineOrderFulfillmentCommitError);
      assert.equal(error.code, "ORDER_FULFILLMENT_CONFIRMATION_REQUIRED");
      return true;
    },
  );
  assert.equal(f.state.mutations.length, 0);
  assert.equal(f.state.orderUpdates.length, 0);
});

test("variant identity must belong to the same catalog product", async () => {
  const f = fixture({
    orderItems: [
      {
        id: "item-a",
        merchant_id: "merchant-a",
        product_id: "product-a",
        product_variant_id: "variant-b",
        quantity: 1,
        product_metadata: {},
        product_deleted_at: null,
        variant_product_id: "product-b",
        has_variants: true,
      },
    ],
  });

  await assert.rejects(
    () =>
      ensureOnlineOrderFulfillmentCommittedWithTarget(f.target, {
        merchantId: "merchant-a",
        orderId: "order-a",
        customerArea: "المنصور",
        sourceChannel: "messenger",
        metadata: {},
      }),
    (error: unknown) => {
      assert.ok(error instanceof OnlineOrderFulfillmentCommitError);
      assert.equal(error.code, "ORDER_FULFILLMENT_VARIANT_MISMATCH");
      return true;
    },
  );
  assert.equal(f.state.mutations.length, 0);
});

test("service-only order freezes a location without inventory mutation", async () => {
  const f = fixture({
    orderItems: [
      {
        id: "service-item",
        merchant_id: "merchant-a",
        product_id: "service-a",
        product_variant_id: null,
        quantity: 1,
        product_metadata: serviceMetadata(),
        product_deleted_at: null,
        variant_product_id: null,
        has_variants: false,
      },
    ],
    inventory: [],
  });

  const result = await ensureOnlineOrderFulfillmentCommittedWithTarget(f.target, {
    merchantId: "merchant-a",
    orderId: "order-service",
    customerArea: "المنصور",
    sourceChannel: "messenger",
    metadata: {},
  });

  assert.equal(result.location_id, "location-b");
  assert.equal(result.inventory_mutation_count, 0);
  assert.equal(f.state.mutations.length, 0);
  assert.equal(f.state.legacyProductUpdates, 0);
  assert.equal(f.state.orderUpdates.length, 1);
  const snapshot = JSON.parse(String(f.state.orderUpdates[0].values[3]));
  assert.deepEqual(snapshot.inventory_items, []);
});
