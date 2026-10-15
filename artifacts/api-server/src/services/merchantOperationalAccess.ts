import fs from "node:fs";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { findMerchantByIdAuthoritative } from "./postgresMerchantAccountAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

export type MerchantOperationalRecord = {
  id?: unknown;
  is_admin?: unknown;
  otp_verified?: unknown;
  status?: unknown;
  account_status?: unknown;
};

export type MerchantOperationalDecision =
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

export function readMerchantOperationalRecord(
  merchantId: string,
): MerchantOperationalRecord | undefined {
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

export function getMerchantOperationalDecision(
  merchantId: string,
): MerchantOperationalDecision {
  try {
    return evaluateMerchantOperationalAccess(
      readMerchantOperationalRecord(merchantId),
    );
  } catch (error) {
    console.error("Merchant operational access state read failed:", error);
    return {
      allowed: false,
      statusCode: 503,
      code: "MERCHANT_ACCESS_STATE_UNAVAILABLE",
      error: "merchant access state is unavailable",
    };
  }
}

export async function getMerchantOperationalDecisionAuthoritative(
  merchantIdValue: string,
): Promise<MerchantOperationalDecision> {
  const merchantId = String(merchantIdValue || "").trim();
  if (!operationalPostgresAuthorityRequired()) {
    return getMerchantOperationalDecision(merchantId);
  }
  try {
    const account = await findMerchantByIdAuthoritative(merchantId);
    if (!account?.merchantProfile) {
      return evaluateMerchantOperationalAccess(undefined);
    }
    const status =
      account.merchantProfile.accountStatus === "pending_review"
        ? "pending_activation"
        : account.merchantProfile.accountStatus;
    return evaluateMerchantOperationalAccess({
      id: account.account.id,
      is_admin: false,
      otp_verified: account.account.otpVerified,
      status,
      account_status: account.merchantProfile.accountStatus,
    });
  } catch (error) {
    console.error("Merchant operational PostgreSQL access state read failed", {
      code: String((error as { code?: unknown })?.code || "") || undefined,
    });
    return {
      allowed: false,
      statusCode: 503,
      code: "MERCHANT_ACCESS_STATE_UNAVAILABLE",
      error: "merchant access state is unavailable",
    };
  }
}
