import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { normalizePhone } from "../services/authAccountRepository";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import {
  OwnerRecoveryError,
  completeOwnerRecovery,
  ensureOwnerRecoveryPhoneAvailable,
  generateOwnerRecoveryBundle,
  getOwnerRecoveryStatus,
  ownerRecoveryFingerprint,
  verifyOwnerRecoveryKey1,
  verifyOwnerRecoveryOldPhone,
} from "../services/ownerBreakGlassRecoveryAuthority";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  checkMerchantLoginAllowedAuthoritative,
  recordMerchantLoginAttemptAuthoritative,
  verifyMerchantOtpChallengeAuthoritative,
} from "../services/postgresMerchantAuthSecurityAuthority";
import {
  requestIp,
  sendAuthError,
} from "../middleware/authSession";
import { devCode, issueOtp, otpError, ownerContext } from "./auth-route-common";

const router = Router();
const RECOVERY_COOKIE = "fawri_owner_recovery";
const RECOVERY_TTL_MS = 20 * 60 * 1000;

type RecoveryStage = "key1_verified" | "otp_pending" | "otp_verified";

type RecoveryProof = {
  version: 1;
  stage: RecoveryStage;
  ownerId: string;
  recoveryIdHash: string;
  oldPhoneHash: string;
  generation: string;
  newPhone?: string;
  challengeId?: string;
  exp: number;
};

router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (
    !operationalPostgresAuthorityRequired() ||
    !authPostgresSessionAuthority.enabled("admin")
  ) {
    next("router");
    return;
  }
  next();
});

function authSecret(): string {
  const configured = String(process.env.FAWRI_AUTH_SECURITY_SECRET || "");
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error("FAWRI_AUTH_SECURITY_SECRET must contain at least 32 characters");
  }
  return configured || "fawri-local-auth-security-secret-not-for-production";
}

function recoveryCipherKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(`owner-recovery-cookie:${authSecret()}`)
    .digest();
}

