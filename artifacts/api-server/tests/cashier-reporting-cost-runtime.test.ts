import assert from "node:assert/strict";
import test from "node:test";

import { validateCashierSaleSyncBundle } from "../src/services/postgresCashierSyncAuthority";

const occurredAt = "2026-08-25T10:00:00.000Z";

function saleBundle(unitCostMinor?: unknown) {
  const line = {
    line_id: "line-1",
    product_id: "product-1",
    product_name_snapshot: "Test product",
    quantity: 2,
    base_unit_price_minor: 1_000,
    effective_unit_price_minor: 1_000,
    discount_minor: 0,
    line_total_minor: 2_000,
    ...(unitCostMinor !== undefined ? { unit_cost_minor: unitCostMinor } : {}),
  };
  const sale = {
    sale_id: "sale-1",
    operation_id: "operation-1",
    local_merchant_id: "local-merchant-1",
    cloud_merchant_id: "merchant-1",
    device_id: "device-1",
    device_sequence: 1,
    source: "cashier",
    status: "completed",
    lines: [line],
    subtotal_minor: 2_000,
    discount_minor: 0,
    total_minor: 2_000,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    payment_method: "cash",
    payment_status: "paid",
    occurred_at: occurredAt,
  };
  return {
    cloud_merchant_id: "merchant-1",
    local_merchant_id: "local-merchant-1",
    device_id: "device-1",
    device_sequence: 1,
    operation_id: "operation-1",
    envelopes: [
      {
        schema_version: 1,
        operation_id: "operation-1",
        device_id: "device-1",
        device_sequence: 1,
        entity_type: "sale",
        entity_id: "sale-1",
        operation: "append",
        occurred_at: occurredAt,
        payload: sale,
      },
    ],
  };
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string })?.code;
}

test("cashier sale sync preserves an explicit reporting cost snapshot", () => {
  const validated = validateCashierSaleSyncBundle(saleBundle(650));
  assert.equal(validated.sale.lines[0].unit_cost_minor, 650);
});

test("cashier sale sync preserves zero cost instead of treating it as missing", () => {
  const validated = validateCashierSaleSyncBundle(saleBundle(0));
  assert.equal(validated.sale.lines[0].unit_cost_minor, 0);
});

test("cashier sale sync leaves cost absent when the merchant did not provide it", () => {
  const validated = validateCashierSaleSyncBundle(saleBundle());
  assert.equal(validated.sale.lines[0].unit_cost_minor, undefined);
});

test("cashier sale sync rejects negative reporting cost", () => {
  assert.throws(
    () => validateCashierSaleSyncBundle(saleBundle(-1)),
    error => errorCode(error) === "CASHIER_SYNC_INVALID",
  );
});

test("cashier sale sync rejects fractional reporting cost", () => {
  assert.throws(
    () => validateCashierSaleSyncBundle(saleBundle(1.5)),
    error => errorCode(error) === "CASHIER_SYNC_INVALID",
  );
});

test("cashier sale sync rejects unsafe reporting cost integers", () => {
  assert.throws(
    () => validateCashierSaleSyncBundle(saleBundle(Number.MAX_SAFE_INTEGER + 1)),
    error => errorCode(error) === "CASHIER_SYNC_INVALID",
  );
});
