import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession";
import { CurrencyMoneyError } from "../services/currencyMoneyRuntime";
import { MerchantCurrencyAuthorityError, updateMerchantCurrencyAuthoritative } from "../services/postgresMerchantCurrencyAuthority";
import {
  getMerchantCommerceContextAuthoritative,
  MerchantCommerceContextError,
} from "../services/postgresMerchantRegionalAuthority";

const router = Router();

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (
    error instanceof MerchantCurrencyAuthorityError ||
    error instanceof MerchantCommerceContextError ||
    error instanceof CurrencyMoneyError
  ) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error instanceof MerchantCurrencyAuthorityError && error.details
        ? error.details
        : {}),
      ...(error instanceof CurrencyMoneyError && error.details
        ? error.details
        : {}),
    });
    return;
  }
  console.error("Merchant regional operation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "MERCHANT_REGIONAL_OPERATION_FAILED",
    error: "merchant regional operation failed",
  });
}

router.get(
  "/merchant/regional",
  requireMerchantSession,
  async (_req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const context = await getMerchantCommerceContextAuthoritative(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, context });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/merchant/regional",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const result = await updateMerchantCurrencyAuthoritative({
        merchantId,
        currencyCode: req.body?.currency_code,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, context: result.context, changed: result.changed });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
