import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import cashierStaffOperationsRouter from "./cashier-staff-operations";
import cashierOperatorCommerceRouter from "./cashier-operator-commerce";
import {
  CashierSyncError,
  syncCashierSaleAuthoritative,
} from "../services/postgresCashierSyncAuthority";
import { syncCashierCompensationAuthoritative } from "../services/postgresCashierCompensationSyncAuthority";
import { reconcileCashierRuntimeExpirationsAuthoritative } from "../services/cashierRuntimeExpiryReconciliation";

const router = Router();

async function reconcileCashierRuntime(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!String(req.path || "").startsWith("/cashier/")) {
    next();
    return;
  }
  try {
    await reconcileCashierRuntimeExpirationsAuthoritative();
    next();
  } catch (error) {
    console.error("Cashier runtime expiry reconciliation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      ok: false,
      code: "CASHIER_RUNTIME_RECONCILIATION_FAILED",
      error: "cashier runtime authority is unavailable",
    });
  }
}

// Every cashier request first materializes time-derived expiry states. This
// keeps persisted lifecycle status aligned with the authorization predicates
// without closing business shifts or mutating commerce data.
router.use(reconcileCashierRuntime);

// Compose station/operator management and the permission-bound operator commerce
// authority with the existing merchant-session sync routes. The old sync routes
// remain only as a compatibility bridge until the cashier client finishes 3B.
router.use(cashierStaffOperationsRouter);
router.use(cashierOperatorCommerceRouter);

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
