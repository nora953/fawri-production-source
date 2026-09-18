import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCashierLocationForBranch,
} from "../src/services/cashierLocationBindingAuthority";
import type {
  OperationalQueryResult,
  OperationalQueryTarget,
} from "../src/services/operationalPostgresAuthority";

type LocationRow = {
  id: string;
  merchant_id: string;
  name: string;
  legacy_branch_key: string | null;
  is_default: boolean;
  online_fulfillment_enabled: boolean;
};

class FakeTarget implements OperationalQueryTarget {
  readonly locations: LocationRow[] = [];
  readonly insertOnlineFlags: boolean[] = [];

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<OperationalQueryResult<T>> {
    if (
      sql.includes("FROM merchant_locations") &&
      sql.includes("is_default = TRUE")
    ) {
      const merchantId = String(values[0]);
      return {
        rows: this.locations
          .filter(
            (row) => row.merchant_id === merchantId && row.is_default === true,
          )
          .slice(0, 1) as unknown as T[],
      };
    }

    if (
      sql.includes("FROM merchant_locations") &&
      sql.includes("legacy_branch_key = $2")
    ) {
      const merchantId = String(values[0]);
      const branchKey = String(values[1]);
      return {
        rows: this.locations
          .filter(
            (row) =>
              row.merchant_id === merchantId &&
              row.legacy_branch_key === branchKey,
          )
          .slice(0, 1) as unknown as T[],
      };
    }

    if (sql.includes("INSERT INTO merchant_locations")) {
      const [
        id,
        merchantId,
        name,
        branchKey,
        isDefault,
        onlineFulfillmentEnabled,
      ] = values;
      this.insertOnlineFlags.push(Boolean(onlineFulfillmentEnabled));
      const conflict = this.locations.some(
        (row) =>
          row.merchant_id === String(merchantId) &&
          (row.legacy_branch_key === String(branchKey) ||
            (Boolean(isDefault) && row.is_default)),
      );
      if (!conflict) {
        this.locations.push({
          id: String(id),
          merchant_id: String(merchantId),
          name: String(name),
          legacy_branch_key: String(branchKey),
          is_default: Boolean(isDefault),
          online_fulfillment_enabled: Boolean(onlineFulfillmentEnabled),
        });
      }
      return { rows: [] };
    }

    if (
      sql.includes("UPDATE merchant_locations") &&
      sql.includes("legacy_branch_key = 'main'")
    ) {
      const merchantId = String(values[0]);
      const locationId = String(values[1]);
      const location = this.locations.find(
        (row) => row.merchant_id === merchantId && row.id === locationId,
      );
      if (location) location.legacy_branch_key = "main";
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in fake location target: ${sql}`);
  }
}

test("main branch reuses the merchant default location and repairs its legacy alias", async () => {
  const target = new FakeTarget();
  target.locations.push({
    id: "location_default",
    merchant_id: "merchant_1",
    name: "Main Store",
    legacy_branch_key: null,
    is_default: true,
    online_fulfillment_enabled: true,
  });

  const resolved = await resolveCashierLocationForBranch(target, {
    merchantId: "merchant_1",
    branchKey: "main",
    branchLabel: "Main",
  });

  assert.equal(resolved.id, "location_default");
  assert.equal(resolved.legacy_branch_key, "main");
  assert.equal(target.locations.length, 1);
  assert.deepEqual(target.insertOnlineFlags, []);
});

test("new non-main branch creates one stable location with online fulfillment disabled", async () => {
  const target = new FakeTarget();

  const first = await resolveCashierLocationForBranch(target, {
    merchantId: "merchant_2",
    branchKey: "karrada",
    branchLabel: "Karrada",
  });
  const second = await resolveCashierLocationForBranch(target, {
    merchantId: "merchant_2",
    branchKey: "karrada",
    branchLabel: "Changed display label",
  });

  assert.equal(first.id, second.id);
  assert.equal(first.legacy_branch_key, "karrada");
  assert.equal(target.locations.length, 1);
  assert.equal(target.locations[0].name, "Karrada");
  assert.equal(target.locations[0].is_default, false);
  assert.equal(target.locations[0].online_fulfillment_enabled, false);
  assert.deepEqual(target.insertOnlineFlags, [false]);
});

test("merchant created after migration can lazily receive one default location", async () => {
  const target = new FakeTarget();

  const first = await resolveCashierLocationForBranch(target, {
    merchantId: "merchant_new",
    branchKey: "main",
  });
  const second = await resolveCashierLocationForBranch(target, {
    merchantId: "merchant_new",
    branchKey: "main",
  });

  assert.equal(first.id, second.id);
  assert.equal(first.is_default, true);
  assert.equal(first.legacy_branch_key, "main");
  assert.equal(target.locations.length, 1);
  assert.equal(target.locations[0].online_fulfillment_enabled, true);
  assert.deepEqual(target.insertOnlineFlags, [true]);
});
