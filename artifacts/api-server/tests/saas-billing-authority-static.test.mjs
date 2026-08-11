import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("SaaS billing is structurally separate from merchant customer payments", async () => {
  const schema = await read("../../lib/db/src/schema/saas-billing.ts");
  assert.match(schema, /saas_billing_orders/);
  assert.match(schema, /saas_billing_events/);
  assert.match(schema, /saas_entitlement_applications/);
  assert.match(schema, /saas_billing_refunds/);
  assert.doesNotMatch(schema, /cash_on_delivery/);
  assert.doesNotMatch(schema, /superqi/);
  assert.doesNotMatch(schema, /fastpay/);
  assert.doesNotMatch(schema, /zaincash/);
});

test("merchant checkout never accepts client-supplied amount or paid state", async () => {
  const route = await read("src/routes/saas-billing.ts");
  assert.match(route, /idempotency_key/);
  assert.match(route, /createSaasBillingCheckout/);
  assert.doesNotMatch(route, /req\.body\?\.amount/);
  assert.doesNotMatch(route, /req\.body\?\.paid/);
  assert.doesNotMatch(route, /payment_succeeded/);
});

test("fake provider is test-only and production remains activation-gated", async () => {
  const service = await read("src/services/saasBillingAuthority.ts");
  assert.match(service, /process\.env\.NODE_ENV === "test"/);
  assert.match(service, /production_ready: false/);
  assert.match(service, /SAAS_BILLING_PROVIDER_DISABLED/);
  assert.match(service, /signatureVerified/);
  assert.match(service, /SAAS_BILLING_AMOUNT_MISMATCH/);
  assert.match(service, /paid_reconciliation_required/);
});

test("manual and paid plan cycles share one mutation authority", async () => {
  const entitlement = await read("src/services/postgresSubscriptionEntitlement.ts");
  const shared = await read("src/services/subscriptionPlanCycleAuthority.ts");
  const catalog = await read("src/services/saasPlanCatalog.ts");
  assert.match(entitlement, /applySubscriptionPlanCyclePostgres/);
  assert.doesNotMatch(entitlement, /const PLAN_CONFIG/);
  assert.match(shared, /authority_source/);
  assert.match(shared, /MANUAL_ENTITLEMENT_OVERRIDE/);
  assert.match(shared, /SAAS_BILLING_PAID/);
  assert.match(catalog, /SAAS_PLAN_CATALOG_VERSION/);
});

test("service guarantee recognizes only immutable billing applications", async () => {
  const guarantee = await read("src/services/subscriptionServiceGuarantee.ts");
  assert.match(guarantee, /saas_entitlement_applications/);
  assert.match(guarantee, /application\.applied_at = subscription\.starts_at/);
  assert.match(guarantee, /saas-billing-order:/);
});
