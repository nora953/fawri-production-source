import crypto from "node:crypto";
import type { Request, Response } from "express";

const RECOVERY_COOKIE = "fawri_merchant_password_recovery";
const RECOVERY_TTL_MS = 20 * 60 * 1000;

export type MerchantPasswordRecoveryProof = {
  version: 1;
  accountId: string;
  passwordVersion: number;
  exp: number;
};

function authSecret(): string {
  const configured = String(process.env.FAWRI_AUTH_SECURITY_SECRET || "");
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error(
      "FAWRI_AUTH_SECURITY_SECRET must contain at least 32 characters",
    );
  }
  return configured || "fawri-local-auth-security-secret-not-for-production";
}

function recoveryCipherKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(`merchant-password-recovery-cookie:${authSecret()}`)
    .digest();
}

function encodeRecoveryProof(
  payload: Omit<MerchantPasswordRecoveryProof, "version" | "exp">,
): string {
  const proof: MerchantPasswordRecoveryProof = {
    version: 1,
    ...payload,
    exp: Date.now() + RECOVERY_TTL_MS,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    recoveryCipherKey(),
    iv,
  );
  const plaintext = Buffer.from(JSON.stringify(proof), "utf8");
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `mpr1.${iv.toString("base64url")}.${ciphertext.toString(
    "base64url",
  )}.${tag.toString("base64url")}`;
}

function decodeRecoveryProof(
  token: string,
): MerchantPasswordRecoveryProof | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== "mpr1") return null;

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");

    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      recoveryCipherKey(),
      iv,
    );
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    const parsed = JSON.parse(
      plaintext,
    ) as Partial<MerchantPasswordRecoveryProof>;

    if (
      parsed.version !== 1 ||
      typeof parsed.accountId !== "string" ||
      !parsed.accountId ||
      !Number.isInteger(parsed.passwordVersion) ||
      Number(parsed.passwordVersion) < 0 ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }

    return parsed as MerchantPasswordRecoveryProof;
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

export function setMerchantPasswordRecoveryProof(
  res: Response,
  input: { accountId: string; passwordVersion: number },
): void {
  res.cookie(RECOVERY_COOKIE, encodeRecoveryProof(input), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/password-reset",
    maxAge: RECOVERY_TTL_MS,
  });
}

export function clearMerchantPasswordRecoveryProof(res: Response): void {
  res.clearCookie(RECOVERY_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/password-reset",
  });
}

export function merchantPasswordRecoveryProof(
  req: Request,
  res: Response,
): MerchantPasswordRecoveryProof | null {
  const token = parseCookies(req)[RECOVERY_COOKIE];
  const proof = token ? decodeRecoveryProof(token) : null;

  if (!proof) {
    clearMerchantPasswordRecoveryProof(res);
    return null;
  }

  return proof;
}
