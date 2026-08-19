import type { Request, Response } from "express";
import {
  authAccountRepository,
  normalizePhone,
} from "../services/authAccountRepository";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../services/authPasswordService";
import {
  findAdminByIdAuthoritative,
  findAdminByPhoneAuthoritative,
  updateAdminPasswordAuthoritative,
} from "../services/postgresAdminAccountAuthority";
import {
  isAdminDeviceTrustedAuthoritative,
  registerAdminDeviceAuthoritative,
} from "../services/postgresAdminSecurityAuthority";
import { findMerchantByPhoneAuthoritative } from "../services/postgresMerchantAccountAuthority";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  checkMerchantLoginAllowedAuthoritative,
  recordMerchantLoginAttemptAuthoritative,
} from "../services/postgresMerchantAuthSecurityAuthority";
import {
  requestDeviceId,
  requestDeviceLabel,
  requestIp,
  sendAuthError,
  setAuthSessionCookie,
} from "../middleware/authSession";
import {
  devCode,
  issueOtp,
  otpError,
  payload,
} from "./auth-route-common";

export async function login(
  req: Request,
  res: Response,
  kind: "merchant" | "admin",
) {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "");
  if (!phone || !password) {
    sendAuthError(
      res,
      400,
      "CREDENTIALS_REQUIRED",
      "phone and password are required",
    );
    return;
  }

  const allowed = await checkMerchantLoginAllowedAuthoritative({
    target: phone,
    accountKind: kind,
    ip: requestIp(req),
  });
  if (!allowed.allowed) {
    res.setHeader("Retry-After", String(allowed.retryAfterSeconds));
    sendAuthError(res, 429, "LOGIN_RATE_LIMITED", "too many login attempts", {
      retry_after_seconds: allowed.retryAfterSeconds,
    });
    return;
  }

  let found =
    kind === "merchant"
      ? await findMerchantByPhoneAuthoritative(phone)
      : await findAdminByPhoneAuthoritative(phone);
  if (
    !found ||
    !found.account.enabled ||
    !verifyPassword(password, found.account.passwordHash) ||
    (kind === "merchant" && !found.account.otpVerified)
  ) {
    await recordMerchantLoginAttemptAuthoritative({
      target: phone,
      accountKind: kind,
      ip: requestIp(req),
      success: false,
      reason: "invalid_credentials",
      ...(found ? { accountId: found.account.id } : {}),
    });
    sendAuthError(
      res,
      401,
      "INVALID_CREDENTIALS",
      "phone or password is incorrect",
    );
    return;
  }

  if (passwordNeedsRehash(found.account.passwordHash)) {
    if (kind === "admin") {
      await updateAdminPasswordAuthoritative(
        found.account.id,
        hashPassword(password),
      );
      const refreshed = await findAdminByIdAuthoritative(found.account.id);
      if (refreshed) found = refreshed;
    } else if (!operationalPostgresAuthorityRequired()) {
      authAccountRepository.updatePassword(
        found.account.id,
        kind,
        hashPassword(password),
      );
      const refreshed = authAccountRepository.findById(found.account.id, kind);
      if (refreshed) found = refreshed;
    }
  }

  if (kind === "admin" && found.adminProfile?.role === "owner_admin") {
    const activeOwnerSessions = await authPostgresSessionAuthority.listActiveSessions(
      found.account.id,
      "admin",
    );
    if (activeOwnerSessions.length >= 2) {
      await recordMerchantLoginAttemptAuthoritative({
        target: phone,
        accountKind: "admin",
        ip: requestIp(req),
        success: false,
        reason: "owner_session_limit_reached",
        accountId: found.account.id,
      });
      sendAuthError(
        res,
        409,
        "OWNER_SESSION_LIMIT_REACHED",
        "owner account already has two active sessions",
      );
      return;
    }
  }

  const deviceId = requestDeviceId(req);
  if (kind === "admin") {
    if (!deviceId) {
      sendAuthError(
        res,
        400,
        "ADMIN_DEVICE_ID_REQUIRED",
        "administrator device identifier is required",
      );
      return;
    }
    const device = await registerAdminDeviceAuthoritative({
      accountId: found.account.id,
      accountKind: "admin",
      deviceId,
      deviceLabel: requestDeviceLabel(req),
    });
    if (!(await isAdminDeviceTrustedAuthoritative(found.account.id, deviceId))) {
      if (found.adminProfile?.role === "owner_admin") {
        try {
          const issued = await issueOtp(
            req,
            phone,
            "admin_device_verification",
          );
          await recordMerchantLoginAttemptAuthoritative({
            target: phone,
            accountKind: kind,
            ip: requestIp(req),
            success: false,
            reason: "owner_device_otp_required",
            accountId: found.account.id,
          });
          res.status(403).json({
            ok: false,
            code: "OWNER_DEVICE_OTP_REQUIRED",
            error: "owner administrator device verification is required",
            device_record_id: device.id,
            challenge_id: issued.challengeId,
            expires_at: issued.expiresAt,
            retry_after_seconds: issued.retryAfterSeconds,
            ...devCode(issued.code),
          });
        } catch (error) {
          otpError(res, error);
        }
        return;
      }

      await recordMerchantLoginAttemptAuthoritative({
        target: phone,
        accountKind: kind,
        ip: requestIp(req),
        success: false,
        reason: "device_approval_required",
        accountId: found.account.id,
      });
      sendAuthError(
        res,
        403,
        "ADMIN_DEVICE_APPROVAL_REQUIRED",
        "administrator device approval is required",
        { device_record_id: device.id },
      );
      return;
    }
  }

  const profile =
    kind === "merchant" ? found.merchantProfile : found.adminProfile;
  if (!profile) {
    sendAuthError(
      res,
      401,
      "ROLE_SESSION_CONFUSION",
      "account role is invalid",
    );
    return;
  }

  const issued = await authPostgresSessionAuthority.issueSession({
    accountId: found.account.id,
    accountKind: kind,
    tenantId:
      kind === "merchant"
        ? found.merchantProfile!.tenantId
        : found.account.id,
    accountVersion: found.account.sessionVersion,
    ...(found.adminProfile
      ? {
          adminRole: found.adminProfile.role,
          permissions: found.adminProfile.permissions,
        }
      : {}),
    ...(deviceId ? { deviceId } : {}),
    deviceLabel: requestDeviceLabel(req),
  });
  await recordMerchantLoginAttemptAuthoritative({
    target: phone,
    accountKind: kind,
    ip: requestIp(req),
    success: true,
    reason: "valid_credentials",
    accountId: found.account.id,
  });
  setAuthSessionCookie(res, kind, issued);
  res.json({ ok: true, ...payload(found) });
}
