import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  CashierSyncError,
  syncCashierSaleAuthoritative,
} from "../services/postgresCashierSyncAuthority";
import { syncCashierCompensationAuthoritative } from "../services/postgresCashierCompensationSyncAuthority";

const router = Router();

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof CashierSyncError) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }
  console.error("Cashier sync operation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "CASHIER_SYNC_FAILED",
    error: "cashier sync failed",
  });
}

router.post(
  "/cashier/sync/sale",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const result = await syncCashierSaleAuthoritative({
        merchantId,
        body: req.body,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/sync/compensation",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const result = await syncCashierCompensationAuthoritative({
        merchantId,
        body: req.body,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
