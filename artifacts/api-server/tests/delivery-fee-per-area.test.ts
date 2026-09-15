import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  normalizeDeliveryAreaName,
  resolveDeliveryQuote,
} from "../src/services/deliveryPricing";
import {
  getMerchantDeliveryQuote,
  getMerchantOperationalSettings,
  MerchantSettingsError,
  updateMerchantOperationalSettingsWithEffects,
} from "../src/services/merchantSettingsRuntime";

const basePolicy = {
  merchant_id: "merchant-a",
  settings_version: 3,
  enabled: true,
  pricing_mode: "flat" as const,
  flat_fee_iqd: 5000,
  free_delivery_threshold_iqd: 50000,
  estimated_days_min: 1,
  estimated_days_max: 3,
  areas: [],
  area_rates: [],
};

test("flat delivery stays backward compatible and applies the global free threshold", () => {
  const paid = resolveDeliveryQuote({ policy: basePolicy, area: "Baghdad", subtotal_iqd: 30000 });
  assert.equal(paid.available, true);
  assert.equal(paid.effective_fee_iqd, 5000);
  assert.equal(paid.total_iqd, 35000);

  const free = resolveDeliveryQuote({ policy: basePolicy, area: "Baghdad", subtotal_iqd: 50000 });
  assert.equal(free.free_delivery_applied, true);
  assert.equal(free.effective_fee_iqd, 0);
  assert.equal(free.total_iqd, 50000);
});

test("per-area delivery resolves deterministic normalized areas and fails closed outside coverage", () => {
  const policy = {
    ...basePolicy,
    pricing_mode: "per_area" as const,
    area_rates: [
      {
        id: "mansour",
        area_name: "المنصور",
        normalized_area_name: normalizeDeliveryAreaName("المنصور"),
        fee_iqd: 5000,
        enabled: true,
      },
      {
        id: "karrada",
        area_name: "الكرادة",
        normalized_area_name: normalizeDeliveryAreaName("الكرادة"),
        fee_iqd: 4000,
        enabled: true,
      },
    ],
  };
  const mansour = resolveDeliveryQuote({ policy, area: "بغداد - بالمنصور", subtotal_iqd: 20000 });
  assert.equal(mansour.available, true);
  assert.equal(mansour.area_rate_id, "mansour");
  assert.equal(mansour.effective_fee_iqd, 5000);
  assert.equal(mansour.total_iqd, 25000);

  const missing = resolveDeliveryQuote({ policy, area: "التوصيل", subtotal_iqd: 20000 });
  assert.equal(missing.available, false);
  assert.equal(missing.reason, "area_required");

  const uncovered = resolveDeliveryQuote({ policy, area: "الموصل", subtotal_iqd: 20000 });
  assert.equal(uncovered.available, false);
  assert.equal(uncovered.reason, "area_unavailable");
});

test("runtime preserves legacy settings as flat and server-generates per-area authority", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fawri-delivery-area-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dir;
  try {
    const initial = getMerchantOperationalSettings("merchant-a");
    assert.equal(initial.delivery.pricing_mode, "flat");
    assert.deepEqual(initial.delivery.area_rates, []);

    const updated = updateMerchantOperationalSettingsWithEffects({
      merchantId: "merchant-a",
      expectedVersion: 1,
      patch: {
        delivery: {
          pricing_mode: "per_area",
          area_rates: [
            { area_name: "المنصور", fee_iqd: 5000, enabled: true },
            { area_name: "الكرادة", fee_iqd: 4000, enabled: true },
          ],
          free_delivery_threshold_iqd: 50000,
        },
      },
    }).settings;
    assert.equal(updated.version, 2);
    assert.equal(updated.delivery.pricing_mode, "per_area");
    assert.equal(updated.delivery.areas.length, 0);
    assert.match(updated.delivery.area_rates[0].id, /^delivery-area:/);
    assert.equal(updated.delivery.area_rates[0].normalized_area_name, normalizeDeliveryAreaName("المنصور"));

    const quote = getMerchantDeliveryQuote({ merchantId: "merchant-a", area: "للمنصور", subtotalIqd: 10000 });
    assert.equal(quote.available, true);
    assert.equal(quote.effective_fee_iqd, 5000);

    assert.throws(
      () => updateMerchantOperationalSettingsWithEffects({
        merchantId: "merchant-a",
        expectedVersion: 2,
        patch: {
          delivery: {
            pricing_mode: "per_area",
            area_rates: [
              { area_name: "المنصور", fee_iqd: 1 },
              { area_name: "ألمنصور", fee_iqd: 2 },
            ],
          },
        },
      }),
      (error: unknown) => error instanceof MerchantSettingsError && error.code === "MERCHANT_DELIVERY_AREA_DUPLICATE",
    );

    assert.throws(
      () => updateMerchantOperationalSettingsWithEffects({
        merchantId: "merchant-a",
        expectedVersion: 2,
        patch: {
          delivery: {
            pricing_mode: "per_area",
            area_rates: [{ area_name: "زيونة" }],
          },
        },
      }),
      (error: unknown) => error instanceof MerchantSettingsError && error.code === "MERCHANT_DELIVERY_AREA_RATE_INVALID",
    );
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
