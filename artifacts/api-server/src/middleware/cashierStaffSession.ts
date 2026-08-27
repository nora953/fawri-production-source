import type { NextFunction, Request, Response } from "express";
import {
  CashierStaffAuthorityError,
  authenticateCashierOperatorAuthoritative,
  authenticateCashierStationAuthoritative,
  type CashierOperatorContext,
  type CashierStationContext,
} from "../services/postgresCashierStaffAuthority";
import type { CashierStaffPermission } from "../services/cashierStaffPolicy";

export const CASHIER_STATION_TOKEN_HEADER = "x-fawri-cashier-station-token";
export const CASHIER_OPERATOR_TOKEN_HEADER = "x-fawri-cashier-operator-token";
export const CASHIER_DEVICE_ID_HEADER = "x-fawri-cashier-device-id";

type CashierResponse = Response & {
  locals: Response["locals"] & {
    cashierStation?: CashierStationContext;
    cashierOperator?: CashierOperatorContext;
  };
};

function header(req: Request, name: string): string {
  return String(req.headers[name] || "").trim();
}

export function cashierStationToken(req: Request): string {
  return header(req, CASHIER_STATION_TOKEN_HEADER);
}

export function cashierOperatorToken(req: Request): string {
  return header(req, CASHIER_OPERATOR_TOKEN_HEADER);
}

export function cashierDeviceId(req: Request): string {
  return header(req, CASHIER_DEVICE_ID_HEADER);
}

export function getCashierStationContext(res: Response): CashierStationContext | null {
  return (res as CashierResponse).locals.cashierStation || null;
}

export function getCashierOperatorContext(res: Response): CashierOperatorContext | null {
  return (res as CashierResponse).locals.cashierOperator || null;
}

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
  console.error("Cashier staff authentication failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "CASHIER_AUTH_FAILED",
    error: "cashier authentication failed",
  });
}

export async function requireCashierStationCredential(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const context = await authenticateCashierStationAuthoritative({
      stationToken: cashierStationToken(req),
      deviceId: cashierDeviceId(req),
    });
    (res as CashierResponse).locals.cashierStation = context;
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch (error) {
    sendError(res, error);
  }
}

export function requireCashierOperatorSession(
  requiredPermission?: CashierStaffPermission,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const context = await authenticateCashierOperatorAuthoritative({
        stationToken: cashierStationToken(req),
        operatorToken: cashierOperatorToken(req),
        deviceId: cashierDeviceId(req),
        ...(requiredPermission ? { requiredPermission } : {}),
      });
      (res as CashierResponse).locals.cashierOperator = context;
      (res as CashierResponse).locals.cashierStation = context;
      res.setHeader("Cache-Control", "no-store");
      next();
    } catch (error) {
      sendError(res, error);
    }
  };
}