function encodeRecoveryProof(payload: Omit<RecoveryProof, "exp">): string {
  const proof: RecoveryProof = {
    ...payload,
    exp: Date.now() + RECOVERY_TTL_MS,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", recoveryCipherKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(proof), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `or1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

function decodeRecoveryProof(token: string): RecoveryProof | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== "or1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", recoveryCipherKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<RecoveryProof>;
    if (
      parsed.version !== 1 ||
      !["key1_verified", "otp_pending", "otp_verified"].includes(
        String(parsed.stage),
      ) ||
      typeof parsed.ownerId !== "string" ||
      typeof parsed.recoveryIdHash !== "string" ||
      typeof parsed.oldPhoneHash !== "string" ||
      typeof parsed.generation !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return parsed as RecoveryProof;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = String(req.headers.cookie || "");
  const result: Record<string, string> = {};
  for (const segment of header.split(";")) {
    const index = segment.indexOf("=");
    if (index <= 0) continue;
    const name = segment.slice(0, index).trim();
    const value = segment.slice(index + 1).trim();
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

function setRecoveryCookie(res: Response, proof: Omit<RecoveryProof, "exp">): void {
  res.cookie(RECOVERY_COOKIE, encodeRecoveryProof(proof), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/owner-recovery",
    maxAge: RECOVERY_TTL_MS,
  });
}

function clearRecoveryCookie(res: Response): void {
  res.clearCookie(RECOVERY_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/owner-recovery",
  });
}

function recoveryProof(req: Request, res: Response, recoveryId: string): RecoveryProof | null {
  const token = parseCookies(req)[RECOVERY_COOKIE];
  const proof = token ? decodeRecoveryProof(token) : null;
  if (
    !proof ||
    proof.recoveryIdHash !== ownerRecoveryFingerprint("recovery-id", recoveryId)
  ) {
    clearRecoveryCookie(res);
    sendAuthError(
      res,
      401,
      "OWNER_RECOVERY_SESSION_INVALID",
      "owner recovery session is invalid or expired",
    );
    return null;
  }
  return proof;
}

async function rateLimit(
  req: Request,
  res: Response,
  target: string,
): Promise<boolean> {
  const allowed = await checkMerchantLoginAllowedAuthoritative({
    target,
    accountKind: "admin",
    ip: requestIp(req),
  });
  if (allowed.allowed) return true;
  res.setHeader("Retry-After", String(allowed.retryAfterSeconds));
  sendAuthError(
    res,
    429,
    "OWNER_RECOVERY_RATE_LIMITED",
    "too many owner recovery attempts",
    { retry_after_seconds: allowed.retryAfterSeconds },
  );
  return false;
}

async function recordAttempt(input: {
  req: Request;
  target: string;
  success: boolean;
  reason: string;
  accountId?: string;
}): Promise<void> {
  await recordMerchantLoginAttemptAuthoritative({
    target: input.target,
    accountKind: "admin",
    ip: requestIp(input.req),
    success: input.success,
    reason: input.reason,
    ...(input.accountId ? { accountId: input.accountId } : {}),
  });
}

function recoveryError(res: Response, error: unknown): void {
  if (error instanceof OwnerRecoveryError) {
    sendAuthError(res, error.status, error.code, error.message);
    return;
  }
  sendAuthError(
    res,
    500,
    "OWNER_RECOVERY_FAILURE",
    "owner recovery operation failed",
  );
}

router.get("/admin/owner-recovery/status", async (_req, res) => {
  const owner = ownerContext(res);
  if (!owner) return;
  try {
    res.json({
      ok: true,
      ...(await getOwnerRecoveryStatus(owner.account.id)),
    });
  } catch (error) {
    recoveryError(res, error);
  }
});

router.post("/admin/owner-recovery/generate", async (_req, res) => {
  const owner = ownerContext(res);
  if (!owner) return;
  try {
    const bundle = await generateOwnerRecoveryBundle(owner.account.id);
    res.status(201).json({
      ok: true,
      recovery_path: bundle.recovery_path,
      key_1: bundle.key_1,
      key_2: bundle.key_2,
      created_at: bundle.created_at,
      display_once: true,
    });
  } catch (error) {
    recoveryError(res, error);
  }
});

router.post("/owner-recovery/:recoveryId/start", async (req, res) => {
  const recoveryId = String(req.params.recoveryId || "").trim();
  const key1 = String(req.body?.key_1 || "").trim();
  const target = `owner-recovery:${recoveryId}`;
  if (!/^[0-9a-f]{48}$/.test(recoveryId) || !/^[0-9a-f]{64}$/.test(key1)) {
    await recordAttempt({ req, target, success: false, reason: "owner_recovery_start_invalid" });
    sendAuthError(res, 401, "OWNER_RECOVERY_INVALID", "owner recovery credentials are invalid");
    return;
  }
  if (!(await rateLimit(req, res, target))) return;
  try {
    const verified = await verifyOwnerRecoveryKey1({
      recoveryId,
      key1,
    });
    await recordAttempt({
      req,
      target,
      success: true,
      reason: "owner_recovery_key1_verified",
      accountId: verified.owner_id,
    });
    setRecoveryCookie(res, {
      version: 1,
      stage: "key1_verified",
      ownerId: verified.owner_id,
      recoveryIdHash: verified.recovery_id_hash,
      oldPhoneHash: verified.old_phone_hash,
      generation: verified.generation,
    });
    res.json({ ok: true, next: "verify_owner_and_new_phone" });
  } catch (error) {
    await recordAttempt({ req, target, success: false, reason: "owner_recovery_key1_invalid" });
    recoveryError(res, error);
  }
});

router.post("/owner-recovery/:recoveryId/otp/request", async (req, res) => {
  const recoveryId = String(req.params.recoveryId || "").trim();
  const proof = recoveryProof(req, res, recoveryId);
  if (!proof || proof.stage !== "key1_verified") return;
  const oldPhone = normalizePhone(req.body?.old_phone);
  const newPhone = normalizePhone(req.body?.new_phone);
  const confirmPhone = normalizePhone(req.body?.confirm_new_phone);
  if (
    !/^07\d{9}$/.test(oldPhone) ||
    !/^07\d{9}$/.test(newPhone) ||
    newPhone !== confirmPhone
  ) {
    sendAuthError(
      res,
      400,
      "OWNER_RECOVERY_PHONE_INPUT_INVALID",
      "owner recovery phone confirmation is invalid",
    );
    return;
  }
  const oldPhoneTarget = `owner-recovery-old-phone:${proof.recoveryIdHash}`;
  if (!(await rateLimit(req, res, oldPhoneTarget))) return;
  try {
    await verifyOwnerRecoveryOldPhone({
      ownerId: proof.ownerId,
      oldPhoneHash: proof.oldPhoneHash,
      generation: proof.generation,
      oldPhone,
    });
    await ensureOwnerRecoveryPhoneAvailable({ ownerId: proof.ownerId, newPhone });
    const issued = await issueOtp(req, newPhone, "admin_recovery");
    await recordAttempt({
      req,
      target: oldPhoneTarget,
      success: true,
      reason: "owner_recovery_old_phone_verified",
      accountId: proof.ownerId,
    });
    setRecoveryCookie(res, {
      version: 1,
      stage: "otp_pending",
      ownerId: proof.ownerId,
      recoveryIdHash: proof.recoveryIdHash,
      oldPhoneHash: proof.oldPhoneHash,
      generation: proof.generation,
      newPhone,
      challengeId: issued.challengeId,
    });
    res.status(202).json({
      ok: true,
      challenge_id: issued.challengeId,
      expires_at: issued.expiresAt,
      retry_after_seconds: issued.retryAfterSeconds,
      ...devCode(issued.code),
    });
  } catch (error) {
    await recordAttempt({
      req,
      target: oldPhoneTarget,
      success: false,
      reason: "owner_recovery_phone_verification_failed",
      accountId: proof.ownerId,
    });
    if (error instanceof OwnerRecoveryError) {
      recoveryError(res, error);
      return;
    }
    otpError(res, error);
  }
});

router.post("/owner-recovery/:recoveryId/otp/verify", async (req, res) => {
  const recoveryId = String(req.params.recoveryId || "").trim();
  const proof = recoveryProof(req, res, recoveryId);
  if (!proof || proof.stage !== "otp_pending" || !proof.newPhone || !proof.challengeId) return;
  const code = String(req.body?.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    sendAuthError(res, 400, "OTP_INVALID", "verification code is invalid or expired");
    return;
  }
  const result = await verifyMerchantOtpChallengeAuthoritative({
    challengeId: proof.challengeId,
    target: proof.newPhone,
    purpose: "admin_recovery",
    code,
    ip: requestIp(req),
  });
  if (result !== "verified") {
    sendAuthError(res, 400, "OTP_INVALID", "verification code is invalid or expired");
    return;
  }
  setRecoveryCookie(res, {
    version: 1,
    stage: "otp_verified",
    ownerId: proof.ownerId,
    recoveryIdHash: proof.recoveryIdHash,
    oldPhoneHash: proof.oldPhoneHash,
    generation: proof.generation,
    newPhone: proof.newPhone,
  });
  res.json({ ok: true, next: "confirm_recovery" });
});

router.post("/owner-recovery/:recoveryId/complete", async (req, res) => {
  const recoveryId = String(req.params.recoveryId || "").trim();
  const proof = recoveryProof(req, res, recoveryId);
  if (!proof || proof.stage !== "otp_verified" || !proof.newPhone) return;
  const target = `owner-recovery-key2:${proof.recoveryIdHash}`;
  if (!(await rateLimit(req, res, target))) return;
  const key2 = String(req.body?.key_2 || "").trim();
  const mode = req.body?.forgot_password === true ? "reset_password" : "current_password";
  if (!/^[0-9a-f]{64}$/.test(key2)) {
    await recordAttempt({
      req,
      target,
      success: false,
      reason: "owner_recovery_key2_invalid",
      accountId: proof.ownerId,
    });
    sendAuthError(res, 401, "OWNER_RECOVERY_INVALID", "owner recovery credentials are invalid");
    return;
  }
  try {
    const result = await completeOwnerRecovery({
      ownerId: proof.ownerId,
      recoveryIdHash: proof.recoveryIdHash,
      oldPhoneHash: proof.oldPhoneHash,
      generation: proof.generation,
      newPhone: proof.newPhone,
      key2,
      mode,
      currentPassword: String(req.body?.current_password || ""),
      newPassword: String(req.body?.new_password || ""),
      confirmNewPassword: String(req.body?.confirm_new_password || ""),
    });
    await recordAttempt({
      req,
      target,
      success: true,
      reason: result.password_reset
        ? "owner_recovery_phone_password_completed"
        : "owner_recovery_phone_completed",
      accountId: proof.ownerId,
    });
    clearRecoveryCookie(res);
    res.json({
      ok: true,
      recovered: true,
      password_reset: result.password_reset,
      all_sessions_revoked: true,
      all_devices_revoked: true,
      recovery_keys_consumed: true,
      next: "login_with_new_phone",
    });
  } catch (error) {
    await recordAttempt({
      req,
      target,
      success: false,
      reason: "owner_recovery_completion_failed",
      accountId: proof.ownerId,
    });
    recoveryError(res, error);
  }
});

export default router;
