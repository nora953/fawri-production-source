import type { Request, Response } from "express";
import type { AuthAccount } from "../services/authAccountRepository";
import { buildGenericOtpResponse } from "../services/authPolicy";
import {
  AuthSecurityStoreError,
  type OtpPurpose,
} from "../services/authSecurityStore";
import {
  issueMerchantOtpChallengeAuthoritative,
  revokeMerchantOtpChallengeAuthoritative,
} from "../services/postgresMerchantAuthSecurityAuthority";
import { deliverAuthOtp } from "../services/authOtpDelivery";
import { getAuthContext, requestIp, sendAuthError } from "../middleware/authSession";

function legacySafeProfile(account: AuthAccount) {
  if (account.merchantProfile) {
    const profile = account.merchantProfile;
    return {
      id: account.account.id,
      owner_name: profile.ownerName,
      store_name: profile.storeName,
      phone: account.account.phone,
      activity_type: profile.activityType,
      status:
        profile.accountStatus === "pending_review"
          ? "pending_activation"
          : profile.accountStatus,
      language: profile.language,
      created_at: profile.createdAt,
      is_admin: false,
      otp_verified: account.account.otpVerified,
      account_status: profile.accountStatus,
      onboarding_status: profile.onboardingStatus,
      requested_plan: profile.requestedPlan,
    };
  }

  const profile = account.adminProfile!;
  return {
    id: account.account.id,
    owner_name: profile.displayName,
    store_name: "Fawri Admin",
    phone: account.account.phone,
    activity_type: "admin",
    status: account.account.enabled ? "approved" : "suspended",
    language: profile.language,
    created_at: profile.createdAt,
    is_admin: true,
    admin_role: profile.role,
    permissions: profile.permissions,
    admin_enabled: account.account.enabled,
    otp_verified: account.account.otpVerified,
    must_change_password: profile.mustChangePassword,
  };
}

export function payload(account: AuthAccount) {
  const compatibilityProfile = legacySafeProfile(account);
  return {
    ...compatibilityProfile,
    account: {
      id: account.account.id,
      phone: account.account.phone,
      kind: account.account.kind,
      enabled: account.account.enabled,
      otp_verified: account.account.otpVerified,
    },
    account_type: account.account.kind,
    ...(account.merchantProfile
      ? {
          merchant_profile: account.merchantProfile,
          merchant: compatibilityProfile,
        }
      : {}),
    ...(account.adminProfile
      ? {
          admin_profile: account.adminProfile,
          admin: compatibilityProfile,
        }
      : {}),
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
  const issued = await issueMerchantOtpChallengeAuthoritative({
    target,
    purpose,
    ip: requestIp(req),
  });
  const delivery = await deliverAuthOtp(target, issued.code, purpose);
  if (!delivery.ok) {
    await revokeMerchantOtpChallengeAuthoritative(issued.challengeId);
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
      error.code.includes("RATE_LIMIT") || error.code.includes("COOLDOWN")
        ? 429
        : 502,
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
