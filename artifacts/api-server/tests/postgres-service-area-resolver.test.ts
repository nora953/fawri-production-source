import assert from "node:assert/strict";
import test from "node:test";

import {
  ServiceAreaResolverError,
  resolveServiceAreaWithTarget,
} from "../src/services/postgresServiceAreaResolver";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function fixture(params?: {
  settings?: Record<string, unknown>[];
  rates?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  mappings?: Record<string, unknown>[];
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
          rows: (params?.settings ?? [
            {
              merchant_id: "merchant-a",
              version: 4,
              delivery_enabled: true,
              delivery_pricing_mode: "per_area",
              delivery_fee_iqd: 0,
              free_delivery_threshold_iqd: 50_000,
              delivery_estimated_days_min: 1,
              delivery_estimated_days_max: 3,
              delivery_areas: [],
            },
          ]) as T[],
        };
      }
      if (sql.includes("FROM merchant_delivery_area_rates")) {
        return {
          rows: (params?.rates ?? [
            {
              id: "rate-mansour",
              merchant_id: "merchant-a",
              area_name: "المنصور",
              normalized_area_name: normalizeDeliveryAreaName("المنصور"),
              fee_iqd: 5_000,
              enabled: true,
            },
            {
              id: "rate-karrada",
              merchant_id: "merchant-a",
              area_name: "الكرادة",
              normalized_area_name: normalizeDeliveryAreaName("الكرادة"),
              fee_iqd: 4_000,
              enabled: true,
            },
          ]) as T[],
        };
      }
      if (sql.includes("FROM merchant_location_delivery_areas")) {
        return {
          rows: (params?.mappings ?? [
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
            { id: "location-a", merchant_id: "merchant-a" },
            { id: "location-b", merchant_id: "merchant-a" },
          ]) as T[],
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return { target, queries };
}

test("per-area resolver uses the canonical delivery quote and location mapping", async () => {
  const value = fixture();
  const result = await resolveServiceAreaWithTarget(value.target, {
    merchantId: "merchant-a",
    area: "بغداد - بالمنصور",
    subtotalIqd: 20_000,
  });

  assert.equal(result.available, true);
  assert.equal(result.pricing_mode, "per_area");
  assert.equal(result.matched_area, "المنصور");
  assert.equal(result.delivery_area_rate_id, "rate-mansour");
  assert.deepEqual(result.eligible_location_ids, ["location-b"]);
  assert.equal(result.delivery_quote.effective_fee_iqd, 5_000);

  const mappingQuery = value.queries.find((item) =>
    item.sql.includes("FROM merchant_location_delivery_areas"),
  );
  assert.ok(mappingQuery);
  assert.match(mappingQuery.sql, /mapping\.merchant_id = \$1/);
  assert.match(mappingQuery.sql, /mapping\.delivery_area_rate_id = \$2/);
  assert.deepEqual(mappingQuery.values, ["merchant-a", "rate-mansour"]);
});

test("covered per-area delivery without a location assignment fails closed", async () => {
  const value = fixture({ mappings: [] });
  const result = await resolveServiceAreaWithTarget(value.target, {
    merchantId: "merchant-a",
    area: "للمنصور",
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "area_not_assigned_to_location");
  assert.equal(result.delivery_area_rate_id, "rate-mansour");
  assert.deepEqual(result.eligible_location_ids, []);
});

test("flat delivery preserves merchant-wide coverage and returns all merchant locations", async () => {
  const value = fixture({
    settings: [
      {
        merchant_id: "merchant-a",
        version: 2,
        delivery_enabled: true,
        delivery_pricing_mode: "flat",
        delivery_fee_iqd: 3_000,
        free_delivery_threshold_iqd: null,
        delivery_estimated_days_min: 1,
        delivery_estimated_days_max: 2,
        delivery_areas: [],
      },
    ],
    rates: [],
  });
  const result = await resolveServiceAreaWithTarget(value.target, {
    merchantId: "merchant-a",
    area: "زيونة",
  });

  assert.equal(result.available, true);
  assert.equal(result.pricing_mode, "flat");
  assert.deepEqual(result.eligible_location_ids, ["location-a", "location-b"]);
  assert.equal(
    value.queries.some((item) =>
      item.sql.includes("FROM merchant_location_delivery_areas"),
    ),
    false,
  );
});

test("delivery policy failure returns no eligible locations without querying mappings", async () => {
  const value = fixture({
    settings: [
      {
        merchant_id: "merchant-a",
        version: 3,
        delivery_enabled: false,
        delivery_pricing_mode: "per_area",
        delivery_fee_iqd: 0,
        free_delivery_threshold_iqd: null,
        delivery_estimated_days_min: 1,
        delivery_estimated_days_max: 3,
        delivery_areas: [],
      },
    ],
  });
  const result = await resolveServiceAreaWithTarget(value.target, {
    merchantId: "merchant-a",
    area: "المنصور",
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "delivery_disabled");
  assert.deepEqual(result.eligible_location_ids, []);
  assert.equal(
    value.queries.some((item) =>
      item.sql.includes("FROM merchant_location_delivery_areas"),
    ),
    false,
  );
});

test("missing settings keep the existing default flat delivery behavior", async () => {
  const value = fixture({ settings: [], rates: [] });
  const result = await resolveServiceAreaWithTarget(value.target, {
    merchantId: "merchant-a",
    area: "اي منطقة",
  });

  assert.equal(result.available, true);
  assert.equal(result.pricing_mode, "flat");
  assert.equal(result.delivery_quote.effective_fee_iqd, 0);
  assert.deepEqual(result.eligible_location_ids, ["location-a", "location-b"]);
});

test("cross-tenant mapping rows are rejected even if the SQL target misbehaves", async () => {
  const value = fixture({
    mappings: [
      {
        merchant_id: "merchant-b",
        location_id: "location-b",
        delivery_area_rate_id: "rate-mansour",
      },
    ],
  });

  await assert.rejects(
    () =>
      resolveServiceAreaWithTarget(value.target, {
        merchantId: "merchant-a",
        area: "المنصور",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ServiceAreaResolverError);
      assert.equal(error.code, "SERVICE_AREA_TENANT_VIOLATION");
      return true;
    },
  );
});
