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
const DEFAULT_ADMIN_SUBSCRIPTION_SSE_REVALIDATE_MS = 30_000;
const ADMIN_SUBSCRIPTION_SNAPSHOT_INTERVAL_MS = 5_000;
const ADMIN_SUBSCRIPTION_HEARTBEAT_MS = 15_000;

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

function adminSubscriptionSseRevalidateMs(): number {
  const configured = Number(process.env.FAWRI_AUTH_SSE_REVALIDATE_MS);
  if (!Number.isFinite(configured)) {
    return DEFAULT_ADMIN_SUBSCRIPTION_SSE_REVALIDATE_MS;
  }
  return Math.max(5_000, Math.min(60_000, Math.trunc(configured)));
}

function writeSseEvent(
  res: Response,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  if (res.writableEnded) return;
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === "function") flush.call(res);
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

router.get(
  "/admin/subscriptions/events",
  requireSecureAdminPermission("manage_subscriptions"),
  async (req, res) => {
    let subscriptions;
    try {
      subscriptions = await listSubscriptionsPostgres();
    } catch (error) {
      authorityError(res, error);
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true);

    let closed = false;
    let refreshInFlight = false;
    let snapshotInterval: NodeJS.Timeout | undefined;
    let heartbeatInterval: NodeJS.Timeout | undefined;
    let revalidateTimeout: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (snapshotInterval) clearInterval(snapshotInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (revalidateTimeout) clearTimeout(revalidateTimeout);
      if (!res.writableEnded) res.end();
    };

    writeSseEvent(res, "snapshot", { subscriptions });

    snapshotInterval = setInterval(() => {
      if (closed || res.writableEnded || refreshInFlight) return;
      refreshInFlight = true;
      void listSubscriptionsPostgres()
        .then((nextSubscriptions) => {
          if (!closed && !res.writableEnded) {
            writeSseEvent(res, "snapshot", { subscriptions: nextSubscriptions });
          }
        })
        .catch(() => {
          if (!closed && !res.writableEnded) {
            writeSseEvent(res, "authority_unavailable", {
              code: "SUBSCRIPTION_ENTITLEMENT_UNAVAILABLE",
            });
          }
          cleanup();
        })
        .finally(() => {
          refreshInFlight = false;
        });
    }, ADMIN_SUBSCRIPTION_SNAPSHOT_INTERVAL_MS);
    snapshotInterval.unref();

    heartbeatInterval = setInterval(() => {
      if (closed || res.writableEnded) return;
      try {
        res.write(": heartbeat\n\n");
        const flush = (res as Response & { flush?: () => void }).flush;
        if (typeof flush === "function") flush.call(res);
      } catch {
        cleanup();
      }
    }, ADMIN_SUBSCRIPTION_HEARTBEAT_MS);
    heartbeatInterval.unref();

    revalidateTimeout = setTimeout(cleanup, adminSubscriptionSseRevalidateMs());
    revalidateTimeout.unref();

    req.once("close", cleanup);
    res.once("close", cleanup);
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
