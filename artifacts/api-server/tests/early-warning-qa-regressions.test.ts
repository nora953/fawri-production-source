import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMerchantEarlyWarnings,
  operationalMerchantHealthRows,
} from "../src/observability/earlyWarningMerchantEvaluation";
import type { EarlyWarningMerchantHealth } from "../src/services/earlyWarningPostgresAuthority";
import { earlyWarningCoverageNote } from "../../fawri/src/lib/earlyWarningCoverageCopy";

function merchant(
  overrides: Partial<EarlyWarningMerchantHealth> = {},
): EarlyWarningMerchantHealth {
  return {
    merchant_id: "merchant-active",
    store_name: "Active Store",
    merchant_status: "approved",
    account_status: "approved",
    health: "warning",
    connected_channels: 0,
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

test("merchant health hides non-operational deleted rows and explains disconnected active merchants", () => {
  const active = merchant();
  const deleted = merchant({
    merchant_id: "merchant-deleted",
    store_name: "[deleted merchant]",
    merchant_status: "suspended",
    account_status: "suspended",
    health: "unknown",
  });

  const visible = operationalMerchantHealthRows([active, deleted]);
  assert.deepEqual(visible.map((item) => item.merchant_id), ["merchant-active"]);

  const incidents = evaluateMerchantEarlyWarnings(visible);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0]?.code, "MERCHANT_NO_CONNECTED_CHANNEL");
  assert.equal(incidents[0]?.value, 1);
});

test("merchant channel warning clears when active merchants have a connected channel", () => {
  const active = merchant({ connected_channels: 1, health: "healthy" });
  assert.equal(evaluateMerchantEarlyWarnings([active]).length, 0);
});

test("coverage notes are localized with a safe server-note fallback", () => {
  const serverNote = "hosting-provider bandwidth authority is not connected";
  assert.equal(
    earlyWarningCoverageNote("ar", "network_transfer", serverNote),
    "مرجع الباندويث من مزود الاستضافة غير مربوط.",
  );
  assert.notEqual(
    earlyWarningCoverageNote("ku", "network_transfer", serverNote),
    serverNote,
  );
  assert.equal(
    earlyWarningCoverageNote("en", "network_transfer", serverNote),
    "Hosting-provider bandwidth authority is not connected.",
  );
  assert.equal(
    earlyWarningCoverageNote("ar", "future_coverage_id", serverNote),
    serverNote,
  );
});
