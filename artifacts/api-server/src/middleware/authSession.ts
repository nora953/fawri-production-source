import type { NextFunction, Request, Response } from "express";
import {
  authAccountRepository,
  type AdminProfile,
  type AuthAccount,
  type MerchantProfile,
} from "../services/authAccountRepository";
import {
  assertTenantIsolation,
  canMerchantAccessPath,
  hasAdminPermission,
  type AccountKind,
  type AdminPermission,
} from "../services/authPolicy";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import type {
  AuthSessionRecord,
  IssuedSession,
} from "../services/authSecurityStore";

export const MERCHANT_SESSION_COOKIE = "fawri_merchant_session_v2";
export const ADMIN_SESSION_COOKIE = "fawri_admin_session_v2";

export type AuthContext = {
  session: AuthSessionRecord;
  account: AuthAccount["account"];
  merchantProfile?: MerchantProfile;
  adminProfile?: AdminProfile;
};

type AuthenticatedResponse = Response & {
  locals: Response["locals"] & { auth?: AuthContext; merchantId?: string };
};

export function setAuthSessionCookie(
  res: Response,
  kind: AccountKind,
  issued: IssuedSession,
): void {
  const cookieName = kind === "merchant"
    ? MERCHANT_SESSION_COOKIE
    : ADMIN_SESSION_COOKIE;
  const maxAge = Math.max(
    1_000,
    new Date(issued.session.idle_expires_at).getTime() - Date.now(),
  );
  res.cookie(cookieName, issued.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge,
  });
  res.setHeader("Cache-Control", "no-store");
}

export function clearAuthSessionCookie(res: Response, kind: AccountKind): void {
  res.clearCookie(
    kind === "merchant" ? MERCHANT_SESSION_COOKIE : ADMIN_SESSION_COOKIE,
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
    },
  );
  res.setHeader("Cache-Control", "no-store");
}

export function getSessionToken(req: Request, kind: AccountKind): string {
  const cookieName = kind === "merchant"
    ? MERCHANT_SESSION_COOKIE
    : ADMIN_SESSION_COOKIE;
  return String(req.cookies?.[cookieName] || "").trim();
}

export function getAuthContext(res: Response): AuthContext | null {
  return (res as AuthenticatedResponse).locals.auth || null;
}

export function getMerchantIdFromSecureSession(res: Response): string {
  return getAuthContext(res)?.merchantProfile?.merchantId || "";
}

export async function requireSecureMerchantSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await authenticate(req, res, "merchant", next);
}

export async function requireSecureAdminSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await authenticate(req, res, "admin", next);
}

export function requireSecureAdminPermission(permission: AdminPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await authenticate(req, res, "admin", () => {
      const context = getAuthContext(res);
      const profile = context?.adminProfile;
      if (!profile || !hasAdminPermission(profile.role, profile.permissions, permission)) {
        sendAuthError(res, 403, "ADMIN_PERMISSION_REQUIRED", "admin permission is required");
        return;
      }
      next();
    });
  };
}

export function requireSecureTenant(
  resolveRequestedTenantId: (req: Request) => string | undefined,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await authenticate(req, res, "merchant", () => {
      const context = getAuthContext(res);
      const tenantId = context?.merchantProfile?.tenantId || "";
      const decision = assertTenantIsolation(tenantId, resolveRequestedTenantId(req));
      if (!decision.allowed) {
        sendAuthError(res, 403, decision.code, "cross-tenant access is forbidden");
        return;
      }
      next();
    });
  };
}

