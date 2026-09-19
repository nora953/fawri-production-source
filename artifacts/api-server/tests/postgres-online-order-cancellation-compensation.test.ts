import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compensateCancelledOnlineOrderInventoryWithTarget,
} from "../src/services/postgresOrderOperationsAuthority";
import type { OperationalSqlClient } from "../src/services/operationalPostgresAuthority";

function fixture() {
  const state = {
    locationQuantity: 3,
    locationVersion: 3,
    legacyQuantity: 3,
    legacyStatus: "available",
    mutations: 0,
    variantUpdates: 0,
    locationFreshUpdates: 0,
    queries: [] as string[],
  };

  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      state.queries.push(sql);

      if (sql.includes("FROM order_items")) {
        return {
          rows: [{
            product_id: "product-a",
            product_variant_id: null,
            quantity: 2,
          }] as T[],
        };
      }

      if (
        sql.includes("FROM location_inventory_levels") &&
        sql.includes("FOR UPDATE")
      ) {
        return {
          rows: [{
            id: "level-a",
            quantity: state.locationQuantity,
            version: state.locationVersion,
          }] as T[],
        };
      }

      if (sql.startsWith("UPDATE location_inventory_levels")) {
        assert.equal(Number(values[5]), state.locationVersion);
        state.locationQuantity = Number(values[4]);
        state.locationVersion += 1;
        return { rows: [{ id: "level-a" }] as T[] };
      }

      if (sql.startsWith("UPDATE product_variants")) {
        state.variantUpdates += 1;
        return { rows: [] as T[] };
      }

      if (sql.includes("FROM products") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            quantity: state.legacyQuantity,
            status: state.legacyStatus,
            low_stock_threshold: 1,
          }] as T[],
        };
      }

      if (sql.startsWith("UPDATE products")) {
        state.legacyQuantity = Number(values[2]);
        state.legacyStatus = String(values[3]);
        return { rows: [] as T[] };
      }

      if (sql.startsWith("INSERT INTO inventory_mutations")) {
        state.mutations += 1;
        return { rows: [] as T[] };
      }

      if (sql.startsWith("UPDATE merchant_locations")) {
        state.locationFreshUpdates += 1;
        return { rows: [] as T[] };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  return { state, client };
}

const committedMetadata = {
  online_order_commit: {
    schema_version: 1,
    request_id: "event-a",
    request_hash: "a".repeat(64),
    currency_code: "IQD",
    inventory_committed: true,
    fulfillment_location_id: "location-a",
  },
};

test("cancellation compensation restores canonical location inventory exactly once", async () => {
  const value = fixture();
  const metadata = await compensateCancelledOnlineOrderInventoryWithTarget(
    value.client,
    {
      id: "order-a",
      merchant_id: "merchant-a",
      fulfillment_location_id: "location-a",
      metadata: committedMetadata,
    },
  );

  assert.equal(value.state.locationQuantity, 5);
  assert.equal(value.state.locationVersion, 4);
  assert.equal(value.state.legacyQuantity, 5);
  assert.equal(value.state.mutations, 1);
  assert.equal(value.state.variantUpdates, 0);
  assert.equal(value.state.locationFreshUpdates, 1);

  const online = metadata?.online_order_commit as Record<string, unknown>;
  assert.equal(online.inventory_committed, true);
  assert.equal(online.inventory_release_reason, "order_cancelled");
  assert.ok(String(online.inventory_released_at || ""));

  const queryCount = value.state.queries.length;
  const second = await compensateCancelledOnlineOrderInventoryWithTarget(
    value.client,
    {
      id: "order-a",
      merchant_id: "merchant-a",
      fulfillment_location_id: "location-a",
      metadata,
    },
  );
  assert.equal(second, null);
  assert.equal(value.state.queries.length, queryCount);
  assert.equal(value.state.locationQuantity, 5);
  assert.equal(value.state.mutations, 1);
});

test("pending or legacy orders never trigger inventory compensation", async () => {
  const value = fixture();
  const pending = await compensateCancelledOnlineOrderInventoryWithTarget(
    value.client,
    {
      id: "order-pending",
      merchant_id: "merchant-a",
      fulfillment_location_id: null,
      metadata: {
        online_order_commit: {
          inventory_committed: false,
        },
      },
    },
  );
  const legacy = await compensateCancelledOnlineOrderInventoryWithTarget(
    value.client,
    {
      id: "legacy-order",
      merchant_id: "merchant-a",
      fulfillment_location_id: null,
      metadata: {},
    },
  );

  assert.equal(pending, null);
  assert.equal(legacy, null);
  assert.equal(value.state.queries.length, 0);
  assert.equal(value.state.mutations, 0);
});

test("status transition wires compensation only into cancellation", () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const source = fs.readFileSync(
    path.join(
      root,
      "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    ),
    "utf8",
  );
  assert.match(
    source,
    /next === "cancelled"[\s\S]*compensateCancelledOnlineOrderInventoryWithTarget\(client, current\)/,
  );
  assert.match(
    source,
    /metadata = CASE[\s\S]*WHEN \$4::jsonb IS NULL THEN metadata/,
  );
});
