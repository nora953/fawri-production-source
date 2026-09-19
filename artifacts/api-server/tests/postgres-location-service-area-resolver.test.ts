import assert from "node:assert/strict";
import test from "node:test";

import {
  LocationServiceAreaResolverError,
  resolveLocationServiceAreaWithTarget,
} from "../src/services/postgresLocationServiceAreaResolver";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function fakeTarget(params?: {
  settings?: Record<string, unknown>;
  rates?: Record<string, unknown>[];
  mappings?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
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
              version: 4,
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
          rows: (params?.rates || [
            {
              id: "rate-mansour",
              merchant_id: "merchant-a",
              area_name: "المنصور",
              normalized_area_name: normalizeDeliveryAreaName("المنصور"),
              fee_iqd: 5000,
              enabled: true,
            },
            {
              id: "rate-karrada",
              merchant_id: "merchant-a",
              area_name: "الكرادة",
              normalized_area_name: normalizeDeliveryAreaName("الكرادة"),
              fee_iqd: 4000,
              enabled: true,
            },
          ]) as T[],
        };
      }

      if (sql.includes("FROM merchant_location_delivery_areas")) {
        return {
          rows: (params?.mappings || [
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
          rows: (params?.locations || [
            { id: "location-a", merchant_id: "merchant-a" },
          ]) as T[],
        };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return { target, queries };
}

test("per-area resolver reuses canonical delivery area matching and returns mapped locations", async () => {
  const fixture = fakeTarget();
  const result = await resolveLocationServiceAreaWithTarget(fixture.target, {
    merchantId: "merchant-a",
    area: "بغداد - بالمنصور",
  });

  assert.deepEqual(result, {
    status: "resolved",
    area_rate_id: "rate-mansour",
    matched_area: "المنصور",
    eligible_location_ids: ["location-a", "location-b"],
  });

  const mappingQuery = fixture.queries.find((query) =>
    query.sql.includes("FROM merchant_location_delivery_areas"),
  );
  assert.ok(mappingQuery);
  assert.deepEqual(mappingQuery?.values, ["merchant-a", "rate-mansour"]);
});

test("unmapped canonical area fails closed instead of routing to every location", async () => {
  const fixture = fakeTarget({ mappings: [] });
  const result = await resolveLocationServiceAreaWithTarget(fixture.target, {
    merchantId: "merchant-a",
    area: "المنصور",
  });

  assert.deepEqual(result, {
    status: "unavailable",
    reason: "area_location_mapping_missing",
  });
});

test("unknown and ambiguous area results remain fail-closed delivery outcomes", async () => {
  const unknown = await resolveLocationServiceAreaWithTarget(fakeTarget().target, {
    merchantId: "merchant-a",
    area: "الموصل",
  });
  assert.deepEqual(unknown, {
    status: "unavailable",
    reason: "area_unavailable",
  });

  const ambiguousFixture = fakeTarget({
    rates: [
      {
        id: "rate-a",
        merchant_id: "merchant-a",
        area_name: "حي الجامعة",
        normalized_area_name: normalizeDeliveryAreaName("حي الجامعة"),
        fee_iqd: 1000,
        enabled: true,
      },
      {
        id: "rate-b",
        merchant_id: "merchant-a",
        area_name: "الجامعة",
        normalized_area_name: normalizeDeliveryAreaName("الجامعة"),
        fee_iqd: 1000,
        enabled: true,
      },
    ],
  });
  const ambiguous = await resolveLocationServiceAreaWithTarget(
    ambiguousFixture.target,
    {
      merchantId: "merchant-a",
      area: "حي الجامعة",
    },
  );
  assert.deepEqual(ambiguous, {
    status: "unavailable",
    reason: "area_ambiguous",
  });
});

test("flat delivery is safe only for exactly one merchant location", async () => {
  const single = fakeTarget({
    settings: { delivery_pricing_mode: "flat", delivery_fee_iqd: 3000 },
    rates: [],
    locations: [{ id: "location-only", merchant_id: "merchant-a" }],
  });
  const singleResult = await resolveLocationServiceAreaWithTarget(single.target, {
    merchantId: "merchant-a",
    area: "أي مكان",
  });
  assert.deepEqual(singleResult, {
    status: "resolved",
    eligible_location_ids: ["location-only"],
  });

  const multi = fakeTarget({
    settings: { delivery_pricing_mode: "flat", delivery_fee_iqd: 3000 },
    rates: [],
    locations: [
      { id: "location-a", merchant_id: "merchant-a" },
      { id: "location-b", merchant_id: "merchant-a" },
    ],
  });
  const multiResult = await resolveLocationServiceAreaWithTarget(multi.target, {
    merchantId: "merchant-a",
    area: "أي مكان",
  });
  assert.deepEqual(multiResult, {
    status: "unavailable",
    reason: "flat_multi_location_mapping_required",
  });
});

test("resolver rejects cross-tenant mapping rows returned by a bad adapter", async () => {
  const fixture = fakeTarget({
    mappings: [
      {
        merchant_id: "merchant-b",
        location_id: "location-bad",
        delivery_area_rate_id: "rate-mansour",
      },
    ],
  });

  await assert.rejects(
    () =>
      resolveLocationServiceAreaWithTarget(fixture.target, {
        merchantId: "merchant-a",
        area: "المنصور",
      }),
    (error: unknown) => {
      assert.ok(error instanceof LocationServiceAreaResolverError);
      assert.equal(error.code, "LOCATION_SERVICE_AREA_TENANT_VIOLATION");
      return true;
    },
  );
});

test("resolver rejects cross-tenant delivery-area rows", async () => {
  const fixture = fakeTarget({
    rates: [
      {
        id: "rate-mansour",
        merchant_id: "merchant-b",
        area_name: "المنصور",
        normalized_area_name: normalizeDeliveryAreaName("المنصور"),
        fee_iqd: 5000,
        enabled: true,
      },
    ],
  });

  await assert.rejects(
    () =>
      resolveLocationServiceAreaWithTarget(fixture.target, {
        merchantId: "merchant-a",
        area: "المنصور",
      }),
    (error: unknown) => {
      assert.ok(error instanceof LocationServiceAreaResolverError);
      assert.equal(error.code, "LOCATION_SERVICE_AREA_TENANT_VIOLATION");
      return true;
    },
  );
});
