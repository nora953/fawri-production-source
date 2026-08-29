import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  listMerchantNotificationsPostgresCanonical,
  markMerchantNotificationReadPostgresCanonical,
  MerchantNotificationPostgresError,
} from "../services/postgresMerchantNotificationAuthority";

const router = Router();

function postgresOnly(_req: Request, _res: Response, next: NextFunction): void {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
}

function merchantId(res: Response): string {
  return getAuthContext(res)?.merchantProfile?.merchantId || "";
}

function authorityError(res: Response, error: unknown): void {
  if (error instanceof MerchantNotificationPostgresError) {
    sendAuthError(res, error.statusCode, error.code, error.message);
    return;
  }
  console.error("PostgreSQL merchant notification authority failed:", error);
  sendAuthError(
    res,
    503,
    "MERCHANT_NOTIFICATION_AUTHORITY_UNAVAILABLE",
    "merchant notification authority is unavailable",
  );
}

router.use(postgresOnly);

router.get(
  "/notifications",
  requireSecureMerchantSession,
  async (req: Request, res: Response) => {
    const unreadOnly = String(req.query.unread || "") === "1";
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(50, requestedLimit))
      : 20;
    try {
      const notifications = await listMerchantNotificationsPostgresCanonical({
        merchantId: merchantId(res),
        unreadOnly,
        limit,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, notifications });
    } catch (error) {
      authorityError(res, error);
    }
  },
);

router.patch(
  "/notifications/:id/read",
  requireSecureMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const notification = await markMerchantNotificationReadPostgresCanonical({
        merchantId: merchantId(res),
        notificationId: String(req.params.id || "").trim(),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, notification });
    } catch (error) {
      authorityError(res, error);
    }
  },
);

export default router;
