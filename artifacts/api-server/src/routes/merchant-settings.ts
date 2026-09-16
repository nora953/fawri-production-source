import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession";
import { MerchantSettingsError } from "../services/merchantSettingsRuntime";
import {
  getMerchantOperationalSettingsAuthoritative,
  updateMerchantOperationalSettingsAuthoritative,
} from "../services/postgresMerchantSettingsAuthority";

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

router.get(
  "/settings",
  requireMerchantSession,
  async (_req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const settings = await getMerchantOperationalSettingsAuthoritative(
        merchantId,
      );
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
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const result = await updateMerchantOperationalSettingsAuthoritative({
        merchantId,
        expectedVersion: req.body?.expected_version,
        patch: req.body?.settings,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        settings: result.settings,
        effects: result.effects,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
