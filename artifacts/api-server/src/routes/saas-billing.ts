import { Router, type Response } from "express";
import {
  getAuthContext,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import {
  createSaasBillingCheckout,
  getSaasBillingCatalog,
  listMerchantSaasBillingOrders,
  SaasBillingAuthorityError,
} from "../services/saasBillingAuthority";
import { isSaasPaidPlan } from "../services/saasPlanCatalog";
import type { SubscriptionPlanCycleOperation } from "../services/subscriptionPlanCycleAuthority";

const router = Router();

function merchantId(res: Response): string {
  return getAuthContext(res)?.merchantProfile?.merchantId || "";
}

function authorityError(res: Response, error: unknown): void {
  if (error instanceof SaasBillingAuthorityError) {
    sendAuthError(res, error.status, error.code, error.message, error.details || {});
    return;
  }
  sendAuthError(
    res,
    503,
    "SAAS_BILLING_UNAVAILABLE",
    "SaaS billing authority is unavailable",
  );
}

router.get("/billing/catalog", requireSecureMerchantSession, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, ...getSaasBillingCatalog() });
});

router.get("/billing/orders", requireSecureMerchantSession, async (_req, res) => {
  try {
    const orders = await listMerchantSaasBillingOrders(merchantId(res));
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, orders });
  } catch (error) {
    authorityError(res, error);
  }
});

router.post("/billing/checkout", requireSecureMerchantSession, async (req, res) => {
  const operation = String(req.body?.operation || "").trim() as SubscriptionPlanCycleOperation;
  const plan = String(req.body?.plan || "").trim();
  const idempotencyKey = String(req.body?.idempotency_key || "").trim();

  if (!(["activate", "renew", "change"] as string[]).includes(operation)) {
    sendAuthError(res, 400, "INVALID_SUBSCRIPTION_OPERATION", "invalid subscription operation");
    return;
  }
  if (!isSaasPaidPlan(plan)) {
    sendAuthError(res, 400, "INVALID_SUBSCRIPTION_PLAN", "invalid paid subscription plan");
    return;
  }
  if (!idempotencyKey || idempotencyKey.length > 200) {
    sendAuthError(res, 400, "SAAS_BILLING_IDEMPOTENCY_REQUIRED", "billing idempotency key is required");
    return;
  }

  try {
    const result = await createSaasBillingCheckout({
      merchantId: merchantId(res),
      operation,
      plan,
      idempotencyKey,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    authorityError(res, error);
  }
});

export default router;
