import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";
import crypto from "node:crypto";
import { authSecurityStore } from "./authSecurityStore";
import type { AcceptedWhatsAppAuthTemplate } from "./authOtpDelivery";
import { productionOtpDeliveryConfigurationReady } from "./authOtpDelivery";
import { isE164Phone } from "./authAccountRepository";
import {
  AuthSecurityStoreError,
  type OtpPurpose,
} from "./authSecurityTypes";
import {
  operationalPostgresAuthorityRequired,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function authSecret(): string {
  const configured = String(process.env.FAWRI_AUTH_SECURITY_SECRET || "");
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error("FAWRI_AUTH_SECURITY_SECRET must contain at least 32 characters");
  }
  return configured || "fawri-local-auth-security-secret-not-for-production";
}

function fingerprint(domain: string, value: string): string {
  return crypto
    .createHmac("sha256", authSecret())
    .update(`${domain}:${value}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function otpTtlMs(): number {
  return envInt("AUTH_OTP_EXPIRE_MS", 10 * 60 * 1000);
}

function otpResendMs(): number {
  return envInt("AUTH_OTP_RESEND_MS", 60 * 1000);
}

function otpMaxAttempts(): number {
  return envInt("AUTH_OTP_MAX_ATTEMPTS", 5);
}

type OtpRow = {
  id: string;
  account_id: string | null;
  target_hash: string;
  code_hash: string;
  ip_hash: string;
  purpose: OtpPurpose;
  created_at: Date;
  expires_at: Date;
  resend_after: Date;
  attempts: number;
  max_attempts: number;
  used_at: Date | null;
  revoked_at: Date | null;
  wa_auth_message_id_hash?: string | null;
  wa_auth_accepted_at?: Date | null;
};

async function lockAuthSecurityKeys(
  client: OperationalSqlClient,
  keys: string[],
): Promise<void> {
  const uniqueKeys = [...new Set(keys)].sort();
  for (const key of uniqueKeys) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [key],
    );
  }
}

async function accountIdForPhone(
  client: OperationalSqlClient,
  phone: string,
  kind: "merchant" | "admin",
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM accounts WHERE kind = $2::account_kind AND phone = $1 LIMIT 1`,
    [phone, kind],
  );
  return result.rows[0]?.id || null;
}

