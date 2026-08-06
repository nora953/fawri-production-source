import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  getMerchantOperationalSettings,
  MerchantSettingsError,
  updateMerchantOperationalSettings,
} from "../services/merchantSettingsRuntime";

const router = Router();

function sendError(res: Response, error: unknown): void {
  if (error instanceof MerchantSettingsError) {
    res.setHeader("Cache-Control", "no-store");
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }
  console.error("Merchant settings operation failed:", error);
  res.setHeader("Cache-Control", "no-store");
  res.status(500).json({
    ok: false,
    code: "MERCHANT_SETTINGS_OPERATION_FAILED",
    error: "merchant settings operation failed",
  });
}

router.get(
  "/settings",
  requireMerchantSession,
  (_req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const settings = getMerchantOperationalSettings(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, settings });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/settings",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const settings = updateMerchantOperationalSettings({
        merchantId,
        expectedVersion: req.body?.expected_version,
        patch: req.body?.settings,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, settings });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
