import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import {
  ADMIN_SESSION_COOKIE,
  MERCHANT_SESSION_COOKIE,
  getAuthContext,
  requireSecureAdminSession,
  requireSecureMerchantSession,
  sendAuthError,
} from "./authSession";

const LEGACY_MERCHANT_COOKIE = "fawri_merchant_session";
const INTERNAL_CREDENTIAL_TTL_MS = 60_000;
const DEFAULT_SSE_REVALIDATE_MS = 30_000;

function requestPath(req: Request): string {
  return String(req.originalUrl || req.path || "").split("?", 1)[0];
}

function clearLegacyMerchantCookie(req: Request, res: Response): void {
  if (req.cookies && Object.prototype.hasOwnProperty.call(req.cookies, LEGACY_MERCHANT_COOKIE)) {
    delete req.cookies[LEGACY_MERCHANT_COOKIE];
    res.clearCookie(LEGACY_MERCHANT_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
    });
  }
}

function legacyMerchantSecret(): string {
  const configured = String(
    process.env.FAWRI_MERCHANT_SESSION_SECRET ||
      process.env.FAWRI_ADMIN_SESSION_SECRET ||
      process.env.FAWRI_PASSWORD_SALT ||
      "",
  ).trim();
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error("legacy merchant compatibility secret must be explicitly configured during auth cutover");
  }
  return configured || "fawri-local-dev-salt";
}

function legacyAdminSecret(): string {
  const configured = String(
    process.env.FAWRI_ADMIN_SESSION_SECRET || process.env.FAWRI_PASSWORD_SALT || "",
  ).trim();
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error("legacy admin compatibility secret must be explicitly configured during auth cutover");
  }
  return configured || "fawri-local-dev-salt";
}

function internalMerchantCredential(merchantId: string): string {
  const payload = {
    kind: "merchant_session",
    merchantId,
    expiresAt: Date.now() + INTERNAL_CREDENTIAL_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", legacyMerchantSecret())
    .update(`session.${encoded}`)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function internalAdminCredential(adminId: string, sessionVersion: number): string {
  const payload = {
    adminId,
    sessionVersion,
    expiresAt: Date.now() + INTERNAL_CREDENTIAL_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", legacyAdminSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function isLegacySecurityAuthorityPath(path: string): boolean {
  return (
    /^\/api\/auth\/admin\/session(?:\/|$)/.test(path) ||
    path === "/api/auth/admin/password/change-required" ||
    /^\/api\/auth\/admins\/[^/]+\/(?:work-monitor|devices(?:\/|$)|sessions(?:\/|$))/.test(path)
  );
}

function sseRevalidateMs(): number {
  const configured = Number(process.env.FAWRI_AUTH_SSE_REVALIDATE_MS);
  if (!Number.isFinite(configured)) return DEFAULT_SSE_REVALIDATE_MS;
  return Math.max(5_000, Math.min(60_000, Math.trunc(configured)));
}

function forceSseReconnectForRevalidation(req: Request, res: Response): void {
  const path = requestPath(req);
  if (path !== "/api/auth/events" && path !== "/api/auth/admin/subscriptions/events") {
    return;
  }
  const timeout = setTimeout(() => {
    if (!res.writableEnded) res.end();
  }, sseRevalidateMs());
  timeout.unref();
  const clear = () => clearTimeout(timeout);
  res.once("close", clear);
  res.once("finish", clear);
}

function injectMerchantCompatibility(req: Request, res: Response, next: NextFunction): void {
  requireSecureMerchantSession(req, res, () => {
    const context = getAuthContext(res);
    const merchantId = context?.merchantProfile?.merchantId;
    if (!merchantId) {
      sendAuthError(res, 401, "ROLE_SESSION_CONFUSION", "merchant auth context is unavailable");
      return;
    }
    req.cookies = req.cookies || {};
    req.cookies[LEGACY_MERCHANT_COOKIE] = internalMerchantCredential(merchantId);
    forceSseReconnectForRevalidation(req, res);
    next();
  });
}

function injectAdminCompatibility(req: Request, res: Response, next: NextFunction): void {
  requireSecureAdminSession(req, res, () => {
    const context = getAuthContext(res);
    if (!context?.adminProfile) {
      sendAuthError(res, 401, "ROLE_SESSION_CONFUSION", "admin auth context is unavailable");
      return;
    }
    req.headers.authorization = `Bearer ${internalAdminCredential(
      context.account.id,
      context.account.sessionVersion,
    )}`;
    forceSseReconnectForRevalidation(req, res);
    next();
  });
}

/**
 * Transitional shared-wiring bridge.
 *
 * Client-provided legacy merchant cookies are discarded and client-provided
 * admin Bearer tokens are rejected. A short-lived legacy-shaped credential is
 * created only after the v2 server-side session has been validated, solely so
 * legacy business handlers that have not yet been decomposed from auth.ts can
 * execute without becoming a second authentication authority.
 */
export function enforceAuthCutoverCompatibility(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const path = requestPath(req);
  const suppliedAuthorization = String(req.headers.authorization || "").trim();
  const suppliedLegacyBearer = /^Bearer\s+/i.test(suppliedAuthorization);

  clearLegacyMerchantCookie(req, res);

  if (path.startsWith("/api/auth") && suppliedLegacyBearer) {
    delete req.headers.authorization;
    sendAuthError(res, 401, "LEGACY_ADMIN_BEARER_DISABLED", "legacy administrator bearer authorization is disabled");
    return;
  }

  if (isLegacySecurityAuthorityPath(path)) {
    sendAuthError(res, 410, "LEGACY_AUTH_ENDPOINT_DISABLED", "legacy authentication security endpoint is disabled");
    return;
  }

  const hasMerchantSession = Boolean(req.cookies?.[MERCHANT_SESSION_COOKIE]);
  const hasAdminSession = Boolean(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (hasMerchantSession && hasAdminSession) {
    sendAuthError(res, 401, "ROLE_SESSION_CONFUSION", "merchant and administrator sessions cannot be combined");
    return;
  }

  if (hasAdminSession) {
    injectAdminCompatibility(req, res, next);
    return;
  }
  if (hasMerchantSession) {
    injectMerchantCompatibility(req, res, next);
    return;
  }

  if (path.startsWith("/api/auth")) {
    sendAuthError(res, 401, "SESSION_REQUIRED", "secure session is required");
    return;
  }

  next();
}
