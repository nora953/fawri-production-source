#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content): p(rel).write_text(content, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel)
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{rel}: expected {count}, found {actual}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))

# Area rates are children of the settings authority itself, not merely of a merchant.
replace(
    "lib/db/src/schema/merchant-settings.ts",
    '''    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    areaName: text("area_name").notNull(),''',
    '''    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchantSettings.merchantId, { onDelete: "cascade" }),
    areaName: text("area_name").notNull(),''',
)

# A missing fee must never be silently interpreted as zero.
replace(
    "artifacts/api-server/src/services/merchantSettingsRuntime.ts",
    '''    seen.add(normalized);
    result.push({
      id: deliveryRateId(merchantId, normalized),
      area_name: areaName,
      normalized_area_name: normalized,
      fee_iqd: nonNegativeInteger(record.fee_iqd, 0),
      enabled,
    });''',
    '''    if (record.fee_iqd === undefined) {
      throw new MerchantSettingsError(
        "MERCHANT_DELIVERY_AREA_RATE_INVALID",
        "delivery area rate fee is required",
        400,
      );
    }
    seen.add(normalized);
    result.push({
      id: deliveryRateId(merchantId, normalized),
      area_name: areaName,
      normalized_area_name: normalized,
      fee_iqd: nonNegativeInteger(record.fee_iqd, 0),
      enabled,
    });''',
)

# Runtime coverage for the missing-fee fail-closed rule.
replace(
    "artifacts/api-server/tests/delivery-fee-per-area.test.ts",
    '''    assert.throws(
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
    );''',
    '''    assert.throws(
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
    );''',
)

# Migration contract must encode the settings-parent FK rather than a merchant-only FK.
replace(
    "scripts/tests/delivery-fee-per-area-migration-history.test.mjs",
    '''  assert.match(sql, /CREATE POLICY "merchant_delivery_area_rates_tenant_boundary"/);
  assert.match(sql, /ADD COLUMN "delivery_pricing_mode"/);''',
    '''  assert.match(sql, /CREATE POLICY "merchant_delivery_area_rates_tenant_boundary"/);
  assert.match(
    sql,
    /merchant_delivery_area_rates_merchant_id_merchant_settings_merchant_id_fk|REFERENCES "merchant_settings"\("merchant_id"\)/,
  );
  assert.match(sql, /ADD COLUMN "delivery_pricing_mode"/);''',
)

print("patch 5 complete")
