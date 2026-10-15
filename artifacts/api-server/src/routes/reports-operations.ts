import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  buildOnlineOrderReportAuthoritative,
  OnlineOrderReportError,
} from "../services/postgresOnlineOrderReportAuthority";

const router = Router();

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof OnlineOrderReportError) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
    });
    return;
  }
  console.error("Online report operation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "ONLINE_REPORT_OPERATION_FAILED",
    error: "online report operation failed",
  });
}

router.get(
  "/reports/online",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const report = await buildOnlineOrderReportAuthoritative({
        merchantId,
        from: req.query.from,
        to: req.query.to,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, report });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
