import assert from "node:assert/strict";
import test from "node:test";

import { PROVIDER_COST_METER_CATALOG } from "../src/services/providerCostAuthority";

test("provider cost catalog has unique, explicit meters", () => {
  const keys = PROVIDER_COST_METER_CATALOG.map((meter) => meter.meter_key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(
    PROVIDER_COST_METER_CATALOG
      .filter((meter) => meter.usage_authority === "connected")
      .map((meter) => meter.report_component)
      .sort(),
    ["ai_input", "ai_output", "outbound_messages", "support_storage"].sort(),
  );
});

test("future provider costs are modeled without pretending usage is connected", () => {
  const disconnected = new Set(
    PROVIDER_COST_METER_CATALOG
      .filter((meter) => meter.usage_authority === "not_connected")
      .map((meter) => meter.meter_key),
  );
  for (const required of [
    "otp_message",
    "meta_whatsapp_marketing_message",
    "meta_whatsapp_utility_message",
    "meta_whatsapp_authentication_message",
    "database_storage_gb_month",
    "network_egress_gb",
    "object_storage_gb_month",
    "email_message",
    "external_api_1000_requests",
  ]) {
    assert.equal(disconnected.has(required), true, `${required} must remain not_connected until a real usage authority exists`);
  }
});

test("provider-specific message meters cannot double count generic outbound usage", () => {
  const byKey = new Map(PROVIDER_COST_METER_CATALOG.map((meter) => [meter.meter_key, meter]));
  assert.equal(byKey.get("outbound_messages_per_1000")?.usage_authority, "connected");
  assert.equal(byKey.get("outbound_messages_per_1000")?.report_component, "outbound_messages");

  for (const meterKey of [
    "otp_message",
    "meta_whatsapp_marketing_message",
    "meta_whatsapp_utility_message",
    "meta_whatsapp_authentication_message",
    "email_message",
  ]) {
    const meter = byKey.get(meterKey);
    assert.equal(meter?.usage_authority, "not_connected", `${meterKey} must not be counted before its dedicated usage connector is authoritative`);
    assert.equal(meter?.report_component, null, `${meterKey} must not share the generic outbound report component`);
  }
});

test("provider cost units preserve provider billing semantics", () => {
  const byKey = new Map(PROVIDER_COST_METER_CATALOG.map((meter) => [meter.meter_key, meter.unit_code]));
  assert.equal(byKey.get("ai_input_tokens_per_1m"), "usd_per_1m_tokens");
  assert.equal(byKey.get("outbound_messages_per_1000"), "usd_per_1000_messages");
  assert.equal(byKey.get("support_storage_gb_month"), "usd_per_gb_month");
  assert.equal(byKey.get("meta_whatsapp_marketing_message"), "usd_per_delivered_message");
  assert.equal(byKey.get("otp_message"), "usd_per_message");
});
