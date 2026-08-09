import { Router } from "express";
import { authAccountRepository, normalizePhone, type RequestedPlan } from "../services/authAccountRepository";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import { authSecurityStore, type OtpPurpose } from "../services/authSecurityStore";
import { getPasswordValidationError, hashPassword } from "../services/authPasswordService";
import { clearAuthSessionCookie, requestDeviceId, requestDeviceLabel, requestIp, sendAuthError, setAuthSessionCookie } from "../middleware/authSession";
import { devCode, genericRecovery, issueOtp, otpError, payload } from "./auth-route-common";
import { login } from "./auth-login-route-support";

const router = Router();
router.post("/signup", async (req, res) => {
  const phone = normalizePhone(req.body?.phone), password = String(req.body?.password || "");
  const ownerName = String(req.body?.owner_name || "").trim(), storeName = String(req.body?.store_name || "").trim(), activityType = String(req.body?.activity_type || "").trim();
  const language = req.body?.language === "en" || req.body?.language === "ku" ? req.body.language : "ar";
  const requestedPlanInput = req.body?.requested_plan;
  let requestedPlan: RequestedPlan | undefined;
  if (requestedPlanInput !== undefined && requestedPlanInput !== null) {
    if (requestedPlanInput !== "silver" && requestedPlanInput !== "gold" && requestedPlanInput !== "diamond") {
      sendAuthError(res, 400, "INVALID_REQUESTED_PLAN", "requested_plan must be silver, gold, or diamond");
      return;
    }
    requestedPlan = requestedPlanInput;
  }
  const validation = getPasswordValidationError(password);
  if (!/^07\d{9}$/.test(phone)) { sendAuthError(res, 400, "INVALID_PHONE", "phone must start with 07 and contain 11 digits"); return; }
  if (validation) { sendAuthError(res, 400, validation.code, validation.message); return; }
  if (!ownerName || !storeName || !activityType) { sendAuthError(res, 400, "SIGNUP_FIELDS_REQUIRED", "owner, store, and activity fields are required"); return; }
  try {
    const account = authAccountRepository.upsertPendingMerchant({ phone, passwordHash: hashPassword(password), ownerName, storeName, activityType, language, requestedPlan });
    const issued = await issueOtp(req, phone, "signup");
    res.status(201).json({ ok: true, ...payload(account), challenge_id: issued.challengeId, expires_at: issued.expiresAt, retry_after_seconds: issued.retryAfterSeconds, ...devCode(issued.code) });
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_ALREADY_EXISTS") { sendAuthError(res, 409, error.message, "phone is already registered"); return; }
    otpError(res, error);
  }
});
router.post("/otp/resend", async (req, res) => {
  const phone = normalizePhone(req.body?.phone), purpose = String(req.body?.purpose || "") as OtpPurpose;
  if (!/^07\d{9}$/.test(phone) || !["signup", "password_reset"].includes(purpose)) { sendAuthError(res, 400, "INVALID_OTP_REQUEST", "invalid verification request"); return; }
  const account = authAccountRepository.findByPhone(phone, "merchant");
  if (!account || (purpose === "signup" && account.account.otpVerified)) { res.status(202).json(purpose === "password_reset" ? genericRecovery() : { ok: true, message: "If verification is eligible, a code will be sent." }); return; }
  try { const issued = await issueOtp(req, phone, purpose); res.status(202).json({ ok: true, message: "If the account is eligible, a verification code will be sent.", challenge_id: issued.challengeId, expires_at: issued.expiresAt, retry_after_seconds: issued.retryAfterSeconds, ...devCode(issued.code) }); }
  catch (error) { otpError(res, error, purpose === "password_reset"); }
});
router.post("/verify-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone), challengeId = String(req.body?.challenge_id || ""), code = String(req.body?.code || "");
  if (!challengeId || !/^\d{6}$/.test(code)) { sendAuthError(res, 400, "OTP_INVALID", "verification code is invalid or expired"); return; }
  const account = authAccountRepository.findByPhone(phone, "merchant");
  const result = authSecurityStore.verifyOtpChallenge({ challengeId, target: phone, purpose: "signup", code, ip: requestIp(req) });
  if (!account || result !== "verified") { sendAuthError(res, 400, "OTP_INVALID", "verification code is invalid or expired"); return; }
  const verified = authAccountRepository.markMerchantOtpVerified(account.account.id);
  if (!verified?.merchantProfile) { sendAuthError(res, 409, "ACCOUNT_STATE_CHANGED", "account state changed"); return; }
  await authPostgresSessionAuthority.revokeAllSessions({ accountId: verified.account.id, accountKind: "merchant", reason: "logout_all" });
  const issued = await authPostgresSessionAuthority.issueSession({ accountId: verified.account.id, accountKind: "merchant", tenantId: verified.merchantProfile.tenantId, accountVersion: verified.account.sessionVersion, deviceId: requestDeviceId(req) || undefined, deviceLabel: requestDeviceLabel(req) });
  setAuthSessionCookie(res, "merchant", issued); res.json({ ok: true, ...payload(verified) });
});
router.post("/login", async (req, res) => {
  if (req.body?.account_type === "admin") { sendAuthError(res, 400, "ADMIN_LOGIN_ENDPOINT_REQUIRED", "use /api/auth/admin/login for administrators"); return; }
  await login(req, res, "merchant");
});
router.post("/admin/login", async (req, res) => { await login(req, res, "admin"); });
router.post("/password-reset/request", async (req, res) => {
  const phone = normalizePhone(req.body?.phone), account = /^07\d{9}$/.test(phone) ? authAccountRepository.findByPhone(phone, "merchant") : null;
  if (!account) { res.status(202).json(genericRecovery()); return; }
  try { const issued = await issueOtp(req, phone, "password_reset"); res.status(202).json({ ...genericRecovery(), challenge_id: issued.challengeId, expires_at: issued.expiresAt, retry_after_seconds: issued.retryAfterSeconds, ...devCode(issued.code) }); }
  catch (error) { otpError(res, error, true); }
});
router.post("/password-reset/confirm", async (req, res) => {
  const phone = normalizePhone(req.body?.phone), challengeId = String(req.body?.challenge_id || ""), code = String(req.body?.code || "");
  const next = String(req.body?.new_password || req.body?.newPassword || ""), confirm = String(req.body?.confirm_password || req.body?.confirmPassword || "");
  const validation = getPasswordValidationError(next);
  if (!challengeId || !/^\d{6}$/.test(code) || validation || next !== confirm) { sendAuthError(res, 400, validation?.code || "RECOVERY_CONFIRMATION_INVALID", validation?.message || "recovery confirmation is invalid"); return; }
  const account = authAccountRepository.findByPhone(phone, "merchant");
  const result = authSecurityStore.verifyOtpChallenge({ challengeId, target: phone, purpose: "password_reset", code, ip: requestIp(req) });
  if (!account || result !== "verified") { sendAuthError(res, 400, "RECOVERY_CONFIRMATION_INVALID", "recovery confirmation is invalid"); return; }
  const passwordHash = hashPassword(next);
  authAccountRepository.updatePassword(account.account.id, "merchant", passwordHash);
  const postgresRevoked = await authPostgresSessionAuthority.commitPasswordChange({ accountId: account.account.id, accountKind: "merchant", passwordHash, reason: "password_reset" });
  if (postgresRevoked === null) {
    authSecurityStore.revokeAllSessions({ accountId: account.account.id, accountKind: "merchant", reason: "password_reset" });
  }
  clearAuthSessionCookie(res, "merchant"); res.json({ ok: true, reauthentication_required: true });
});
export default router;
