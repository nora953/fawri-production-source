import { Router, type NextFunction, type Request, type Response } from "express";
import { normalizePhone } from "../services/authAccountRepository";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import { findAdminByPhoneAuthoritative } from "../services/postgresAdminAccountAuthority";
import {
  auditAdminSecurityEventAuthoritative,
  findAdminDeviceForVerificationPostgres,
  setAdminDeviceTrustAuthoritative,
} from "../services/postgresAdminSecurityAuthority";
import { AuthSecurityStoreError } from "../services/authSecurityTypes";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  recordMerchantLoginAttemptAuthoritative,
  verifyMerchantOtpChallengeAuthoritative,
} from "../services/postgresMerchantAuthSecurityAuthority";
import {
  requestDeviceId,
  requestDeviceLabel,
  requestIp,
  sendAuthError,
  setAuthSessionCookie,
} from "../middleware/authSession";
import { devCode, issueOtp, otpError, payload } from "./auth-route-common";

const router = Router();
router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!operationalPostgresAuthorityRequired() || !authPostgresSessionAuthority.enabled("admin")) {
    next("router");
    return;
  }
  next();
});

async function context(req: Request, res: Response) {
  const phone = normalizePhone(req.body?.phone);
  const account = await findAdminByPhoneAuthoritative(phone);
  if (!account?.adminProfile || account.adminProfile.role !== "owner_admin" || !account.account.enabled) {
    sendAuthError(res, 400, "OWNER_DEVICE_VERIFICATION_INVALID", "owner administrator device verification is invalid");
    return null;
  }
  const deviceId = requestDeviceId(req);
  if (!deviceId) {
    sendAuthError(res, 400, "ADMIN_DEVICE_ID_REQUIRED", "administrator device identifier is required");
    return null;
  }
  const requestedRecordId = String(req.body?.device_record_id || "").trim();
  if (!requestedRecordId) {
    sendAuthError(res, 400, "OWNER_DEVICE_VERIFICATION_INVALID", "owner administrator device verification is invalid");
    return null;
  }
  const device = await findAdminDeviceForVerificationPostgres({
    accountId: account.account.id,
    deviceRecordId: requestedRecordId,
    deviceId,
  });
  if (!device) {
    sendAuthError(res, 400, "OWNER_DEVICE_VERIFICATION_INVALID", "owner administrator device verification is invalid");
    return null;
  }
  return { phone, account, deviceId, device };
}

router.post("/admin/device-otp/resend", async (req, res) => {
  const current = await context(req, res);
  if (!current) return;
  if (current.device.status === "trusted") {
    sendAuthError(res, 409, "ADMIN_DEVICE_ALREADY_TRUSTED", "administrator device is already trusted");
    return;
  }
  try {
    const issued = await issueOtp(req, current.phone, "admin_device_verification");
    res.status(202).json({
      ok: true,
      challenge_id: issued.challengeId,
      expires_at: issued.expiresAt,
      retry_after_seconds: issued.retryAfterSeconds,
      ...devCode(issued.code),
    });
  } catch (error) {
    otpError(res, error);
  }
});

router.post("/admin/device-otp/verify", async (req, res) => {
  const challengeId = String(req.body?.challenge_id || "");
  const code = String(req.body?.code || "");
  if (!challengeId || !/^\d{6}$/.test(code)) {
    sendAuthError(res, 400, "OTP_INVALID", "verification code is invalid or expired");
    return;
  }
  const current = await context(req, res);
  if (!current?.account.adminProfile) return;
  if (current.device.status === "trusted") {
    sendAuthError(res, 409, "ADMIN_DEVICE_ALREADY_TRUSTED", "administrator device is already trusted");
    return;
  }
  const result = await verifyMerchantOtpChallengeAuthoritative({
    challengeId,
    target: current.phone,
    purpose: "admin_device_verification",
    code,
    ip: requestIp(req),
  });
  if (result !== "verified") {
    sendAuthError(res, 400, "OTP_INVALID", "verification code is invalid or expired");
    return;
  }
  try {
    const trusted = await setAdminDeviceTrustAuthoritative({
      deviceRecordId: current.device.id,
      trusted: true,
      actorAccountId: current.account.account.id,
    });
    if (!trusted) {
      sendAuthError(res, 404, "DEVICE_NOT_FOUND", "device not found");
      return;
    }
  } catch (error) {
    if (error instanceof AuthSecurityStoreError) {
      sendAuthError(
        res,
        409,
        error.code === "TRUSTED_DEVICE_LIMIT_REACHED"
          ? "ADMIN_TRUSTED_DEVICE_LIMIT_REACHED"
          : error.code,
        error.message,
      );
      return;
    }
    throw error;
  }
  const issued = await authPostgresSessionAuthority.issueSession({
    accountId: current.account.account.id,
    accountKind: "admin",
    tenantId: current.account.account.id,
    accountVersion: current.account.account.sessionVersion,
    adminRole: current.account.adminProfile.role,
    permissions: current.account.adminProfile.permissions,
    deviceId: current.deviceId,
    deviceLabel: requestDeviceLabel(req),
  });
  await recordMerchantLoginAttemptAuthoritative({
    target: current.phone,
    accountKind: "admin",
    ip: requestIp(req),
    success: true,
    reason: "owner_device_otp_verified",
    accountId: current.account.account.id,
  });
  await auditAdminSecurityEventAuthoritative({
    event_type: "owner_device_otp_verified",
    actor_account_id: current.account.account.id,
    actor_kind: "admin",
    subject_hash: current.account.account.id,
  });
  setAuthSessionCookie(res, "admin", issued);
  res.json({ ok: true, ...payload(current.account) });
});

export default router;