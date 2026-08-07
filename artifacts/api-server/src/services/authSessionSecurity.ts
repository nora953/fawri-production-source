import crypto from "node:crypto";
import type { AccountKind, AdminPermission, AdminRole } from "./authPolicy";
import { normalizeAdminPermissions } from "./authPolicy";
import { AuthSecurityDataStore, parseSessionToken } from "./authSecurityDataStore";
import type {
  AuthSessionRecord, IssuedSession, PublicAuthSessionRecord,
  SessionRevocationReason, ValidatedSession,
} from "./authSecurityTypes";

export class AuthSessionSecurity {
  constructor(private readonly db: AuthSecurityDataStore) {}

  issue(input: {
    accountId: string; accountKind: AccountKind; tenantId: string; accountVersion?: number;
    adminRole?: AdminRole; permissions?: readonly AdminPermission[];
    deviceId?: string; deviceLabel?: string; absoluteExpiresAt?: string;
  }): IssuedSession {
    const data = this.db.read(), now = this.db.now(); this.db.clean(data, now);
    const active = data.sessions.filter((x) => x.account_id === input.accountId && x.account_kind === input.accountKind && !x.revoked_at && Date.parse(x.idle_expires_at) > now && Date.parse(x.absolute_expires_at) > now);
    const cap = input.accountKind === "admin" ? 2 : 5;
    while (active.length >= cap) {
      const oldest = active.shift()!; oldest.revoked_at = new Date(now).toISOString(); oldest.revoked_reason = "manual_revocation";
    }
    const material = this.db.token(), created = new Date(now).toISOString();
    const absolute = input.absoluteExpiresAt && Date.parse(input.absoluteExpiresAt) > now
      ? input.absoluteExpiresAt : new Date(now + this.db.sessionAbsoluteTtlMs).toISOString();
    const session: AuthSessionRecord = {
      id: material.id,
      token_hash: this.db.fingerprint("session", material.secret),
      account_id: input.accountId,
      account_kind: input.accountKind,
      tenant_id: input.tenantId,
      account_version: Number.isInteger(input.accountVersion) ? Number(input.accountVersion) : 0,
      ...(input.adminRole ? { admin_role: input.adminRole } : {}),
      permissions: normalizeAdminPermissions(input.permissions),
      ...(input.deviceId ? { device_hash: this.db.fingerprint("device", input.deviceId) } : {}),
      device_label: String(input.deviceLabel || "Unknown device").replace(/\s+/g, " ").slice(0, 120),
      created_at: created, last_seen_at: created,
      idle_expires_at: new Date(Math.min(now + this.db.sessionTtlMs, Date.parse(absolute))).toISOString(),
      absolute_expires_at: absolute,
      rotate_after: new Date(now + this.db.sessionRotationMs).toISOString(),
    };
    data.sessions.push(session); this.db.write(data); return { token: material.token, session };
  }

  validate(input: { token: string; expectedKind: AccountKind; deviceId?: string }): ValidatedSession | null {
    const parsed = parseSessionToken(input.token); if (!parsed) return null;
    const data = this.db.read(), now = this.db.now(); this.db.clean(data, now);
    const session = data.sessions.find((x) => x.id === parsed.id);
    if (!session || session.revoked_at || session.account_kind !== input.expectedKind || !safeEqual(session.token_hash, this.db.fingerprint("session", parsed.secret))) return null;
    if (Date.parse(session.idle_expires_at) <= now || Date.parse(session.absolute_expires_at) <= now) {
      session.revoked_at = new Date(now).toISOString(); session.revoked_reason = "expired"; this.db.write(data); return null;
    }
    if (session.device_hash) {
      if (!input.deviceId || !safeEqual(session.device_hash, this.db.fingerprint("device", input.deviceId))) return null;
      const trusted = data.devices.some((x) => x.account_id === session.account_id && x.account_kind === session.account_kind && x.device_hash === session.device_hash && x.status === "trusted");
      if (session.account_kind === "admin" && !trusted) return null;
    }
    session.last_seen_at = new Date(now).toISOString();
    session.idle_expires_at = new Date(Math.min(now + this.db.sessionTtlMs, Date.parse(session.absolute_expires_at))).toISOString();
    this.db.write(data);
    return { session, needsRotation: Date.parse(session.rotate_after) <= now };
  }

  rotate(input: { token: string; expectedKind: AccountKind; deviceId?: string }): IssuedSession | null {
    const valid = this.validate(input); if (!valid) return null;
    const old = valid.session;
    const issued = this.issue({
      accountId: old.account_id, accountKind: old.account_kind, tenantId: old.tenant_id,
      accountVersion: old.account_version, adminRole: old.admin_role,
      permissions: old.permissions, deviceId: input.deviceId,
      deviceLabel: old.device_label, absoluteExpiresAt: old.absolute_expires_at,
    });
    const data = this.db.read(), current = data.sessions.find((x) => x.id === old.id);
    if (!current || current.revoked_at) { this.revoke(issued.token, "manual_revocation"); return null; }
    current.revoked_at = new Date(this.db.now()).toISOString(); current.revoked_reason = "rotated";
    current.replaced_by_session_id = issued.session.id; this.db.write(data); return issued;
  }

  revoke(token: string, reason: SessionRevocationReason): boolean {
    const parsed = parseSessionToken(token); if (!parsed) return false;
    const data = this.db.read(), session = data.sessions.find((x) => x.id === parsed.id);
    if (!session || session.revoked_at || !safeEqual(session.token_hash, this.db.fingerprint("session", parsed.secret))) return false;
    session.revoked_at = new Date(this.db.now()).toISOString(); session.revoked_reason = reason; this.db.write(data); return true;
  }

  revokeById(input: { actorAccountId: string; accountId: string; accountKind: AccountKind; sessionId: string }): boolean {
    if (input.actorAccountId !== input.accountId) return false;
    const data = this.db.read(), session = data.sessions.find((x) => x.id === input.sessionId && x.account_id === input.accountId && x.account_kind === input.accountKind && !x.revoked_at);
    if (!session) return false; session.revoked_at = new Date(this.db.now()).toISOString(); session.revoked_reason = "manual_revocation"; this.db.write(data); return true;
  }

  revokeAll(input: { accountId: string; accountKind: AccountKind; reason: SessionRevocationReason; deviceHash?: string }): number {
    const data = this.db.read(), at = new Date(this.db.now()).toISOString(); let count = 0;
    for (const session of data.sessions) if (session.account_id === input.accountId && session.account_kind === input.accountKind && !session.revoked_at && (!input.deviceHash || session.device_hash === input.deviceHash)) {
      session.revoked_at = at; session.revoked_reason = input.reason; count += 1;
    }
    if (count) this.db.write(data); return count;
  }

  list(accountId: string, kind: AccountKind): PublicAuthSessionRecord[] {
    const data = this.db.read(), now = this.db.now(); this.db.clean(data, now);
    return data.sessions.filter((x) => x.account_id === accountId && x.account_kind === kind && !x.revoked_at && Date.parse(x.idle_expires_at) > now && Date.parse(x.absolute_expires_at) > now)
      .map(({ token_hash: _token, ...safe }) => safe);
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
