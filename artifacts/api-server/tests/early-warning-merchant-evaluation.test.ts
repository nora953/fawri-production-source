import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMerchantEarlyWarnings,
  operationalMerchantHealthRows,
} from "../src/observability/earlyWarningMerchantEvaluation";
import type { EarlyWarningMerchantHealth } from "../src/services/earlyWarningPostgresAuthority";

function merchant(overrides: Partial<EarlyWarningMerchantHealth> = {}): EarlyWarningMerchantHealth {
  return {
    merchant_id: "merchant-1",
    store_name: "Store One",
    merchant_status: "approved",
    account_status: "approved",
    health: "healthy",
    connected_channels: 1,
    recent_channel_errors: 0,
    messages: 0,
    failed_messages: 0,
    jobs: 0,
    failed_jobs: 0,
    dead_letter_jobs: 0,
    uncertain_deliveries: 0,
    refund_conflicts: 0,
    open_support_tickets: 0,
    ai_recorded_tokens: 0,
    ...overrides,
  };
}

test("merchant early warnings are scoped to the affected merchant", () => {
  const incidents = evaluateMerchantEarlyWarnings([
    merchant({ connected_channels: 0, recent_channel_errors: 2 }),
    merchant({ merchant_id: "merchant-2", store_name: "Store Two" }),
  ]);

  assert.equal(incidents.length, 2);
  assert.deepEqual(
    incidents.map((incident) => ({
      id: incident.id,
      code: incident.code,
      scope: incident.scope,
      merchant_id: incident.merchant_id,
      merchant_name: incident.merchant_name,
    })),
    [
      {
        id: "merchant-no-connected-channel:merchant-1",
        code: "MERCHANT_NO_CONNECTED_CHANNEL",
        scope: "merchant",
        merchant_id: "merchant-1",
        merchant_name: "Store One",
      },
      {
        id: "merchant-channel-errors:merchant-1",
        code: "CHANNEL_RECENT_ERRORS",
        scope: "merchant",
        merchant_id: "merchant-1",
        merchant_name: "Store One",
      },
    ],
  );
});

test("critical merchant conditions retain critical severity", () => {
  const incidents = evaluateMerchantEarlyWarnings([
    merchant({ dead_letter_jobs: 1, uncertain_deliveries: 2, refund_conflicts: 1 }),
  ]);

  assert.equal(incidents.length, 3);
  assert.ok(incidents.every((incident) => incident.severity === "critical"));
  assert.deepEqual(
    incidents.map((incident) => incident.code),
    ["DLQ_NONZERO", "OUTBOUND_DELIVERY_UNCERTAIN", "REPLY_REFUND_CONFLICT"],
  );
});

test("non-operational merchants do not create merchant alerts", () => {
  const rows = [
    merchant({ merchant_status: "suspended", connected_channels: 0 }),
    merchant({ merchant_id: "merchant-2", account_status: "pending_review", connected_channels: 0 }),
  ];

  assert.equal(operationalMerchantHealthRows(rows).length, 0);
  assert.deepEqual(evaluateMerchantEarlyWarnings(rows), []);
});
