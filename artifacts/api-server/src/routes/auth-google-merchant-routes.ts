import { Router, type Request } from "express";
import { isE164Phone, normalizePhone } from "../services/authAccountRepository";
import {
  googlePhoneClaimSourceReady,
  issueMerchantOtpChallengeAuthoritative,
  recordAcceptedSignupWhatsAppTemplate,
  revokeMerchantOtpChallengeAuthoritative,
  verifyMerchantOtpChallengeAuthoritative,
} from "../services/postgresMerchantAuthSecurityAuthority";
import { deliverAuthOtpWithProviderReceipt } from "../services/authOtpDelivery";
import { admitPendingGoogleMerchant } from "../services/googleMerchantAdmissionAuthority";
import { issueGoogleOidcChallenge } from "../services/googleOidcChallengeAuthority";
import { isGoogleMerchantIdentityLinked } from "../services/googleMerchantIdentityAssurance";
import { findMerchantByIdAuthoritative } from "../services/postgresMerchantAccountAuthority";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import {
  ADMIN_SESSION_COOKIE, MERCHANT_SESSION_COOKIE,
  getAuthContext, requireSecureMerchantSession,
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
    // The first commercial browser is hosted at the canonical owner-approved
    // domain. An allowlist containing only an unrelated/prelaunch origin must
    // not report Google as production-ready while every real merchant gets 403.
    // Nonproduction review still accepts any explicit origin for local tests.
    (() => {
      const origins = String(env.FAWRI_ALLOWED_ORIGINS || "").split(",")
        .map(origin => origin.trim()).filter(Boolean);
      return origins.length > 0 && (
        (env.NODE_ENV !== "production" && env.FAWRI_DEPLOYMENT_MODE !== "production") ||
        origins.includes("https://fawrireply.com")
      );
    })() &&
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

/**
 * The FIRST trusted phone is claimed by Google-owned merchant only after an
 * approved WhatsApp Authentication template and correct six-digit OTP.
 * No SMS, no auto-trial, no pre-verification account.phone reservation.
 * Requires an existing valid Google merchant HttpOnly session, scoped origin,
 * and separately approved default-OFF production flags and HELD migrations.
 */
function googlePhoneSessionAccount(res: import("express").Response): string | null {
  const context = getAuthContext(res);
  if (!context?.merchantProfile || context.account.kind !== "merchant" ||
      context.account.otpVerified ||
      context.account.phone ||
      context.merchantProfile.tenantId !== context.account.id ||
      !["pending_review", "approved"].includes(context.merchantProfile.accountStatus)) {
    return null;
  }
  return context.account.id;
}

router.post("/google/phone/begin", requireSecureMerchantSession, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!googleMerchantHttpReady() || !googlePhoneClaimSourceReady()) {
    sendAuthError(res, 404, "GOOGLE_PHONE_DISABLED", "WhatsApp phone verification is not available");
    return;
  }
  const accountId = googlePhoneSessionAccount(res);
  const phone = normalizePhone(req.body?.phone);
  if (!googleOriginAllowed(req) || !req.is("application/json") ||
      !accountId || !isE164Phone(phone) ||
      !await isGoogleMerchantIdentityLinked(accountId)) {
    sendAuthError(res, 403, "GOOGLE_PHONE_FORBIDDEN", "WhatsApp phone verification is forbidden");
    return;
  }
  let challengeId = "";
  try {
    const issued = await issueMerchantOtpChallengeAuthoritative({
      target: phone, purpose: "signup", ip: requestIp(req),
      // NEVER from req.body; only validated account session.
      googleMerchantAccountId: accountId,
    });
    challengeId = issued.challengeId;
    const delivery = await deliverAuthOtpWithProviderReceipt(phone, issued.code, "signup");
    if (!delivery.ok || !("providerReceipt" in delivery) || !delivery.providerReceipt) {
      throw new Error("GOOGLE_PHONE_PROVIDER_RECEIPT_MISSING");
    }
    await recordAcceptedSignupWhatsAppTemplate({
      challengeId, target: phone, providerReceipt: delivery.providerReceipt,
      googleMerchantAccountId: accountId,
    });
    res.status(202).json({
      ok: true,
      challenge_id: challengeId,
      expires_at: issued.expiresAt,
      retry_after_seconds: issued.retryAfterSeconds,
    });
  } catch {
    if (challengeId) {
      try { await revokeMerchantOtpChallengeAuthoritative(challengeId); } catch {}
    }
    sendAuthError(res, 503, "GOOGLE_PHONE_OTP_UNAVAILABLE",
      "Unable to begin WhatsApp verification");
  }
});

router.post("/google/phone/verify", requireSecureMerchantSession, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!googleMerchantHttpReady() || !googlePhoneClaimSourceReady()) {
    sendAuthError(res, 404, "GOOGLE_PHONE_DISABLED", "WhatsApp phone verification is not available");
    return;
  }
  const accountId = googlePhoneSessionAccount(res);
  const phone = normalizePhone(req.body?.phone);
  const challengeId = String(req.body?.challenge_id || "");
  const code = String(req.body?.code || "");
  if (!googleOriginAllowed(req) || !req.is("application/json") ||
      !accountId || !isE164Phone(phone) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId) ||
      !/^\d{6}$/.test(code) ||
      !await isGoogleMerchantIdentityLinked(accountId)) {
    sendAuthError(res, 403, "GOOGLE_PHONE_FORBIDDEN", "WhatsApp phone verification is forbidden");
    return;
  }
  try {
    const status = await verifyMerchantOtpChallengeAuthoritative({
      challengeId, target: phone, purpose: "signup", code, ip: requestIp(req),
      expectedGoogleAccountId: accountId,
    });
    if (status !== "verified") {
      sendAuthError(res, 400, "OTP_INVALID", "verification code is invalid or expired");
      return;
    }
    const updated = await findMerchantByIdAuthoritative(accountId);
    if (!updated?.merchantProfile || !updated.account.otpVerified ||
        updated.account.phone !== phone) {
      sendAuthError(res, 409, "ACCOUNT_STATE_CHANGED", "account state changed");
      return;
    }
    res.json({ ok: true, trial_activated: false, ...payload(updated) });
  } catch {
    // A unique-phone conflict or concurrent claim fails closed with no proof.
    sendAuthError(res, 409, "GOOGLE_PHONE_CLAIM_UNAVAILABLE",
      "WhatsApp phone verification could not be completed");
  }
});

export default router;
