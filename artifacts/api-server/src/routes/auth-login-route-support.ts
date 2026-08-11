import type { Request, Response } from "express";
import {
  authAccountRepository,
  normalizePhone,
} from "../services/authAccountRepository";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import { authSecurityStore } from "../services/authSecurityStore";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../services/authPasswordService";
import { findMerchantByPhoneAuthoritative } from "../services/postgresMerchantAccountAuthority";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  requestDeviceId,
  requestDeviceLabel,
  requestIp,
  sendAuthError,
  setAuthSessionCookie,
} from "../middleware/authSession";
import { payload } from "./auth-route-common";

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

  const allowed = authSecurityStore.checkLoginAllowed({
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
      : authAccountRepository.findByPhone(phone, "admin");
  if (
    !found ||
    !found.account.enabled ||
    !verifyPassword(password, found.account.passwordHash) ||
    (kind === "merchant" && !found.account.otpVerified)
  ) {
    authSecurityStore.recordLoginAttempt({
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
    // A PostgreSQL merchant password is never rewritten through the legacy
    // file repository. Rehash can safely wait until a password change/reset,
    // where the PostgreSQL password/session transaction owns the mutation.
    if (kind === "admin" || !operationalPostgresAuthorityRequired()) {
      authAccountRepository.updatePassword(
        found.account.id,
        kind,
        hashPassword(password),
      );
      const refreshed = authAccountRepository.findById(found.account.id, kind);
      if (refreshed) found = refreshed;
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
    const device = authSecurityStore.registerDevice({
      accountId: found.account.id,
      accountKind: "admin",
      deviceId,
      deviceLabel: requestDeviceLabel(req),
    });
    const bootstrap = String(process.env.FAWRI_OWNER_BOOTSTRAP_DEVICE_ID || "");
    if (
      found.adminProfile?.role === "owner_admin" &&
      bootstrap &&
      bootstrap === deviceId &&
      device.status !== "trusted"
    ) {
      authSecurityStore.setDeviceTrust({
        deviceRecordId: device.id,
        trusted: true,
        actorAccountId: found.account.id,
      });
    }
    if (!authSecurityStore.isDeviceTrusted(found.account.id, "admin", deviceId)) {
      authSecurityStore.recordLoginAttempt({
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
  authSecurityStore.recordLoginAttempt({
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
