export type SaasPaidPlan = "silver" | "gold" | "diamond";

export type SaasPlanCatalogEntry = {
  plan: SaasPaidPlan;
  monthly_price_iqd: number;
  base_reply_limit: number;
  emergency_credit_amount: number;
  billing_period_months: 1;
};

export const SAAS_PLAN_CATALOG_VERSION = "2026-08-v1";

const PLAN_CATALOG: Record<SaasPaidPlan, SaasPlanCatalogEntry> = {
  silver: {
    plan: "silver",
    monthly_price_iqd: 25_000,
    base_reply_limit: 4_000,
    emergency_credit_amount: 400,
    billing_period_months: 1,
  },
  gold: {
    plan: "gold",
    monthly_price_iqd: 49_000,
    base_reply_limit: 8_000,
    emergency_credit_amount: 800,
    billing_period_months: 1,
  },
  diamond: {
    plan: "diamond",
    monthly_price_iqd: 75_000,
    base_reply_limit: 14_000,
    emergency_credit_amount: 1_400,
    billing_period_months: 1,
  },
};

export function isSaasPaidPlan(value: unknown): value is SaasPaidPlan {
  return value === "silver" || value === "gold" || value === "diamond";
}

export function getSaasPlan(plan: SaasPaidPlan): SaasPlanCatalogEntry {
  return { ...PLAN_CATALOG[plan] };
}

export function listSaasPlans(): SaasPlanCatalogEntry[] {
  return (["silver", "gold", "diamond"] as const).map((plan) =>
    getSaasPlan(plan),
  );
}
