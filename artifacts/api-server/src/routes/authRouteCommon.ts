import type { Request, Response } from "express";
import type { AuthAccount } from "../services/authAccountRepository";
import { buildGenericOtpResponse } from "../services/authPolicy";
import { authSecurityStore, AuthSecurityStoreError, type OtpPurpose } from "../services/authSecurityStore";
import { deliverAuthOtp } from "../services/authOtpDelivery";
import { getAuthContext, requestIp, sendAuthError } from "../middleware/authSession";

export function payload(account: AuthAccount) {
  return {
    account: {
      id: account.account.id,
      phone: account.account.phone,
      kind: account.account.kind,
      enabled: account.account.enabled,
      otp_verified: account.account.otpVerified,
    },
    ...(account.merchantProfile ? { merchant_profile: account.merchantProfile } : {}),
    ...(account.adminProfile ? { admin_profile: account.adminProfile } : {}),
  };
}

export function genericRecovery() {
  return buildGenericOtpResponse("password_reset");
}

export function devCode(code: string) {
  return process.env.NODE_ENV !== "production" &&
    process.env.AUTH_INCLUDE_DEV_CODE === "true"
    ? { devCode: code }
    : {};
}

export async function issueOtp(req: Request, target: string, purpose: OtpPurpose) {
  const issued = authSecurityStore.issueOtpChallenge({
    target,
    purpose,
    ip: requestIp(req),
  });
  const delivery = await deliverAuthOtp(target, issued.code, purpose);
  if (!delivery.ok) {
    authSecurityStore.revokeOtpChallenge(issued.challengeId);
    throw new AuthSecurityStoreError(delivery.code, delivery.message);
  }
  return issued;
}

export function otpError(res: Response, error: unknown, generic = false): void {
  if (error instanceof AuthSecurityStoreError) {
    if (error.retryAfterSeconds) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    if (generic) {
      res.status(202).json(genericRecovery());
      return;
    }
    sendAuthError(
      res,
      error.code.includes("RATE_LIMIT") || error.code.includes("COOLDOWN") ? 429 : 502,
      error.code,
      error.message,
      error.retryAfterSeconds
        ? { retry_after_seconds: error.retryAfterSeconds }
        : {},
    );
    return;
  }
  sendAuthError(
    res,
    500,
    "AUTH_SECURITY_FAILURE",
    "authentication security operation failed",
  );
}

export function ownerContext(res: Response) {
  const context = getAuthContext(res);
  if (context?.adminProfile?.role !== "owner_admin") {
    sendAuthError(
      res,
      403,
      "OWNER_ADMIN_REQUIRED",
      "owner administrator is required",
    );
    return null;
  }
  return context;
}
