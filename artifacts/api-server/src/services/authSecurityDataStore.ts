import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import type { AuthSecurityData, AuthSecurityStoreOptions } from "./authSecurityTypes";

const EMPTY = (): AuthSecurityData => ({
  version: 1, sessions: [], devices: [], otp_challenges: [], login_attempts: [], audit_events: [],
});

export class AuthSecurityDataStore {
  readonly filePath: string; readonly secret: string; readonly now: () => number;
  readonly sessionTtlMs: number; readonly sessionAbsoluteTtlMs: number;
  readonly sessionRotationMs: number; readonly otpTtlMs: number;
  readonly otpResendMs: number; readonly otpMaxAttempts: number;
  constructor(options: AuthSecurityStoreOptions = {}) {
    this.filePath = options.filePath || getFawriDataFilePath("auth-security.json");
    this.secret = options.secret || resolveSecret(); this.now = options.now || Date.now;
    this.sessionTtlMs = options.sessionTtlMs || envInt("FAWRI_SESSION_IDLE_TTL_MS", 8 * 60 * 60 * 1000);
    this.sessionAbsoluteTtlMs = options.sessionAbsoluteTtlMs || envInt("FAWRI_SESSION_ABSOLUTE_TTL_MS", 7 * 24 * 60 * 60 * 1000);
    this.sessionRotationMs = options.sessionRotationMs || envInt("FAWRI_SESSION_ROTATION_MS", 30 * 60 * 1000);
    this.otpTtlMs = options.otpTtlMs || envInt("AUTH_OTP_EXPIRE_MS", 10 * 60 * 1000);
    this.otpResendMs = options.otpResendMs || envInt("AUTH_OTP_RESEND_MS", 60 * 1000);
    this.otpMaxAttempts = options.otpMaxAttempts || envInt("AUTH_OTP_MAX_ATTEMPTS", 5);
  }
  read(): AuthSecurityData {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) return EMPTY();
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<AuthSecurityData>;
      if (value.version !== 1) throw new Error("unsupported schema");
      for (const key of ["sessions", "devices", "otp_challenges", "login_attempts", "audit_events"] as const) {
        if (!Array.isArray(value[key])) throw new Error(`invalid ${key}`);
      }
      return value as AuthSecurityData;
    } catch (error) {
      throw new Error(`Auth security store is corrupt; refusing to reset security state: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  write(data: AuthSecurityData): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }
  fingerprint(domain: string, value: string): string {
    return crypto.createHmac("sha256", this.secret).update(`${domain}:${value}`).digest("base64url");
  }
  token(): { id: string; secret: string; token: string } {
    const id = crypto.randomUUID(), secret = crypto.randomBytes(32).toString("base64url");
    return { id, secret, token: `fs1.${id}.${secret}` };
  }
  clean(data: AuthSecurityData, now = this.now()): void {
    const old = now - 90 * 24 * 60 * 60 * 1000;
    data.sessions = data.sessions.filter((x) => !x.revoked_at || Date.parse(x.revoked_at) >= old);
    data.otp_challenges = data.otp_challenges.filter((x) => Date.parse(x.expires_at) >= now - 24 * 60 * 60 * 1000);
    data.login_attempts = data.login_attempts.filter((x) => Date.parse(x.created_at) >= now - 24 * 60 * 60 * 1000);
    data.audit_events = data.audit_events.filter((x) => Date.parse(x.created_at) >= old).slice(-20_000);
  }
}

export function parseSessionToken(token: string): { id: string; secret: string } | null {
  const [version, id, secret, extra] = String(token || "").split(".");
  return version === "fs1" && /^[0-9a-f-]{36}$/i.test(id || "") && /^[A-Za-z0-9_-]{32,128}$/.test(secret || "") && !extra
    ? { id, secret } : null;
}
function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]); return Number.isInteger(value) && value > 0 ? value : fallback;
}
function resolveSecret(): string {
  const configured = String(process.env.FAWRI_AUTH_SECURITY_SECRET || "");
  if (process.env.NODE_ENV === "production" && configured.length < 32) throw new Error("FAWRI_AUTH_SECURITY_SECRET must contain at least 32 characters");
  return configured || "fawri-local-auth-security-secret-not-for-production";
}