export async function issueMerchantOtpChallengeAuthoritative(input: {
  target: string;
  purpose: OtpPurpose;
  ip: string;
  /** Server-derived Google merchant session account only, never user JSON. */
  googleMerchantAccountId?: string;
}): Promise<{
  challengeId: string;
  code: string;
  expiresAt: string;
  retryAfterSeconds: number;
}> {
  if (input.googleMerchantAccountId) {
    if (!googlePhoneClaimSourceReady() || input.purpose !== "signup" ||
        !isE164Phone(input.target) ||
        !/^merchant-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.googleMerchantAccountId)) {
      throw new Error("GOOGLE_PHONE_CLAIM_NOT_READY");
    }
  }
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore.issueOtpChallenge(input);
  }
  const targetHash = fingerprint("otp-target", input.target);
  const ipHash = fingerprint("ip", input.ip);
  return withAuthenticationTransaction(async (client) => {
    // Serialize issuance for both the target/purpose and source IP before
    // observing rate/cooldown state. Without this, concurrent transactions can
    // all read the same pre-insert state and create multiple live challenges.
    await lockAuthSecurityKeys(client, [
      `otp-target:${targetHash}:${input.purpose}`,
      `otp-ip:${ipHash}`,
      ...(input.googleMerchantAccountId ? [`otp-google-merchant:${input.googleMerchantAccountId}`] : []),
    ]);
    if (input.googleMerchantAccountId) {
      const googleAccount = await client.query<{ id: string }>(
        "SELECT a.id FROM public.accounts a JOIN public.merchants m " +
        "ON m.id=a.id AND m.account_id=a.id " +
        "WHERE a.id=$1 AND a.kind='merchant' AND a.state='active' " +
        "AND a.phone IS NULL AND a.phone_verified=false " +
        "AND a.google_issuer='https://accounts.google.com' " +
        "AND a.google_subject IS NOT NULL " +
        "AND m.account_status IN ('pending_review','approved') FOR UPDATE OF a",
        [input.googleMerchantAccountId],
      );
      if (googleAccount.rows.length !== 1) throw new Error("GOOGLE_PHONE_ACCOUNT_NOT_ELIGIBLE");
      // No Google account may reserve a verified/claimed phone belonging to
      // another merchant or administrator; the final unique index arbitrates races.
      const taken = await client.query<{ id: string }>(
        "SELECT id FROM public.accounts WHERE phone=$1 LIMIT 1 FOR UPDATE",
        [input.target],
      );
      if (taken.rows.length) throw new Error("GOOGLE_PHONE_ALREADY_CLAIMED");
    }
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const targetRecent = await client.query<{
      created_at: Date;
      purpose: OtpPurpose;
      resend_after: Date;
    }>(
      `SELECT created_at, purpose::text AS purpose, resend_after
         FROM auth_otp_challenges
        WHERE target_hash = $1 AND created_at > $2
        ORDER BY created_at`,
      [targetHash, oneHourAgo],
    );
    if (targetRecent.rows.length >= 5) {
      const retry = Math.max(
        1,
        Math.ceil(
          (targetRecent.rows[0].created_at.getTime() + 60 * 60 * 1000 -
            now.getTime()) /
            1000,
        ),
      );
      throw new AuthSecurityStoreError(
        "OTP_TARGET_RATE_LIMITED",
        "verification requests are temporarily limited",
        retry,
      );
    }
    const ipRecent = await client.query<{ created_at: Date }>(
      `SELECT created_at
         FROM auth_otp_challenges
        WHERE ip_hash = $1 AND created_at > $2
        ORDER BY created_at`,
      [ipHash, oneHourAgo],
    );
    if (ipRecent.rows.length >= 20) {
      const retry = Math.max(
        1,
        Math.ceil(
          (ipRecent.rows[0].created_at.getTime() + 60 * 60 * 1000 -
            now.getTime()) /
            1000,
        ),
      );
      throw new AuthSecurityStoreError(
        "OTP_IP_RATE_LIMITED",
        "verification requests are temporarily limited",
        retry,
      );
    }
    const latest = targetRecent.rows
      .filter((row) => row.purpose === input.purpose)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
    if (latest && latest.resend_after.getTime() > now.getTime()) {
      throw new AuthSecurityStoreError(
        "OTP_RESEND_COOLDOWN",
        "verification code resend is not available yet",
        Math.ceil((latest.resend_after.getTime() - now.getTime()) / 1000),
      );
    }

    await client.query(
      `UPDATE auth_otp_challenges
          SET revoked_at = $3
        WHERE target_hash = $1 AND purpose = $2::auth_otp_purpose
          AND used_at IS NULL AND revoked_at IS NULL`,
      [targetHash, input.purpose, now],
    );

    const id = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(now.getTime() + otpTtlMs());
    const resendAfter = new Date(now.getTime() + otpResendMs());
    const accountKind =
      input.purpose === "admin_device_verification" || input.purpose === "admin_recovery"
        ? "admin"
        : "merchant";
    const accountId = input.googleMerchantAccountId ||
      await accountIdForPhone(client, input.target, accountKind);
    await client.query(
      `INSERT INTO auth_otp_challenges
        (id, account_id, target_hash, code_hash, ip_hash, purpose,
         created_at, expires_at, resend_after, attempts, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6::auth_otp_purpose,
               $7, $8, $9, 0, $10)`,
      [
        id,
        accountId,
        targetHash,
        fingerprint("otp-code", `${id}:${code}`),
        ipHash,
        input.purpose,
        now,
        expiresAt,
        resendAfter,
        otpMaxAttempts(),
      ],
    );
    return {
      challengeId: id,
      code,
      expiresAt: expiresAt.toISOString(),
      retryAfterSeconds: Math.ceil(otpResendMs() / 1000),
    };
  });
}


/**
 * Opt-in source-only WhatsApp trial provenance. No production migration/flag
 * is authorized. Only the trusted sender may submit its provider API receipt,
 * and only redemption of the same DB-bound signup OTP may write phone proof.
 * Provider acceptance alone is never OTP verification.
 */
