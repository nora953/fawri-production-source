import { Router, type Request } from "express";
import { admitPendingGoogleMerchant } from "../services/googleMerchantAdmissionAuthority";
import { issueGoogleOidcChallenge } from "../services/googleOidcChallengeAuthority";
import { isGoogleMerchantIdentityLinked } from "../services/googleMerchantIdentityAssurance";
import { findMerchantByIdAuthoritative } from "../services/postgresMerchantAccountAuthority";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import {
  ADMIN_SESSION_COOKIE, MERCHANT_SESSION_COOKIE,
  requestDeviceId, requestDeviceLabel, requestIp, sendAuthError,
  setAuthSessionCookie,
} from "../middleware/authSession";
import { payload } from "./auth-route-common";

/**
 * Mounted but DEFAULT OFF: this route surface does nothing unless explicitly
 * activated AFTER separately approved Neon schema / Google OAuth readiness.
 * Google enrollment is NOT trial approval. Admin and legacy phone auth stay.
 */
const router = Router();
const CSRF_COOKIE = "fawri_google_oidc_csrf";
const COOKIE_PATH = "/api/auth/google";
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

export function googleMerchantHttpReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FAWRI_GOOGLE_OIDC_HTTP_READY === "1" &&
    env.FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED === "1" &&
    env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY === "required" &&
    env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY === "required" &&
    Boolean(env.FAWRI_AUTH_DATABASE_URL) &&
    /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(
      String(env.FAWRI_GOOGLE_OAUTH_CLIENT_ID || ""),
    ) &&
    String(env.FAWRI_AUTH_SECURITY_SECRET || "").length >= 32;
}

export function googleOriginAllowed(req: Pick<Request,"headers"|"method">, env: NodeJS.ProcessEnv = process.env): boolean {
  if (req.method !== "POST") return false;
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return false;
  const allowed = String(env.FAWRI_ALLOWED_ORIGINS || "").split(",")
    .map(item => item.trim()).filter(Boolean);
  return allowed.length > 0 && allowed.includes(origin);
}

function rejectUnauthorized() {
  return { ok: false, code: "GOOGLE_AUTH_FAILED", error: "Google sign-in could not be completed" };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: COOKIE_PATH,
    maxAge: CHALLENGE_LIFETIME_MS,
  };
}

function noMixedSession(req: Request): boolean {
  return !req.cookies?.[ADMIN_SESSION_COOKIE] && !req.cookies?.[MERCHANT_SESSION_COOKIE];
}

router.post("/google/begin", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!googleMerchantHttpReady()) {
    sendAuthError(res, 404, "GOOGLE_AUTH_DISABLED", "Google merchant sign-in is not available");
    return;
  }
  if (!googleOriginAllowed(req) || !req.is("application/json") || !noMixedSession(req)) {
    sendAuthError(res, 403, "GOOGLE_AUTH_FORBIDDEN", "Google sign-in request is forbidden");
    return;
  }
  try {
    const issued = await issueGoogleOidcChallenge(requestIp(req).slice(0,128));
    // Server sets the proof as an HttpOnly cookie; the proof is never in JSON.
    res.cookie(CSRF_COOKIE, issued.csrfProof, cookieOptions());
    res.json({
      ok: true,
      challenge_id: issued.challengeId,
      nonce: issued.nonce,
      expires_at: issued.expiresAt,
    });
  } catch {
    sendAuthError(res, 503, "GOOGLE_AUTH_UNAVAILABLE", "Google sign-in is unavailable");
  }
});

router.post("/google/complete", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!googleMerchantHttpReady()) {
    sendAuthError(res, 404, "GOOGLE_AUTH_DISABLED", "Google merchant sign-in is not available");
    return;
  }
  if (!googleOriginAllowed(req) || !req.is("application/json") || !noMixedSession(req)) {
    sendAuthError(res, 403, "GOOGLE_AUTH_FORBIDDEN", "Google sign-in request is forbidden");
    return;
  }
  // Terminal attempt clears the browser proof, even after signed token failure.
  const csrfProof = String(req.cookies?.[CSRF_COOKIE] || "");
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
  });
  try {
    if (!csrfProof || typeof req.body !== "object" || !req.body) {
      res.status(401).json(rejectUnauthorized());
      return;
    }
    const admitted = await admitPendingGoogleMerchant({
      idToken: req.body.id_token,
      expectedNonce: req.body.nonce,
      challengeId: req.body.challenge_id,
      csrfProofFromCookie: csrfProof,
      ownerName: req.body.owner_name,
      storeName: req.body.store_name,
      activityType: req.body.activity_type,
      countryCode: req.body.country_code,
      timezone: req.body.timezone,
      currencyCode: req.body.currency_code,
      language: req.body.language,
      requestedPlan: req.body.requested_plan,
      agreeTerms: req.body.agree_terms,
      confirmLegal: req.body.confirm_legal,
    });
    const account = await findMerchantByIdAuthoritative(admitted.accountId);
    if (!account?.merchantProfile || !account.account.enabled ||
        !await isGoogleMerchantIdentityLinked(admitted.accountId)) {
      res.status(401).json(rejectUnauthorized());
      return;
    }
    const deviceId = requestDeviceId(req);
    const issued = await authPostgresSessionAuthority.issueSession({
      accountId: account.account.id,
      accountKind: "merchant",
      tenantId: account.merchantProfile.tenantId,
      accountVersion: account.account.sessionVersion,
      ...(deviceId ? { deviceId } : {}),
      deviceLabel: requestDeviceLabel(req),
    });
    setAuthSessionCookie(res, "merchant", issued);
    res.json({
      ok: true,
      created: admitted.created,
      trial_activated: false,
      ...payload(account),
    });
  } catch {
    // No Google token, nonce, cookie, subject, DB query, or private authority
    // diagnostic is ever reflected to the user.
    res.status(401).json(rejectUnauthorized());
  }
});

export default router;
