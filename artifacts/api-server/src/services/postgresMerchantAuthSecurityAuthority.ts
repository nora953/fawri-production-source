import crypto from "node:crypto";
import { authSecurityStore } from "./authSecurityStore";
import {
  AuthSecurityStoreError,
  type OtpPurpose,
} from "./authSecurityTypes";
import {
  operationalPostgresAuthorityRequired,
  withOperationalTransaction,
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
};

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
}): Promise<{
  challengeId: string;
  code: string;
  expiresAt: string;
  retryAfterSeconds: number;
}> {
  if (
    !operationalPostgresAuthorityRequired() ||
    input.purpose === "admin_recovery"
  ) {
    return authSecurityStore.issueOtpChallenge(input);
  }
  const targetHash = fingerprint("otp-target", input.target);
  const ipHash = fingerprint("ip", input.ip);
  return withOperationalTransaction(async (client) => {
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
    const accountKind = input.purpose === "admin_device_verification" ? "admin" : "merchant";
    const accountId = await accountIdForPhone(client, input.target, accountKind);
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

export async function verifyMerchantOtpChallengeAuthoritative(input: {
  challengeId: string;
  target: string;
  purpose: OtpPurpose;
  code: string;
  ip: string;
}): Promise<"verified" | "invalid" | "expired" | "used" | "locked"> {
  if (
    !operationalPostgresAuthorityRequired() ||
    input.purpose === "admin_recovery"
  ) {
    return authSecurityStore.verifyOtpChallenge(input);
  }
  return withOperationalTransaction(async (client) => {
    const result = await client.query<OtpRow>(
      `SELECT id, account_id, target_hash, code_hash, ip_hash,
              purpose::text AS purpose, created_at, expires_at, resend_after,
              attempts, max_attempts, used_at, revoked_at
         FROM auth_otp_challenges
        WHERE id = $1
        FOR UPDATE`,
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
  await withOperationalTransaction(async (client) => {
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
  return withOperationalTransaction(async (client) => {
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
  await withOperationalTransaction(async (client) => {
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