/** Extra opt-in for phone-to-Google binding. Never implies trial activation. */
export function googlePhoneClaimSourceReady(): boolean {
  return process.env.FAWRI_GOOGLE_PHONE_CLAIM_ENABLED === "1" &&
    process.env.FAWRI_GOOGLE_OIDC_HTTP_READY === "1" &&
    process.env.FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED === "1" &&
    whatsappTrialProofSourceReady();
}

export function whatsappTrialProofSourceReady(): boolean {
  return process.env.FAWRI_WHATSAPP_TRIAL_PROOF_SOURCE_ENABLED === "1" &&
    process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY === "required" &&
    operationalPostgresAuthorityRequired() &&
    process.env.NODE_ENV === "production" &&
    process.env.FAWRI_DEPLOYMENT_MODE !== "staging" &&
    productionOtpDeliveryConfigurationReady() &&
    Buffer.byteLength(String(process.env.FAWRI_TRIAL_EVIDENCE_HMAC_SECRET || ""), "utf8") >= 32;
}

function whatsappTrialDigest(scope: string, value: string): string {
  const secret = String(process.env.FAWRI_TRIAL_EVIDENCE_HMAC_SECRET || "");
  if (!whatsappTrialProofSourceReady()) throw new Error("TRIAL_WHATSAPP_PROOF_NOT_READY");
  return crypto.createHmac("sha256", secret).update(scope + ":" + value).digest("base64url");
}

/** Records only the accepted-template API message ID fingerprint, never OTP content. */
export async function recordAcceptedSignupWhatsAppTemplate(input: {
  challengeId: string;
  target: string;
  providerReceipt: AcceptedWhatsAppAuthTemplate;
}): Promise<void> {
  if (!whatsappTrialProofSourceReady()) throw new Error("TRIAL_WHATSAPP_PROOF_NOT_READY");
  const receipt = input?.providerReceipt;
  if (!receipt || typeof receipt.messageId !== "string" ||
      !/^wamid\.[A-Za-z0-9._+\/=-]{8,500}$/.test(receipt.messageId) ||
      receipt.templateName !== String(process.env.WHATSAPP_AUTH_TEMPLATE_NAME || "").trim() ||
      receipt.templateLanguage !== String(process.env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE || "").trim()) {
    throw new Error("TRIAL_WHATSAPP_PROVIDER_RECEIPT_INVALID");
  }
  const messageHash = whatsappTrialDigest("trial-wa-provider-message:v1", receipt.messageId);
  await withAuthenticationTransaction(async client => {
    const checked = await client.query<{
      id: string; account_id: string | null; target_hash: string;
      purpose: string; used_at: Date | null; revoked_at: Date | null;
      expires_at: Date; wa_auth_message_id_hash: string | null; phone: string | null;
      google_issuer: string | null; google_subject: string | null;
      state: string;
    }>(
      "SELECT c.id,c.account_id,c.target_hash,c.purpose::text AS purpose," +
      "c.used_at,c.revoked_at,c.expires_at,c.wa_auth_message_id_hash," +
      "a.phone,a.state,a.google_issuer,a.google_subject " +
      "FROM public.auth_otp_challenges c JOIN public.accounts a " +
      "ON a.id=c.account_id AND a.kind='merchant' " +
      "WHERE c.id=$1 FOR UPDATE OF c,a",
      [input.challengeId],
    );
    const row=checked.rows[0];
    const googleUnbound = Boolean(row && googlePhoneClaimSourceReady() &&
      row.phone === null && row.google_issuer === "https://accounts.google.com" &&
      row.google_subject);
    if (!row || row.purpose !== "signup" ||
        (row.phone !== input.target && !googleUnbound) ||
        row.state !== "active" || row.target_hash !== fingerprint("otp-target", input.target) ||
        row.used_at || row.revoked_at || row.expires_at.getTime() <= Date.now() ||
        row.wa_auth_message_id_hash) {
      throw new Error("TRIAL_WHATSAPP_PROVIDER_RECEIPT_INVALID");
    }
    const recorded=await client.query<{id:string}>(
      "UPDATE public.auth_otp_challenges " +
      "SET wa_auth_message_id_hash=$2,wa_auth_accepted_at=now() " +
      "WHERE id=$1 AND wa_auth_message_id_hash IS NULL RETURNING id",
      [row.id,messageHash],
    );
    if (recorded.rows.length !== 1) throw new Error("TRIAL_WHATSAPP_PROVIDER_RECEIPT_INVALID");
  });
}

