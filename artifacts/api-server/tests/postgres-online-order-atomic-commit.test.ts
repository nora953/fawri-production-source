import assert from "node:assert/strict";
import test from "node:test";

import {
  OnlineOrderCommitError,
  commitOnlineOrderWithTarget,
} from "../src/services/postgresOnlineOrderCommitAuthority";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function createState(params?: {
  inventoryQuantity?: number;
  inventoryFreshAt?: string;
}) {
  const state = {
    inventoryQuantity: params?.inventoryQuantity ?? 5,
    inventoryVersion: 2,
    legacyProductQuantity: 5,
    legacyProductStatus: "available",
    mutationCount: 0,
    orderItemCount: 0,
    levelUpdateCount: 0,
    orders: new Map<string, {
      id: string;
      status: string;
      fulfillment_location_id: string | null;
      subtotal_iqd: number;
      delivery_fee_iqd: number;
      total_iqd: number;
      metadata: Record<string, unknown>;
    }>(),
    queries: [] as Array<{ sql: string; values: unknown[] }>,
  };

  const target: OperationalQueryTarget = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      state.queries.push({ sql, values: [...values] });

      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] as T[] };

      if (sql.includes("FROM orders") && sql.includes("FOR UPDATE")) {
        const order = state.orders.get(String(values[1]));
        return { rows: (order ? [order] : []) as T[] };
      }

      if (sql.includes("FROM merchants")) {
        return { rows: [{ id: "merchant-a", currency_code: "IQD" }] as T[] };
      }

      if (sql.includes("FROM products") && sql.includes("current_price_iqd")) {
        return {
          rows: [{
            id: "product-a",
            merchant_id: "merchant-a",
            name: "قميص",
            current_price_iqd: 10_000,
            variant_stock_mode: false,
            version: 3,
            status: state.legacyProductStatus,
            metadata: {},
          }] as T[],
        };
      }

      if (sql.includes("FROM product_variants") && sql.includes("price_adjustment_iqd")) {
        return { rows: [] as T[] };
      }

      if (sql.includes("FROM commerce_promotions")) {
        return { rows: [] as T[] };
      }

      if (sql.includes("FROM merchant_settings")) {
        return {
          rows: [{
            merchant_id: "merchant-a",
            version: 1,
            delivery_enabled: true,
            delivery_pricing_mode: "per_area",
            delivery_fee_iqd: 0,
            free_delivery_threshold_iqd: null,
            delivery_estimated_days_min: 1,
            delivery_estimated_days_max: 3,
            delivery_areas: [],
          }] as T[],
        };
      }

      if (sql.includes("FROM merchant_delivery_area_rates")) {
        return {
          rows: [{
            id: "rate-mansour",
            merchant_id: "merchant-a",
            area_name: "المنصور",
            normalized_area_name: normalizeDeliveryAreaName("المنصور"),
            fee_iqd: 5_000,
            enabled: true,
          }] as T[],
        };
      }

      if (sql.includes("FROM merchant_location_delivery_areas")) {
        return {
          rows: [{
            merchant_id: "merchant-a",
            location_id: "location-a",
            delivery_area_rate_id: "rate-mansour",
          }] as T[],
        };
      }

      if (
        sql.includes("FROM merchant_locations") &&
        sql.includes("inventory_fresh_at")
      ) {
        return {
          rows: [{
            id: "location-a",
            merchant_id: "merchant-a",
            online_fulfillment_enabled: true,
            operational_status: "open",
            accept_online_orders_while_closed: false,
            merchant_priority: 1,
            latitude: null,
            longitude: null,
            inventory_fresh_at:
              params?.inventoryFreshAt ?? "2026-09-19T11:59:00.000Z",
          }] as T[],
        };
      }

      if (
        sql.includes("FROM location_inventory_levels") &&
        sql.includes("merchant_id, location_id")
      ) {
        return {
          rows: [{
            merchant_id: "merchant-a",
            location_id: "location-a",
            product_id: "product-a",
            variant_id: null,
            quantity: state.inventoryQuantity,
          }] as T[],
        };
      }

      if (
        sql.includes("FROM merchant_locations") &&
        sql.includes("FOR UPDATE")
      ) {
        return {
          rows: [{
            id: "location-a",
            online_fulfillment_enabled: true,
            operational_status: "open",
            accept_online_orders_while_closed: false,
          }] as T[],
        };
      }

      if (
        sql.includes("FROM location_inventory_levels") &&
        sql.includes("SELECT id, quantity, version")
      ) {
        return {
          rows: [{
            id: "level-a",
            quantity: state.inventoryQuantity,
            version: state.inventoryVersion,
          }] as T[],
        };
      }

      if (sql.startsWith("UPDATE location_inventory_levels")) {
        assert.equal(Number(values[5]), state.inventoryVersion);
        state.inventoryQuantity = Number(values[4]);
        state.inventoryVersion += 1;
        state.levelUpdateCount += 1;
        return { rows: [{ id: "level-a" }] as T[] };
      }

      if (
        sql.includes("FROM products") &&
        sql.includes("low_stock_threshold") &&
        sql.includes("FOR UPDATE")
      ) {
        return {
          rows: [{
            id: "product-a",
            quantity: state.legacyProductQuantity,
            status: state.legacyProductStatus,
            low_stock_threshold: 1,
            version: 3,
          }] as T[],
        };
      }

      if (sql.startsWith("UPDATE products")) {
        state.legacyProductQuantity = Number(values[2]);
        state.legacyProductStatus = String(values[3]);
        return { rows: [{ id: "product-a" }] as T[] };
      }

      if (sql.startsWith("UPDATE product_variants")) {
        return { rows: [] as T[] };
      }

      if (sql.startsWith("INSERT INTO inventory_mutations")) {
        state.mutationCount += 1;
        return { rows: [] as T[] };
      }

      if (sql.startsWith("UPDATE merchant_locations")) {
        return { rows: [] as T[] };
      }

      if (sql.startsWith("INSERT INTO orders")) {
        const metadata = JSON.parse(String(values[16])) as Record<string, unknown>;
        state.orders.set(String(values[0]), {
          id: String(values[0]),
          status: String(values[9]),
          fulfillment_location_id: values[8] ? String(values[8]) : null,
          subtotal_iqd: Number(values[10]),
          delivery_fee_iqd: Number(values[11]),
          total_iqd: Number(values[12]),
          metadata,
        });
        return { rows: [] as T[] };
      }

      if (sql.startsWith("INSERT INTO order_items")) {
        state.orderItemCount += 1;
        return { rows: [] as T[] };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  return { state, target };
}

