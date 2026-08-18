import assert from "node:assert/strict";
import test from "node:test";

import {
  earlyWarningCoverageLabel,
  earlyWarningIncidentAreaLabel,
  earlyWarningIncidentLabel,
} from "../src/lib/earlyWarningCoverageCopy.ts";

const languages = ["ar", "ku", "en"] as const;
const coverageIds = [
  "postgresql",
  "queue",
  "channels",
  "bot_guardrails",
  "ai_tokens",
  "http_latency",
  "database_storage",
  "network_transfer",
  "durable_object_storage",
] as const;
const incidentCodes = [
  "DLQ_NONZERO",
  "OUTBOUND_DELIVERY_UNCERTAIN",
  "OUTBOUND_DELIVERY_STUCK",
  "REPLY_REFUND_CONFLICT",
  "REPLY_RESERVATION_STALE",
  "DANGEROUS_GUARDRAIL_EVENT",
  "CHANNEL_RECENT_ERRORS",
  "MESSAGE_FAILURES",
  "HTTP_5XX_RATE_HIGH",
  "HTTP_P95_LATENCY_HIGH",
  "AI_PROVIDER_ERROR_RATE_HIGH",
  "AI_PROVIDER_LATENCY_HIGH",
  "AI_PROVIDER_TIMEOUTS",
  "HTTP_TELEMETRY_CAP_REACHED",
  "AI_TELEMETRY_CAP_REACHED",
  "MERCHANT_NO_CONNECTED_CHANNEL",
] as const;
const incidentAreas = [
  "queue",
  "channels",
  "credits",
  "bot_guardrails",
  "messaging",
  "merchant_channels",
  "http",
  "ai",
  "observability",
] as const;

test("known Early Warning technical identifiers have user-facing labels in every supported language", () => {
  for (const language of languages) {
    for (const id of coverageIds) {
      const label = earlyWarningCoverageLabel(language, id);
      assert.ok(label.trim());
      assert.notEqual(label, id);
    }

    for (const code of incidentCodes) {
      const label = earlyWarningIncidentLabel(language, code);
      assert.ok(label.trim());
      assert.notEqual(label, code);
    }

    for (const area of incidentAreas) {
      const label = earlyWarningIncidentAreaLabel(language, area);
      assert.ok(label.trim());
      assert.notEqual(label, area);
    }
  }
});

test("current disconnected-merchant warning is readable in Arabic", () => {
  assert.equal(
    earlyWarningIncidentLabel("ar", "MERCHANT_NO_CONNECTED_CHANNEL"),
    "يوجد تاجر فعّال بلا قناة متصلة",
  );
  assert.equal(earlyWarningIncidentAreaLabel("ar", "merchant_channels"), "قنوات التجار");
});

test("unknown technical identifiers fail to generic user-facing copy instead of leaking raw ids", () => {
  for (const language of languages) {
    assert.notEqual(earlyWarningCoverageLabel(language, "future_metric_id"), "future_metric_id");
    assert.notEqual(earlyWarningIncidentLabel(language, "FUTURE_INCIDENT_CODE"), "FUTURE_INCIDENT_CODE");
    assert.notEqual(earlyWarningIncidentAreaLabel(language, "future_area"), "future_area");
  }
});