export async function verifyMerchantOtpChallengeAuthoritative(input: {
  challengeId: string;
  target: string;
  purpose: OtpPurpose;
  code: string;
  ip: string;
  /** Only from verified Google merchant session in the dedicated route. */
  expectedGoogleAccountId?: string;
}): Promise<"verified" | "invalid" | "expired" | "used" | "locked"> {
  if (input.expectedGoogleAccountId && (!googlePhoneClaimSourceReady() ||
      input.purpose !== "signup" || !isE164Phone(input.target))) {
    throw new Error("GOOGLE_PHONE_CLAIM_NOT_READY");
  }
  const provenanceRequired = process.env.FAWRI_WHATSAPP_TRIAL_PROOF_SOURCE_ENABLED === "1" &&
    input.purpose === "signup";
  if (provenanceRequired && !whatsappTrialProofSourceReady()) {
    throw new Error("TRIAL_WHATSAPP_PROOF_NOT_READY");
  }
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore.verifyOtpChallenge(input);
  }
  return withAuthenticationTransaction(async (client) => {
    const result = await client.query<OtpRow>(
      provenanceRequired
        ? `SELECT id, account_id, target_hash, code_hash, ip_hash,
                  purpose::text AS purpose, created_at, expires_at, resend_after,
                  attempts, max_attempts, used_at, revoked_at,
                  wa_auth_message_id_hash, wa_auth_accepted_at
             FROM auth_otp_challenges WHERE id=$1 FOR UPDATE`
        : `SELECT id, account_id, target_hash, code_hash, ip_hash,
                  purpose::text AS purpose, created_at, expires_at, resend_after,
                  attempts, max_attempts, used_at, revoked_at
             FROM auth_otp_challenges WHERE id=$1 FOR UPDATE`,
      [input.challengeId],
    );
    const challenge = result.rows[0];
    if (
      !challenge ||
      challenge.purpose !== input.purpose ||
      challenge.target_hash !== fingerprint("otp-target", input.target)
    ) {
      return "invalid" as const;
    }
    if (challenge.used_at) return "used" as const;
    if (challenge.revoked_at) return "invalid" as const;
    const now = new Date();
    if (challenge.expires_at.getTime() <= now.getTime()) {
      return "expired" as const;
    }
    if (challenge.attempts >= challenge.max_attempts) {
      return "locked" as const;
    }
    if (provenanceRequired &&
        (!challenge.account_id || !challenge.wa_auth_message_id_hash ||
         !(challenge.wa_auth_accepted_at instanceof Date) ||
         challenge.wa_auth_accepted_at.getTime() < challenge.created_at.getTime() ||
         challenge.wa_auth_accepted_at.getTime() > now.getTime())) {
      return "invalid" as const;
    }
    // Lock the specific account before consuming the OTP. Reassigning a
    // phone or a challenge to another tenant cannot mint trial proof.
    let googleUnbound = false;
    if (provenanceRequired) {
      const binding = await client.query<{
        id: string; phone: string | null;
        google_issuer: string | null; google_subject: string | null;
      }>(
        "SELECT id,phone,google_issuer,google_subject FROM public.accounts " +
        "WHERE id=$1 AND kind='merchant' AND state='active' FOR UPDATE",
        [challenge.account_id],
      );
      const current = binding.rows[0];
      googleUnbound = Boolean(input.expectedGoogleAccountId &&
        input.expectedGoogleAccountId === challenge.account_id &&
        current?.phone === null &&
        current.google_issuer === "https://accounts.google.com" &&
        current.google_subject);
      if (!current || (!googleUnbound &&
          (current.phone !== input.target || Boolean(input.expectedGoogleAccountId)))) {
        return "invalid" as const;
      }
      if (googleUnbound) {
        const taken = await client.query<{id:string}>(
          "SELECT id FROM public.accounts WHERE phone=$1 LIMIT 1 FOR UPDATE",
          [input.target],
        );
        if (taken.rows.length) return "invalid" as const;
      }
    }
    const nextAttempts = challenge.attempts + 1;
    const valid = safeEqual(
      challenge.code_hash,
      fingerprint("otp-code", `${challenge.id}:${input.code}`),
    );
    if (!valid) {
      await client.query(
        `UPDATE auth_otp_challenges SET attempts = $2 WHERE id = $1`,
        [challenge.id, nextAttempts],
      );
      return nextAttempts >= challenge.max_attempts ? "locked" : "invalid";
    }
    await client.query(
      `UPDATE auth_otp_challenges
          SET attempts = $2, used_at = $3
        WHERE id = $1`,
      [challenge.id, nextAttempts, now],
    );
    if (provenanceRequired) {
      const proofHash=whatsappTrialDigest("trial-evidence:verified-phone:v1", input.target);
      const updated=await client.query<{id:string}>(
        "UPDATE public.accounts SET " +
        (googleUnbound ? "phone=$2," : "") +
        "phone_verified=true,phone_verified_at=$3," +
        "trial_wa_proof_hash=$4,trial_wa_proof_verified_at=$3," +
        "trial_wa_proof_challenge_id=$5,updated_at=$3 " +
        "WHERE id=$1 AND kind='merchant' AND state='active' AND " +
        (googleUnbound
          ? "phone IS NULL AND google_issuer='https://accounts.google.com' " +
            "AND google_subject IS NOT NULL "
          : "phone=$2 ") +
        "RETURNING id",
        [challenge.account_id,input.target,now,proofHash,challenge.id],
      );
      if (updated.rows.length !== 1) throw new Error("TRIAL_WHATSAPP_PROOF_ACCOUNT_CHANGED");
    }
    return "verified" as const;
  });
}