const baseRequest = {
  merchantId: "merchant-a",
  requestId: "event-order-001",
  customerName: "Customer",
  customerAddress: "المنصور - بغداد",
  area: "المنصور",
  requestedItems: [{ product_id: "product-a", quantity: 2 }],
  sourceChannel: "messenger",
  now: "2026-09-19T12:00:00.000Z",
} as const;

test("fresh COD order atomically commits one location inventory deduction and canonical order", async () => {
  const fixture = createState();
  const result = await commitOnlineOrderWithTarget(fixture.target, baseRequest);

  assert.equal(result.outcome, "committed");
  if (result.outcome !== "committed") return;
  assert.equal(result.fulfillment_location_id, "location-a");
  assert.equal(result.subtotal_minor, 20_000);
  assert.equal(result.delivery_fee_minor, 5_000);
  assert.equal(result.total_minor, 25_000);
  assert.equal(fixture.state.inventoryQuantity, 3);
  assert.equal(fixture.state.inventoryVersion, 3);
  assert.equal(fixture.state.legacyProductQuantity, 3);
  assert.equal(fixture.state.mutationCount, 1);
  assert.equal(fixture.state.orderItemCount, 1);
  const order = fixture.state.orders.get(result.order_id);
  assert.equal(order?.status, "confirmed");
  assert.equal(order?.fulfillment_location_id, "location-a");
});

test("stale inventory creates pending confirmation without inventory mutation", async () => {
  const fixture = createState({
    inventoryFreshAt: "2026-09-19T11:50:00.000Z",
  });
  const result = await commitOnlineOrderWithTarget(fixture.target, {
    ...baseRequest,
    requestId: "event-order-stale",
  });

  assert.equal(result.outcome, "pending_confirmation");
  assert.equal(fixture.state.inventoryQuantity, 5);
  assert.equal(fixture.state.levelUpdateCount, 0);
  assert.equal(fixture.state.mutationCount, 0);
  assert.equal(fixture.state.orderItemCount, 1);
  if (result.outcome === "pending_confirmation") {
    assert.equal(fixture.state.orders.get(result.order_id)?.status, "pending_confirmation");
  }
});

test("insufficient single-location inventory does not create an order or mutate stock", async () => {
  const fixture = createState({ inventoryQuantity: 1 });
  const result = await commitOnlineOrderWithTarget(fixture.target, {
    ...baseRequest,
    requestId: "event-order-insufficient",
  });

  assert.deepEqual(result, {
    outcome: "unfulfillable",
    reason: "insufficient_single_location_inventory",
    replayed: false,
  });
  assert.equal(fixture.state.orders.size, 0);
  assert.equal(fixture.state.mutationCount, 0);
  assert.equal(fixture.state.levelUpdateCount, 0);
});

test("same request id replays existing order and never deducts twice", async () => {
  const fixture = createState();
  const first = await commitOnlineOrderWithTarget(fixture.target, {
    ...baseRequest,
    requestId: "event-order-replay",
  });
  assert.equal(first.outcome, "committed");
  const quantityAfterFirst = fixture.state.inventoryQuantity;
  const mutationsAfterFirst = fixture.state.mutationCount;

  const second = await commitOnlineOrderWithTarget(fixture.target, {
    ...baseRequest,
    requestId: "event-order-replay",
  });

  assert.equal(second.outcome, "replayed");
  assert.equal(fixture.state.inventoryQuantity, quantityAfterFirst);
  assert.equal(fixture.state.mutationCount, mutationsAfterFirst);
  assert.equal(fixture.state.levelUpdateCount, 1);
});

test("electronic payment cannot enter inventory commit until its compensation flow exists", async () => {
  const fixture = createState();
  await assert.rejects(
    () =>
      commitOnlineOrderWithTarget(fixture.target, {
        ...baseRequest,
        requestId: "event-order-electronic",
        paymentMethod: "fastpay",
      }),
    (error: unknown) =>
      error instanceof OnlineOrderCommitError &&
      error.code === "ONLINE_ORDER_COMMIT_PAYMENT_FLOW_NOT_READY",
  );
  assert.equal(fixture.state.queries.length, 0);
});
