import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../lib/db/drizzle/0006_saas_billing_authority.sql", import.meta.url);

test("0006 SaaS billing migration is additive and tenant-scoped", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of [
    "saas_billing_orders",
    "saas_billing_events",
    "saas_entitlement_applications",
    "saas_billing_refunds",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /saas_billing_orders_tenant_boundary/);
  assert.match(sql, /saas_entitlement_applications_order_unique/);
  assert.match(sql, /saas_billing_events_provider_event_unique/);
  assert.match(sql, /paid_reconciliation_required/);

  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    assert.doesNotMatch(statement, /^(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\b/i);
  }
  assert.doesNotMatch(sql, /cash_on_delivery/);
  assert.doesNotMatch(sql, /superqi/);
  assert.doesNotMatch(sql, /fastpay/);
  assert.doesNotMatch(sql, /zaincash/);
});
