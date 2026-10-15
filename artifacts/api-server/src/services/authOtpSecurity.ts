import crypto from "node:crypto";
import type { AccountKind } from "./authPolicy";
import { AuthSecurityDataStore } from "./authSecurityDataStore";
import { AuthSecurityStoreError, type OtpPurpose, type SecurityAuditEvent } from "./authSecurityTypes";

export class AuthOtpSecurity {
  constructor(private readonly db: AuthSecurityDataStore) {}
  issue(input: { target: string; purpose: OtpPurpose; ip: string }) {
    const data = this.db.read(), now = this.db.now(); this.db.clean(data, now);
    const targetHash = this.db.fingerprint("otp-target", input.target), ipHash = this.db.fingerprint("ip", input.ip);
    const recentTarget = data.otp_challenges.filter((x) => x.target_hash === targetHash && Date.parse(x.created_at) > now - 60 * 60 * 1000);
    const recentIp = data.otp_challenges.filter((x) => x.ip_hash === ipHash && Date.parse(x.created_at) > now - 60 * 60 * 1000);
    if (recentTarget.length >= 5) throw new AuthSecurityStoreError("OTP_TARGET_RATE_LIMITED", "verification requests are temporarily limited", secondsUntil(recentTarget[0].created_at, now));
    if (recentIp.length >= 20) throw new AuthSecurityStoreError("OTP_IP_RATE_LIMITED", "verification requests are temporarily limited", secondsUntil(recentIp[0].created_at, now));
    const latest = [...recentTarget].filter((x) => x.purpose === input.purpose).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (latest && Date.parse(latest.resend_after) > now) throw new AuthSecurityStoreError("OTP_RESEND_COOLDOWN", "verification code resend is not available yet", Math.ceil((Date.parse(latest.resend_after) - now) / 1000));
    for (const challenge of data.otp_challenges) if (challenge.target_hash === targetHash && challenge.purpose === input.purpose && !challenge.used_at && !challenge.revoked_at) challenge.revoked_at = new Date(now).toISOString();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"), id = crypto.randomUUID();
    const expiresAt = new Date(now + this.db.otpTtlMs).toISOString(), resendAfter = new Date(now + this.db.otpResendMs).toISOString();
    data.otp_challenges.push({ id, target_hash: targetHash, purpose: input.purpose, code_hash: this.db.fingerprint("otp-code", `${id}:${code}`), ip_hash: ipHash, created_at: new Date(now).toISOString(), expires_at: expiresAt, resend_after: resendAfter, attempts: 0, max_attempts: this.db.otpMaxAttempts });
    this.db.write(data); return { challengeId: id, code, expiresAt, retryAfterSeconds: Math.ceil(this.db.otpResendMs / 1000) };
  }
  verify(input: { challengeId: string; target: string; purpose: OtpPurpose; code: string; ip: string }): "verified" | "invalid" | "expired" | "used" | "locked" {
    const data = this.db.read(), now = this.db.now(), challenge = data.otp_challenges.find((x) => x.id === input.challengeId);
    if (!challenge || challenge.purpose !== input.purpose || challenge.target_hash !== this.db.fingerprint("otp-target", input.target)) return "invalid";
    if (challenge.used_at) return "used"; if (challenge.revoked_at) return "invalid";
    if (Date.parse(challenge.expires_at) <= now) return "expired";
    if (challenge.attempts >= challenge.max_attempts) return "locked";
    const valid = safeEqual(challenge.code_hash, this.db.fingerprint("otp-code", `${challenge.id}:${input.code}`));
    challenge.attempts += 1;
    if (!valid) { this.db.write(data); return challenge.attempts >= challenge.max_attempts ? "locked" : "invalid"; }
    challenge.used_at = new Date(now).toISOString(); this.db.write(data); return "verified";
  }
  revoke(challengeId: string): void { const data = this.db.read(), item = data.otp_challenges.find((x) => x.id === challengeId); if (item && !item.used_at) { item.revoked_at = new Date(this.db.now()).toISOString(); this.db.write(data); } }
  checkLogin(input: { target: string; accountKind: AccountKind; ip: string }): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const data = this.db.read(), now = this.db.now(), target = this.db.fingerprint("login-target", input.target), ip = this.db.fingerprint("ip", input.ip), since = now - 15 * 60 * 1000;
    const targetFailures = data.login_attempts.filter((x) => !x.success && x.account_kind === input.accountKind && x.target_hash === target && Date.parse(x.created_at) >= since);
    const ipFailures = data.login_attempts.filter((x) => !x.success && x.ip_hash === ip && Date.parse(x.created_at) >= since);
    if (targetFailures.length < 5 && ipFailures.length < 30) return { allowed: true };
    const earliest = [...targetFailures, ...ipFailures].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(earliest.created_at) + 15 * 60 * 1000 - now) / 1000)) };
  }
  recordLogin(input: { target: string; accountKind: AccountKind; ip: string; success: boolean; reason: string; accountId?: string }): void {
    const data = this.db.read(); data.login_attempts.push({ id: crypto.randomUUID(), target_hash: this.db.fingerprint("login-target", input.target), account_kind: input.accountKind, ip_hash: this.db.fingerprint("ip", input.ip), created_at: new Date(this.db.now()).toISOString(), success: input.success, reason: clean(input.reason), ...(input.accountId ? { account_id: input.accountId } : {}) }); this.db.clean(data); this.db.write(data);
  }
  audit(input: Omit<SecurityAuditEvent, "id" | "created_at">): void {
    const data = this.db.read(); data.audit_events.push({ ...input, id: crypto.randomUUID(), created_at: new Date(this.db.now()).toISOString(), ...(input.metadata ? { metadata: sanitize(input.metadata) } : {}) }); this.db.clean(data); this.db.write(data);
  }
  auditEvents(): SecurityAuditEvent[] { return this.db.read().audit_events.map((x) => ({ ...x, ...(x.metadata ? { metadata: { ...x.metadata } } : {}) })); }
}
function secondsUntil(createdAt: string, now: number): number { return Math.max(1, Math.ceil((Date.parse(createdAt) + 60 * 60 * 1000 - now) / 1000)); }
function safeEqual(a: string, b: string): boolean { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function clean(value: string): string { return String(value || "").replace(/\s+/g, " ").slice(0, 120); }
function sanitize(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(password|otp|code|token|secret|hash|cookie|authorization)/i.test(key)) continue;
    if (item && typeof item === "object" && !Array.isArray(item)) out[key] = sanitize(item as Record<string, unknown>);
    else if (["string", "number", "boolean"].includes(typeof item) || item === null) out[key] = item;
  }
  return out;
}
