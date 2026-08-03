import fs from "node:fs";
import { getFawriDataFilePath } from "../lib/dataPaths";
import type { NextFunction, Request, Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../routes/auth";
import { getMerchantRetentionAccess } from "../services/merchantRetentionPolicy";

const MERCHANT_SESSION_COOKIE = "fawri_merchant_session";

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

function isRetentionSuspendedPhone(phone: string): boolean {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return false;

  const dbPath = getFawriDataFilePath("merchants.json");
  if (!fs.existsSync(dbPath)) return false;

  try {
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      merchants?: Array<{
        phone?: string;
        is_admin?: boolean;
        status?: string;
        retention_suspended_at?: string;
      }>;
    };

    const merchant = db.merchants?.find(
      (item) =>
        item.is_admin !== true &&
        normalizePhone(item.phone) === normalizedPhone,
    );

    return (
      merchant?.status === "suspended" &&
      Boolean(merchant.retention_suspended_at)
    );
  } catch (error) {
    console.error("Failed to inspect retention-suspended login:", error);
    return false;
  }
}

function requestApiPath(req: Request): string {
  return req.originalUrl.split("?", 1)[0].replace(/^\/api/, "") || "/";
}

function isPublicMerchantPath(pathname: string): boolean {
  return [
    "/healthz",
    "/auth/signup",
    "/auth/otp/resend",
    "/auth/verify-otp",
    "/auth/logout",
    "/auth/password-reset/request",
    "/auth/password-reset/confirm",
    "/meta/webhook",
    "/meta/callback",
  ].includes(pathname);
}

export function enforceMerchantRetentionAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const pathname = requestApiPath(req);

  if (req.method === "POST" && pathname === "/auth/login") {
    if (isRetentionSuspendedPhone(String(req.body?.phone || ""))) {
      res.status(403).json({
        ok: false,
        error: "account is suspended after the retention period",
        code: "RETENTION_ACCOUNT_SUSPENDED",
      });
      return;
    }

    next();
    return;
  }

  if (req.headers.authorization || isPublicMerchantPath(pathname)) {
    next();
    return;
  }

  const merchantCookie = String(
    req.cookies?.[MERCHANT_SESSION_COOKIE] || "",
  ).trim();

  if (!merchantCookie) {
    next();
    return;
  }

  requireMerchantSession(req, res, () => {
    const merchantId = getMerchantIdFromSession(res);
    const access = getMerchantRetentionAccess(merchantId);

    if (access.accountSuspended) {
      res.status(403).json({
        ok: false,
        error: "account is suspended after the retention period",
        code: "RETENTION_ACCOUNT_SUSPENDED",
        retention_status: access.retentionStatus,
      });
      return;
    }

    next();
  });
}
