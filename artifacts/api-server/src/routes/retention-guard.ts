import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import merchantSettingsRouter from "./merchant-settings";
import { getMerchantRetentionAccess } from "../services/merchantRetentionPolicy";

const router = Router();

function blockReadOnlyProductWrites(
  _req: Request,
  res: Response,
  next: () => void,
): void {
  const merchantId = getMerchantIdFromSession(res);
  const access = getMerchantRetentionAccess(merchantId);

  if (access.productsReadOnly) {
    res.status(423).json({
      ok: false,
      error: "products are read-only after three calendar months without renewal",
      code: "PRODUCTS_READ_ONLY",
      retention_status: access.retentionStatus,
    });
    return;
  }

  next();
}

router.use(merchantSettingsRouter);

router.post(
  "/products",
  requireMerchantSession,
  blockReadOnlyProductWrites,
);

router.post(
  "/bot/products/sync",
  requireMerchantSession,
  blockReadOnlyProductWrites,
);

export default router;
