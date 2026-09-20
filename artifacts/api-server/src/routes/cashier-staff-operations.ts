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
  listCashierLocationsAuthoritative,
  listCashierStaffAuthoritative,
  listCashierStationsAuthoritative,
  loginCashierOperatorAuthoritative,
  redeemCashierStationPairingAuthoritative,
  updateCashierStaffAuthoritative,
  updateCashierStationAuthoritative,
  type CashierStaffView,
} from "../services/postgresCashierStaffAuthority";
import { logoutCashierOperatorWithPinAuthoritative } from "../services/cashierOperatorShiftCloseAuthority";
import { buildCashierCentralReportAuthoritative } from "../services/postgresCashierCentralReportAuthority";
import {
  listCashierStationConfigurationsAuthoritative,
  updateCashierStationConfigurationAuthoritative,
} from "../services/cashierStationConfigurationAuthority";
import { buildCashierCentralActivityAuthoritative } from "../services/postgresCashierCentralActivityAuthority";
import { enforceCashierDiscountOverrideRoleInvariant } from "../services/cashierStaffDiscountRoleHardening";

const router = Router();

function mapCashierRuntimeUniqueConflict(
  error: unknown,
): CashierStaffAuthorityError | null {
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (String(candidate?.code || "") !== "23505") return null;
  const constraint = String(candidate?.constraint || "");
  if (constraint.includes("cashier_shifts_open_station_unique")) {
    return new CashierStaffAuthorityError(
      "CASHIER_STATION_SHIFT_OCCUPIED",
      "cashier station has an open shift for another operator",
      409,
    );
  }
  if (constraint.includes("cashier_shifts_open_staff_unique")) {
    return new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SHIFT_OCCUPIED",
      "cashier operator already has an open shift on another station",
      409,
    );
  }
  if (constraint.includes("cashier_operator_sessions_live_station_unique")) {
    return new CashierStaffAuthorityError(
      "CASHIER_STATION_IN_USE",
      "cashier station already has an active operator",
      409,
    );
  }
  return null;
}

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  const mapped =
    error instanceof CashierStaffAuthorityError
      ? error
      : mapCashierRuntimeUniqueConflict(error);
  if (mapped) {
    if (mapped.status === 429 && mapped.details?.retry_after_seconds) {
      res.setHeader("Retry-After", String(mapped.details.retry_after_seconds));
    }
    res.status(mapped.status).json({
      ok: false,
      code: mapped.code,
      error: mapped.message,
      ...(mapped.details || {}),
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

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_INPUT_INVALID",
      `${field} must be a boolean`,
      400,
      { field },
    );
  }
  return value;
}

async function hardenDiscountOverrideRole(
  merchant: string,
  staff: CashierStaffView,
): Promise<CashierStaffView> {
  if (staff.role === "manager") return staff;
  const changed = await enforceCashierDiscountOverrideRoleInvariant({
    merchantId: merchant,
    staffId: staff.id,
  });
  if (!changed) return staff;
  return {
    ...staff,
    permissions: staff.permissions.filter(
      (permission) => permission !== "sale.discount_override",
    ),
  };
}

router.get(
  "/cashier/management/report",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const rangeInput = {
        merchantId: merchantId(res),
        from: req.query.from,
        to: req.query.to,
      };
      const [report, activity] = await Promise.all([
        buildCashierCentralReportAuthoritative(rangeInput),
        buildCashierCentralActivityAuthoritative({
          ...rangeInput,
          detailStaffId: req.query.detail_staff_id,
          detailLocationId: req.query.detail_location_id,
          detailStationId: req.query.detail_station_id,
          detailOperationKind: req.query.detail_operation_kind,
        }),
      ]);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...report, activity });
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
      const merchant = merchantId(res);
      const created = await createCashierStaffAuthoritative({
        merchantId: merchant,
        displayName: req.body?.display_name,
        role: req.body?.role,
        pin: req.body?.pin,
        permissions: req.body?.permissions,
      });
      const staff = await hardenDiscountOverrideRole(merchant, created);
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
      const merchant = merchantId(res);
      const updated = await updateCashierStaffAuthoritative({
        merchantId: merchant,
        staffId: req.params.staffId,
        expectedVersion: req.body?.expected_version,
        displayName: req.body?.display_name,
        role: req.body?.role,
        status: req.body?.status,
        pin: req.body?.pin,
        permissions: req.body?.permissions,
      });
      const staff = await hardenDiscountOverrideRole(merchant, updated);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, staff });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/management/locations",
  requireMerchantAuthority,
  async (_req: Request, res: Response) => {
    try {
      const locations = await listCashierLocationsAuthoritative(merchantId(res));
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, locations });
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
      const stations = await listCashierStationConfigurationsAuthoritative(
        merchantId(res),
      );
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
        locationId: req.body?.location_id,
        branchKey: req.body?.branch_key,
        branchLabel: req.body?.branch_label,
        offlineInventoryAuthority: optionalBoolean(
          req.body?.offline_inventory_authority,
          "offline_inventory_authority",
        ),
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ ok: true, station });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/cashier/management/stations/:stationId/configuration",
  requireMerchantAuthority,
  async (req: Request, res: Response) => {
    try {
      const station = await updateCashierStationConfigurationAuthoritative({
        merchantId: merchantId(res),
        stationId: req.params.stationId,
        expectedConfigurationEtag: req.body?.expected_configuration_etag,
        name: req.body?.name,
        branchKey: req.body?.branch_key,
        branchLabel: req.body?.branch_label,
        offlineInventoryAuthority: optionalBoolean(
          req.body?.offline_inventory_authority,
          "offline_inventory_authority",
        ),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, station });
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
      const configurationPatchPresent =
        req.body?.name !== undefined ||
        req.body?.branch_key !== undefined ||
        req.body?.branch_label !== undefined ||
        req.body?.offline_inventory_authority !== undefined;
      if (configurationPatchPresent) {
        throw new CashierStaffAuthorityError(
          "CASHIER_STATION_CONFIGURATION_ETAG_REQUIRED",
          "cashier station configuration must be changed through the versioned configuration endpoint",
          409,
        );
      }
      const station = await updateCashierStationAuthoritative({
        merchantId: merchantId(res),
        stationId: req.params.stationId,
        status: req.body?.status,
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
  async (req: Request, res: Response) => {
    try {
      const operator = getCashierOperatorContext(res);
      if (!operator) {
        throw new CashierStaffAuthorityError(
          "CASHIER_OPERATOR_SESSION_INVALID",
          "cashier operator session is unavailable",
          401,
        );
      }
      await logoutCashierOperatorWithPinAuthoritative({
        context: operator,
        pin: req.body?.pin,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
