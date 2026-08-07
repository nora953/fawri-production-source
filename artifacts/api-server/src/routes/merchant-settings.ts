import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession";
import {
  getMerchantOperationalSettings,
  MerchantSettingsError,
  updateMerchantOperationalSettingsWithEffects,
} from "../services/merchantSettingsRuntime";

const router = Router();

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof MerchantSettingsError) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }
  console.error("Merchant settings operation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "MERCHANT_SETTINGS_OPERATION_FAILED",
    error: "merchant settings operation failed",
  });
}

router.get("/settings", requireMerchantSession, (_req: Request, res: Response) => {
  try {
    const merchantId = getMerchantIdFromSession(res);
    const settings = getMerchantOperationalSettings(merchantId);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, settings });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch(
  "/settings",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const result = updateMerchantOperationalSettingsWithEffects({
        merchantId,
        expectedVersion: req.body?.expected_version,
        patch: req.body?.settings,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, settings: result.settings, effects: result.effects });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