export async function revokeMerchantOtpChallengeAuthoritative(
  challengeId: string,
): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    authSecurityStore.revokeOtpChallenge(challengeId);
    return;
  }
  await withAuthenticationTransaction(async (client) => {
    await client.query(
      `UPDATE auth_otp_challenges
          SET revoked_at = now()
        WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
      [challengeId],
    );
  });
}

export async function checkMerchantLoginAllowedAuthoritative(input: {
  target: string;
  accountKind: "merchant" | "admin";
  ip: string;
}): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore.checkLoginAllowed(input);
  }
  const targetHash = fingerprint("login-target", input.target);
  const ipHash = fingerprint("ip", input.ip);
  return withAuthenticationTransaction(async (client) => {
    const now = new Date();
    const since = new Date(now.getTime() - 15 * 60 * 1000);
    const targetFailures = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM login_attempts
        WHERE success = FALSE AND kind = $3::session_kind
          AND target_hash = $1 AND created_at >= $2
        ORDER BY created_at`,
      [targetHash, since, input.accountKind],
    );
    const ipFailures = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM login_attempts
        WHERE success = FALSE AND ip_hash = $1 AND created_at >= $2
        ORDER BY created_at`,
      [ipHash, since],
    );
    if (targetFailures.rows.length < 5 && ipFailures.rows.length < 30) {
      return { allowed: true } as const;
    }
    const earliest = [...targetFailures.rows, ...ipFailures.rows].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime(),
    )[0];
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (earliest.created_at.getTime() + 15 * 60 * 1000 - now.getTime()) /
            1000,
        ),
      ),
    };
  });
}

export async function recordMerchantLoginAttemptAuthoritative(input: {
  target: string;
  accountKind: "merchant" | "admin";
  ip: string;
  success: boolean;
  reason: string;
  accountId?: string;
}): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    authSecurityStore.recordLoginAttempt(input);
    return;
  }
  await withAuthenticationTransaction(async (client) => {
    const now = new Date();
    await client.query(
      `INSERT INTO login_attempts
        (id, account_id, target_hash, kind, ip_hash, success,
         reason_code, created_at, expires_at)
       VALUES ($1, $2, $3, $4::session_kind, $5, $6, $7, $8, $9)`,
      [
        crypto.randomUUID(),
        input.accountId || null,
        fingerprint("login-target", input.target),
        input.accountKind,
        fingerprint("ip", input.ip),
        input.success,
        String(input.reason || "unknown").replace(/\s+/g, " ").slice(0, 120),
        now,
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ],
    );
  });
}
