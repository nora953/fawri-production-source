import fs from "node:fs";
import type { NextFunction, Request, Response } from "express";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../routes/auth";

type MerchantOperationalRecord = {
  id?: unknown;
  is_admin?: unknown;
  otp_verified?: unknown;
  status?: unknown;
  account_status?: unknown;
};

type MerchantOperationalDecision =
  | { allowed: true }
  | {
      allowed: false;
      statusCode: 403 | 503;
      code:
        | "MERCHANT_APPROVAL_REQUIRED"
        | "MERCHANT_REJECTED"
        | "MERCHANT_SUSPENDED"
        | "MERCHANT_ACCESS_STATE_UNAVAILABLE";
      error: string;
    };

const OPERATIONAL_PREFIXES = [
  "/api/products",
  "/api/conversations",
  "/api/conversation",
  "/api/orders",
  "/api/bot",
  "/api/saved-answers",
  "/api/bot-training",
] as const;

const OPERATIONAL_EXACT_PATHS = new Set([
  "/api/meta/login",
  "/api/meta/pages",
]);

export function isMerchantOperationalPath(req: Request): boolean {
  if (req.method === "OPTIONS") return false;

  const requestPath = req.path;
  if (OPERATIONAL_EXACT_PATHS.has(requestPath)) return true;

  return OPERATIONAL_PREFIXES.some(
    (prefix) =>
      requestPath === prefix || requestPath.startsWith(`${prefix}/`),
  );
}

function normalizeState(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function evaluateMerchantOperationalAccess(
  merchant: MerchantOperationalRecord | undefined,
): MerchantOperationalDecision {
  if (!merchant || merchant.is_admin === true || merchant.otp_verified === false) {
    return {
      allowed: false,
      statusCode: 503,
      code: "MERCHANT_ACCESS_STATE_UNAVAILABLE",
      error: "merchant access state is unavailable",
    };
  }

  const merchantStatus = normalizeState(merchant.status);
  const accountStatus = normalizeState(merchant.account_status);

  if (merchantStatus === "suspended" || accountStatus === "suspended") {
    return {
      allowed: false,
      statusCode: 403,
      code: "MERCHANT_SUSPENDED",
      error: "merchant account is suspended",
    };
  }

  if (merchantStatus === "rejected" || accountStatus === "rejected") {
    return {
      allowed: false,
      statusCode: 403,
      code: "MERCHANT_REJECTED",
      error: "merchant account was rejected",
    };
  }

  const legacyApprovedAccount =
    merchantStatus === "approved" && accountStatus.length === 0;
  const fullyApprovedAccount =
    merchantStatus === "approved" && accountStatus === "approved";

  if (legacyApprovedAccount || fullyApprovedAccount) {
    return { allowed: true };
  }

  return {
    allowed: false,
    statusCode: 403,
    code: "MERCHANT_APPROVAL_REQUIRED",
    error: "approved merchant account is required",
  };
}

function readMerchant(merchantId: string): MerchantOperationalRecord | undefined {
  const databasePath = getFawriDataFilePath("merchants.json");
  const parsed = JSON.parse(fs.readFileSync(databasePath, "utf8")) as {
    merchants?: unknown;
  };
  const merchants = Array.isArray(parsed.merchants) ? parsed.merchants : [];

  return merchants.find(
    (item): item is MerchantOperationalRecord =>
      Boolean(item) &&
      typeof item === "object" &&
      String((item as MerchantOperationalRecord).id || "").trim() === merchantId,
  );
}

export function enforceMerchantOperationalAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isMerchantOperationalPath(req)) {
    next();
    return;
  }

  requireMerchantSession(req, res, () => {
    const merchantId = getMerchantIdFromSession(res);

    try {
      const decision = evaluateMerchantOperationalAccess(readMerchant(merchantId));
      if (!decision.allowed) {
        res.status(decision.statusCode).json({
          ok: false,
          error: decision.error,
          code: decision.code,
        });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      next();
    } catch (error) {
      console.error("Merchant operational access check failed:", error);
      res.status(503).json({
        ok: false,
        error: "merchant access state is unavailable",
        code: "MERCHANT_ACCESS_STATE_UNAVAILABLE",
      });
    }
  });
}
