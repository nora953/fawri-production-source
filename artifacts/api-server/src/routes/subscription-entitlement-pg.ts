import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminPermission,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import {
  activateEmergencyCreditPostgres,
  applySubscriptionActionPostgres,
  applySubscriptionPlanOperationPostgres,
  getCurrentSubscriptionPostgres,
  listSubscriptionsPostgres,
  subscriptionPostgresAuthorityRequired,
  SubscriptionEntitlementAuthorityError,
  type PaidSubscriptionPlan,
  type SubscriptionAction,
  type SubscriptionPlanOperation,
} from "../services/postgresSubscriptionEntitlement";

const router = Router();

function postgresOnly(_req: Request, _res: Response, next: NextFunction): void {
  if (!subscriptionPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
}

function authorityError(res: Response, error: unknown): void {
  if (error instanceof SubscriptionEntitlementAuthorityError) {
    sendAuthError(res, error.status, error.code, error.message, error.details || {});
    return;
  }
  sendAuthError(
    res,
    503,
    "SUBSCRIPTION_ENTITLEMENT_UNAVAILABLE",
    "subscription entitlement authority is unavailable",
  );
}

function merchantId(res: Response): string {
  return getAuthContext(res)?.merchantProfile?.merchantId || "";
}

function actorId(res: Response): string {
  return getAuthContext(res)?.account.id || "";
}

router.use(postgresOnly);

router.get(
  "/subscription/current",
  requireSecureMerchantSession,
  async (_req, res) => {
    try {
      const subscription = await getCurrentSubscriptionPostgres(merchantId(res));
      if (!subscription) {
        sendAuthError(res, 404, "SUBSCRIPTION_NOT_FOUND", "subscription not found");
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, subscription });
    } catch (error) {
      authorityError(res, error);
    }
  },
);

router.post(
  "/subscription/emergency",
  requireSecureMerchantSession,
  async (_req, res) => {
    try {
      const subscription = await activateEmergencyCreditPostgres(
        merchantId(res),
        actorId(res),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, subscription });
    } catch (error) {
      authorityError(res, error);
    }
  },
);

router.get(
  "/admin/subscriptions",
  requireSecureAdminPermission("manage_subscriptions"),
  async (_req, res) => {
    try {
      const subscriptions = await listSubscriptionsPostgres();
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, subscriptions });
    } catch (error) {
      authorityError(res, error);
    }
  },
);

router.post(
  "/admin/subscriptions/migrate",
  requireSecureAdminPermission("manage_subscriptions"),
  (_req, res) => {
    sendAuthError(
      res,
      410,
      "LEGACY_SUBSCRIPTION_MIGRATION_ENDPOINT_DISABLED",
      "file-backed subscription migration is disabled after PostgreSQL entitlement cutover",
    );
  },
);

router.put(
  "/merchants/:id/subscription",
  requireSecureAdminPermission("manage_subscriptions"),
  async (req, res) => {
    const operation = String(req.body?.operation || "").trim() as SubscriptionPlanOperation;
    const plan = String(req.body?.plan || "").trim() as PaidSubscriptionPlan;
    if (!(["activate", "change", "renew"] as string[]).includes(operation)) {
      sendAuthError(res, 400, "INVALID_SUBSCRIPTION_OPERATION", "invalid subscription operation");
      return;
    }
    if (!(["silver", "gold", "diamond"] as string[]).includes(plan)) {
      sendAuthError(res, 400, "INVALID_SUBSCRIPTION_PLAN", "invalid paid subscription plan");
      return;
    }
    try {
      const subscription = await applySubscriptionPlanOperationPostgres({
        merchantId: String(req.params.id || "").trim(),
        actorAccountId: actorId(res),
        operation,
        plan,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, subscription });
    } catch (error) {
      authorityError(res, error);
    }
  },
);

router.patch(
  "/merchants/:id/subscription",
  requireSecureAdminPermission("manage_subscriptions"),
  async (req, res) => {
    const action = String(req.body?.action || "").trim() as SubscriptionAction;
    if (!(["add_replies", "deduct_replies", "reset_replies", "set_auto_reply"] as string[]).includes(action)) {
      sendAuthError(res, 400, "INVALID_SUBSCRIPTION_ACTION", "invalid subscription action");
      return;
    }
    try {
      const subscription = await applySubscriptionActionPostgres({
        merchantId: String(req.params.id || "").trim(),
        actorAccountId: actorId(res),
        action,
        ...(req.body?.amount !== undefined ? { amount: Number(req.body.amount) } : {}),
        ...(req.body?.enabled !== undefined ? { enabled: req.body.enabled } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, subscription });
    } catch (error) {
      authorityError(res, error);
    }
  },
);

export default router;
