#!/usr/bin/env python3
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = "ca583e8d43042c2d4c489f2bc0e3c038c451ce2e"

def path(rel): return ROOT / rel
def read(rel): return path(rel).read_text(encoding="utf-8")
def write(rel, value): path(rel).write_text(value, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel)
    found = text.count(old)
    if found < count:
        raise SystemExit(f"{rel}: expected {count}, found {found}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))

def golden(rel):
    return subprocess.check_output(
        ["git", "show", f"{GOLDEN}:{rel}"], cwd=ROOT
    ).decode("utf-8")

# Canonical 0006 preimage: the new schema file did not exist, while index and
# tenant-security are captured exactly from the Golden coordinator.
preimage = path("lib/db/migration-stages/0006/preimage")
preimage.mkdir(parents=True, exist_ok=True)
(preimage / "saas-billing.ts").write_text(
    "// saas-billing authority did not exist before migration 0006.\n",
    encoding="utf-8",
)
(preimage / "index.ts").write_text(golden("lib/db/src/schema/index.ts"), encoding="utf-8")
(preimage / "tenant-security.ts").write_text(
    golden("lib/db/src/schema/tenant-security.ts"), encoding="utf-8"
)

replace(
    "lib/db/src/schema/index.ts",
    'export * from "./subscriptions";\n',
    'export * from "./subscriptions";\nexport * from "./saas-billing";\n',
)
replace(
    "lib/db/src/schema/tenant-security.ts",
    'import { replyLedger, subscriptionReplyBatches, subscriptions } from "./subscriptions";\n',
    'import { replyLedger, subscriptionReplyBatches, subscriptions } from "./subscriptions";\nimport { saasBillingEvents, saasBillingOrders, saasBillingRefunds, saasEntitlementApplications } from "./saas-billing";\n',
)
replace(
    "lib/db/src/schema/tenant-security.ts",
    'export const replyLedgerTenantPolicy = tenantPolicy("reply_ledger_tenant_boundary", replyLedger);\n',
    'export const replyLedgerTenantPolicy = tenantPolicy("reply_ledger_tenant_boundary", replyLedger);\nexport const saasBillingOrdersTenantPolicy = tenantPolicy("saas_billing_orders_tenant_boundary", saasBillingOrders);\nexport const saasBillingEventsTenantPolicy = tenantPolicy("saas_billing_events_tenant_boundary", saasBillingEvents);\nexport const saasEntitlementApplicationsTenantPolicy = tenantPolicy("saas_entitlement_applications_tenant_boundary", saasEntitlementApplications);\nexport const saasBillingRefundsTenantPolicy = tenantPolicy("saas_billing_refunds_tenant_boundary", saasBillingRefunds);\n',
)
replace(
    "lib/db/src/schema/saas-billing.ts",
    "sql`${table.status} IN ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded')`,",
    "sql`${table.status} IN ('pending', 'paid', 'paid_reconciliation_required', 'failed', 'cancelled', 'expired', 'refunded')`,",
)
replace(
    "artifacts/api-server/src/services/saasBillingAuthority.ts",
    "if (input.amountIqd > order.amount_iqd) {\n        fail(\"SAAS_BILLING_REFUND_AMOUNT_INVALID\", \"refund exceeds paid order amount\", 409);",
    "if (input.amountIqd !== order.amount_iqd) {\n        fail(\"SAAS_BILLING_REFUND_AMOUNT_INVALID\", \"V1 requires a full-cycle refund matching the paid order amount\", 409);",
)

# Manual admin plan changes and paid billing applications must share one cycle
# mutation implementation. Remove the duplicated price/limit authority.
service = "artifacts/api-server/src/services/postgresSubscriptionEntitlement.ts"
text = read(service)
text = text.replace(
    'import crypto from "node:crypto";\n',
    'import crypto from "node:crypto";\nimport {\n  applySubscriptionPlanCyclePostgres,\n  SubscriptionPlanCycleError,\n} from "./subscriptionPlanCycleAuthority";\n',
    1,
)
plan_start = text.index("const PLAN_CONFIG: Record<")
plan_end = text.index("const BAGHDAD_UTC_OFFSET_MS", plan_start)
text = text[:plan_start] + text[plan_end:]
func_start = text.index("export async function applySubscriptionPlanOperationPostgres(input: {")
next_func = text.index("export async function applySubscriptionActionPostgres(input: {", func_start)
replacement = '''export async function applySubscriptionPlanOperationPostgres(input: {
  merchantId: string;
  actorAccountId: string;
  operation: SubscriptionPlanOperation;
  plan: PaidSubscriptionPlan;
  now?: Date;
}): Promise<SubscriptionApiRecord> {
  const merchantId = requiredText(input.merchantId, 160);
  try {
    await applySubscriptionPlanCyclePostgres({
      merchantId,
      actorAccountId: input.actorAccountId,
      operation: input.operation,
      plan: input.plan,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof SubscriptionPlanCycleError) {
      throw new SubscriptionEntitlementAuthorityError(
        error.code,
        error.message,
        error.status,
        error.details,
      );
    }
    throw error;
  }
  const current = await getCurrentSubscriptionPostgres(merchantId, input.now || new Date());
  if (!current) fail("SUBSCRIPTION_NOT_FOUND", "subscription not found", 404);
  return current;
}

'''
text = text[:func_start] + replacement + text[next_func:]
write(service, text)

# Billing is paid only when the current subscription cycle has an immutable
# entitlement application tied to exactly this starts_at timestamp.
guarantee = "artifacts/api-server/src/services/subscriptionServiceGuarantee.ts"
replace(
    guarantee,
    '''`SELECT id, merchant_id, plan_name, status, price_iqd,
              starts_at, expires_at, version
       FROM subscriptions
       WHERE merchant_id = $1 AND id = $2
       LIMIT 2`,''',
    '''`SELECT subscription.id, subscription.merchant_id, subscription.plan_name,
              subscription.status, subscription.price_iqd, subscription.starts_at,
              subscription.expires_at, subscription.version,
              billing_order.id AS billing_order_id
       FROM subscriptions AS subscription
       LEFT JOIN saas_entitlement_applications AS application
         ON application.subscription_id = subscription.id
        AND application.merchant_id = subscription.merchant_id
        AND application.applied_at = subscription.starts_at
       LEFT JOIN saas_billing_orders AS billing_order
         ON billing_order.id = application.order_id
        AND billing_order.merchant_id = application.merchant_id
        AND billing_order.status IN ('paid', 'refunded')
       WHERE subscription.merchant_id = $1 AND subscription.id = $2
       LIMIT 2`,''',
)
replace(
    guarantee,
    '''    const billingState: SubscriptionGuaranteeBillingState =
      planName === "trial" || priceIqd === 0 ? "unpaid" : "unknown";

    return {''',
    '''    const billingOrderId = row.billing_order_id
      ? rowString(row, "billing_order_id", 180)
      : null;
    const billingState: SubscriptionGuaranteeBillingState =
      planName === "trial" || priceIqd === 0
        ? "unpaid"
        : billingOrderId
          ? "paid"
          : "unknown";

    return {''',
)
replace(
    guarantee,
    '''      billingState,
      billingReference: null,
''',
    '''      billingState,
      billingReference: billingOrderId ? `saas-billing-order:${billingOrderId}` : null,
''',
)

print("SaaS billing integration patch applied")
