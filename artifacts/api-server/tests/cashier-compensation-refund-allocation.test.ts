import assert from "node:assert/strict";
import test from "node:test";

import { validateCashierCompensationSyncBundle } from "../src/services/postgresCashierCompensationSyncAuthority.ts";

const occurredAt = "2026-09-19T11:00:00.000Z";

function returnBundle(input: {
  allocationVersion?: 2;
  refundMinor: number;
}) {
  const operationId = "return-operation-v2";
  const returnId = "return:return-operation-v2";
  const payload = {
    ...(input.allocationVersion
      ? { refund_allocation_version: input.allocationVersion }
      : {}),
    return_id: returnId,
    operation_id: operationId,
    sale_id: "sale-1",
    local_merchant_id: "local-merchant",
    cloud_merchant_id: "merchant-1",
    device_id: "device-1",
    device_sequence: 2,
    lines: [
      {
        original_line_id: "line-1",
        product_id: "product-1",
        quantity: 1,
        effective_unit_price_minor: 100,
        refund_minor: input.refundMinor,
      },
    ],
    refund_total_minor: input.refundMinor,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    occurred_at: occurredAt,
  };

  return {
    cloud_merchant_id: "merchant-1",
    local_merchant_id: "local-merchant",
    device_id: "device-1",
    device_sequence: 2,
    operation_id: operationId,
    envelopes: [
      {
        schema_version: 1,
        operation_id: operationId,
        device_id: "device-1",
        device_sequence: 2,
        entity_type: "return",
        entity_id: returnId,
        operation: "append",
        occurred_at: occurredAt,
        payload,
      },
    ],
  };
}

test("v2 return bundle accepts charged-value refund that differs from pre-manual-discount unit price", () => {
  const bundle = validateCashierCompensationSyncBundle(
    returnBundle({ allocationVersion: 2, refundMinor: 90 }),
  );

  assert.equal(bundle.kind, "return");
  assert.equal(bundle.returnSnapshot?.refund_allocation_version, 2);
  assert.equal(bundle.returnSnapshot?.refund_total_minor, 90);
});

test("legacy return bundle still requires effective unit price times quantity", () => {
  assert.throws(
    () =>
      validateCashierCompensationSyncBundle(
        returnBundle({ refundMinor: 90 }),
      ),
    (error: unknown) =>
      (error as { code?: string }).code === "CASHIER_SYNC_INVALID",
  );

  const legacy = validateCashierCompensationSyncBundle(
    returnBundle({ refundMinor: 100 }),
  );
  assert.equal(legacy.returnSnapshot?.refund_allocation_version, undefined);
  assert.equal(legacy.returnSnapshot?.refund_total_minor, 100);
});