async function authenticate(
  req: Request,
  res: Response,
  expectedKind: AccountKind,
  next: NextFunction,
): Promise<void> {
  const token = getSessionToken(req, expectedKind);
  if (!token) {
    sendAuthError(res, 401, "SESSION_REQUIRED", `${expectedKind} session is required`);
    return;
  }

  const deviceId = requestDeviceId(req);
  const validated = await authPostgresSessionAuthority.validateSession({
    token,
    expectedKind,
    ...(deviceId ? { deviceId } : {}),
  });
  if (!validated) {
    clearAuthSessionCookie(res, expectedKind);
    sendAuthError(res, 401, "SESSION_INVALID", `${expectedKind} session is invalid or expired`);
    return;
  }

  const authAccount = authAccountRepository.findById(
    validated.session.account_id,
    expectedKind,
  );
  if (!authAccount || !authAccount.account.enabled) {
    await authPostgresSessionAuthority.revokeSession(
      token,
      expectedKind,
      "account_disabled",
    );
    clearAuthSessionCookie(res, expectedKind);
    sendAuthError(res, 401, "SESSION_ACCOUNT_INVALID", "session account is no longer active");
    return;
  }

  if (authAccount.account.sessionVersion !== validated.session.account_version) {
    await authPostgresSessionAuthority.revokeSession(
      token,
      expectedKind,
      "role_changed",
    );
    clearAuthSessionCookie(res, expectedKind);
    sendAuthError(res, 401, "SESSION_VERSION_REVOKED", "session was revoked by an account security change");
    return;
  }

  const context: AuthContext = {
    session: validated.session,
    account: authAccount.account,
    ...(authAccount.merchantProfile
      ? { merchantProfile: authAccount.merchantProfile }
      : {}),
    ...(authAccount.adminProfile ? { adminProfile: authAccount.adminProfile } : {}),
  };

  if (expectedKind === "merchant") {
    const profile = authAccount.merchantProfile;
    if (!profile) {
      await authPostgresSessionAuthority.revokeSession(
        token,
        expectedKind,
        "role_changed",
      );
      clearAuthSessionCookie(res, expectedKind);
      sendAuthError(res, 401, "ROLE_SESSION_CONFUSION", "merchant session cannot be used as an admin session");
      return;
    }
    const access = canMerchantAccessPath({
      accountStatus: profile.accountStatus,
      method: req.method,
      requestPath: req.originalUrl || req.path,
    });
    if (!access.allowed) {
      sendAuthError(res, 403, access.code, "merchant operational access is not available");
      return;
    }
  } else if (!authAccount.adminProfile) {
    await authPostgresSessionAuthority.revokeSession(
      token,
      expectedKind,
      "role_changed",
    );
    clearAuthSessionCookie(res, expectedKind);
    sendAuthError(res, 401, "ROLE_SESSION_CONFUSION", "admin session cannot be used as a merchant session");
    return;
  } else if (
    authAccount.adminProfile.mustChangePassword &&
    !isAdminPasswordChangePath(req.originalUrl || req.path)
  ) {
    sendAuthError(
      res,
      403,
      "ADMIN_PASSWORD_CHANGE_REQUIRED",
      "administrator password change is required",
    );
    return;
  }

  (res as AuthenticatedResponse).locals.auth = context;
  if (context.merchantProfile) {
    (res as AuthenticatedResponse).locals.merchantId = context.merchantProfile.merchantId;
  }
  res.setHeader("Cache-Control", "no-store");

  if (validated.needsRotation) {
    const rotated = await authPostgresSessionAuthority.rotateSession({
      token,
      expectedKind,
      ...(deviceId ? { deviceId } : {}),
    });
    if (!rotated) {
      clearAuthSessionCookie(res, expectedKind);
      sendAuthError(res, 401, "SESSION_ROTATION_FAILED", "session rotation failed closed");
      return;
    }
    setAuthSessionCookie(res, expectedKind, rotated);
    context.session = rotated.session;
  }

  next();
}

function isAdminPasswordChangePath(requestPath: string): boolean {
  const path = String(requestPath || "").split("?", 1)[0];
  return path === "/api/auth/admin/change-password" ||
    path === "/api/auth/admin/logout" ||
    path === "/api/auth/admin/me";
}

export function requestIp(req: Request): string {
  return String(req.ip || req.socket.remoteAddress || "unknown").slice(0, 160);
}

export function requestDeviceId(req: Request): string {
  return String(req.headers["x-fawri-device-id"] || req.body?.device_id || "")
    .trim()
    .slice(0, 160);
}

export function requestDeviceLabel(req: Request): string {
  return String(req.body?.device_label || req.headers["user-agent"] || "Unknown device")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function enforceAuthOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  const origin = String(req.headers.origin || "").trim();
  if (!origin) {
    next();
    return;
  }
  const allowed = String(process.env.FAWRI_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowed.length === 0 && process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  if (!allowed.includes(origin)) {
    sendAuthError(res, 403, "AUTH_ORIGIN_FORBIDDEN", "request origin is not allowed");
    return;
  }
  next();
}

export function sendAuthError(
  res: Response,
  status: number,
  code: string,
  error: string,
  extra: Record<string, unknown> = {},
): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, code, error, ...extra });
}

// Compatibility names for shared routers during coordinator cutover.
export const requireMerchantSession = requireSecureMerchantSession;
export const getMerchantIdFromSession = getMerchantIdFromSecureSession;

export function merchantSessionAccountExists(merchantId: string): boolean {
  const authAccount = authAccountRepository.findById(merchantId, "merchant");
  return Boolean(
    authAccount &&
    authAccount.account.enabled &&
    authAccount.account.otpVerified &&
    authAccount.merchantProfile,
  );
}
