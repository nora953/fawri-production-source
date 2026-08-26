import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  getMerchantIdFromSecureSession,
  requireSecureMerchantSession,
} from "../middleware/authSession";
import {
  getCashierOperatorContext,
  getCashierStationContext,
  requireCashierOperatorSession,
  requireCashierStationCredential,
} from "../middleware/cashierStaffSession";
import {
  CashierStaffAuthorityError,
  beginCashierStationPairingAuthoritative,
  createCashierStaffAuthoritative,
  createCashierStationAuthoritative,
  listCashierStaffAuthoritative,
  listCashierStationsAuthoritative,
  loginCashierOperatorAuthoritative,
  logoutCashierOperatorAuthoritative,
  redeemCashierStationPairingAuthoritative,
  updateCashierStaffAuthoritative,
  updateCashierStationAuthoritative,
} from "../services/postgresCashierStaffAuthority";
import { buildCashierCentralReportAuthoritative } from "../services/postgresCashierCentralReportAuthority";

const router = Router();

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof CashierStaffAuthorityError) {
    if (error.status === 429 && error.details?.retry_after_seconds) {
      res.setHeader("Retry-After", String(error.details.retry_after_seconds));
    }
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }
  console.error("Cashier staff operation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "CASHIER_STAFF_OPERATION_FAILED",
    error: "cashier staff operation failed",
  });
}

function requireMerchantAuthority(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (getAuthContext(res)?.merchantProfile) {
    next();
    return;
  }
  void requireSecureMerchantSession(req, res, next);
}

function merchantId(res: Response): string {
  return getMerchantIdFromSecureSession(res);
}

router.get(
  "/cashier/management/report",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const report = await buildCashierCentralReportAuthoritative({
        merchantId: merchantId(res),
        from: req.query.from,
        to: req.query.to,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...report });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/management/staff",
  requireMerchantAuthority,
  async (_req: Request, res: Response) => {
    try {
      const staff = await listCashierStaffAuthoritative(merchantId(res));
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, staff });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/management/staff",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const staff = await createCashierStaffAuthoritative({
        merchantId: merchantId(res),
        displayName: req.body?.display_name,
        role: req.body?.role,
        pin: req.body?.pin,
        permissions: req.body?.permissions,
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ ok: true, staff });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/cashier/management/staff/:staffId",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const staff = await updateCashierStaffAuthoritative({
        merchantId: merchantId(res),
        staffId: req.params.staffId,
        expectedVersion: req.body?.expected_version,
        displayName: req.body?.display_name,
        role: req.body?.role,
        status: req.body?.status,
        pin: req.body?.pin,
        permissions: req.body?.permissions,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, staff });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/management/stations",
  requireMerchantAuthority,
  async (_req: Request, res: Response) => {
    try {
      const stations = await listCashierStationsAuthoritative(merchantId(res));
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, stations });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/management/stations",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const station = await createCashierStationAuthoritative({
        merchantId: merchantId(res),
        name: req.body?.name,
        branchKey: req.body?.branch_key,
        branchLabel: req.body?.branch_label,
        offlineInventoryAuthority: req.body?.offline_inventory_authority,
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ ok: true, station });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/cashier/management/stations/:stationId",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const station = await updateCashierStationAuthoritative({
        merchantId: merchantId(res),
        stationId: req.params.stationId,
        name: req.body?.name,
        branchKey: req.body?.branch_key,
        branchLabel: req.body?.branch_label,
        status: req.body?.status,
        offlineInventoryAuthority: req.body?.offline_inventory_authority,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, station });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/management/stations/:stationId/pairing",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const pairing = await beginCashierStationPairingAuthoritative({
        merchantId: merchantId(res),
        stationId: req.params.stationId,
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ ok: true, ...pairing });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/station/pair",
  async (req: Request, res: Response) => {
    try {
      const paired = await redeemCashierStationPairingAuthoritative({
        pairingCode: req.body?.pairing_code,
        deviceId: req.body?.device_id,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...paired });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/station/me",
  requireCashierStationCredential,
  (_req: Request, res: Response) => {
    const station = getCashierStationContext(res);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, station });
  },
);

router.get(
  "/cashier/station/staff",
  requireCashierStationCredential,
  async (_req: Request, res: Response) => {
    try {
      const station = getCashierStationContext(res);
      if (!station) {
        throw new CashierStaffAuthorityError(
          "CASHIER_STATION_CREDENTIAL_INVALID",
          "cashier station credential is unavailable",
          401,
        );
      }
      const staff = (await listCashierStaffAuthoritative(station.merchant_id))
        .filter((member) => member.status === "active")
        .map((member) => ({
          id: member.id,
          display_name: member.display_name,
          role: member.role,
        }));
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, staff });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/operator/login",
  requireCashierStationCredential,
  async (req: Request, res: Response) => {
    try {
      const station = getCashierStationContext(res);
      if (!station) {
        throw new CashierStaffAuthorityError(
          "CASHIER_STATION_CREDENTIAL_INVALID",
          "cashier station credential is unavailable",
          401,
        );
      }
      const result = await loginCashierOperatorAuthoritative({
        station,
        staffId: req.body?.staff_id,
        pin: req.body?.pin,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/operator/me",
  requireCashierOperatorSession(),
  (_req: Request, res: Response) => {
    const operator = getCashierOperatorContext(res);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, operator });
  },
);

router.post(
  "/cashier/operator/logout",
  requireCashierOperatorSession(),
  async (_req: Request, res: Response) => {
    try {
      const operator = getCashierOperatorContext(res);
      if (!operator) {
        throw new CashierStaffAuthorityError(
          "CASHIER_OPERATOR_SESSION_INVALID",
          "cashier operator session is unavailable",
          401,
        );
      }
      await logoutCashierOperatorAuthoritative(operator);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
