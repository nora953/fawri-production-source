import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  getAuthContext,
  requireSecureMerchantSession,
} from "../middleware/authSession";
import merchantSettingsRouter from "./merchant-settings";
import { getMerchantRetentionAccess } from "../services/merchantRetentionPolicy";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import { getMerchantRetentionAccessPostgres } from "../services/postgresMerchantRetentionAuthority";

const router = Router();

function requireRetentionMerchantSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (operationalPostgresAuthorityRequired()) {
    void requireSecureMerchantSession(req, res, next);
    return;
  }
  requireMerchantSession(req, res, next);
}

async function blockReadOnlyProductWrites(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const access = operationalPostgresAuthorityRequired()
      ? await getMerchantRetentionAccessPostgres(
          getAuthContext(res)?.merchantProfile?.merchantId || "",
        )
      : getMerchantRetentionAccess(getMerchantIdFromSession(res));

    if (!access) {
      res.status(401).json({
        ok: false,
        error: "merchant account is unavailable",
        code: "MERCHANT_ACCOUNT_UNAVAILABLE",
      });
      return;
    }

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
  } catch (error) {
    console.error("Retention product-write guard failed:", error);
    res.status(503).json({
      ok: false,
      error: "merchant retention authority is unavailable",
      code: "RETENTION_AUTHORITY_UNAVAILABLE",
    });
  }
}

router.use(merchantSettingsRouter);

router.post(
  "/products",
  requireRetentionMerchantSession,
  blockReadOnlyProductWrites,
);

router.post(
  "/bot/products/sync",
  requireRetentionMerchantSession,
  blockReadOnlyProductWrites,
);

export default router;