import type { AccountKind, AdminPermission, AdminRole } from "./authPolicy";
import { AuthSecurityDataStore } from "./authSecurityDataStore";
import { AuthDeviceSecurity } from "./authDeviceSecurity";
import { AuthOtpSecurity } from "./authOtpSecurity";
import { AuthSessionSecurity } from "./authSessionSecurity";
import type { AuthSecurityStoreOptions, OtpPurpose, SecurityAuditEvent, SessionRevocationReason } from "./authSecurityTypes";
export { AuthSecurityStoreError, MAX_TRUSTED_DEVICES_PER_ACCOUNT } from "./authSecurityTypes";
export type { AuthSessionRecord, IssuedSession, OtpPurpose, PublicAuthSessionRecord, SecurityAuditEvent, TrustedDeviceRecord, ValidatedSession } from "./authSecurityTypes";

export class AuthSecurityStore {
  private readonly data: AuthSecurityDataStore;
  private readonly sessions: AuthSessionSecurity;
  private readonly devices: AuthDeviceSecurity;
  private readonly otp: AuthOtpSecurity;
  constructor(options: AuthSecurityStoreOptions = {}) {
    this.data = new AuthSecurityDataStore(options);
    this.sessions = new AuthSessionSecurity(this.data);
    this.devices = new AuthDeviceSecurity(this.data);
    this.otp = new AuthOtpSecurity(this.data);
  }
  issueSession(input: { accountId: string; accountKind: AccountKind; tenantId: string; accountVersion?: number; adminRole?: AdminRole; permissions?: readonly AdminPermission[]; deviceId?: string; deviceLabel?: string; absoluteExpiresAt?: string }) { return this.sessions.issue(input); }
  validateSession(input: { token: string; expectedKind: AccountKind; deviceId?: string }) { return this.sessions.validate(input); }
  rotateSession(input: { token: string; expectedKind: AccountKind; deviceId?: string }) { return this.sessions.rotate(input); }
  revokeSession(token: string, reason: SessionRevocationReason) { return this.sessions.revoke(token, reason); }
  revokeSessionById(input: { actorAccountId: string; accountId: string; accountKind: AccountKind; sessionId: string }) { return this.sessions.revokeById(input); }
  revokeAllSessions(input: { accountId: string; accountKind: AccountKind; reason: SessionRevocationReason; deviceHash?: string }) { return this.sessions.revokeAll(input); }
  listActiveSessions(accountId: string, kind: AccountKind) { return this.sessions.list(accountId, kind); }
  registerDevice(input: { accountId: string; accountKind: AccountKind; deviceId: string; deviceLabel: string }) { return this.devices.register(input); }
  isDeviceTrusted(accountId: string, kind: AccountKind, deviceId: string) { return this.devices.trusted(accountId, kind, deviceId); }
  setDeviceTrust(input: { deviceRecordId: string; trusted: boolean; actorAccountId: string }) { return this.devices.setTrust(input); }
  listDevices(accountId?: string) { return this.devices.list(accountId); }
  issueOtpChallenge(input: { target: string; purpose: OtpPurpose; ip: string }) { return this.otp.issue(input); }
  verifyOtpChallenge(input: { challengeId: string; target: string; purpose: OtpPurpose; code: string; ip: string }) { return this.otp.verify(input); }
  revokeOtpChallenge(challengeId: string) { this.otp.revoke(challengeId); }
  checkLoginAllowed(input: { target: string; accountKind: AccountKind; ip: string }) { return this.otp.checkLogin(input); }
  recordLoginAttempt(input: { target: string; accountKind: AccountKind; ip: string; success: boolean; reason: string; accountId?: string }) { this.otp.recordLogin(input); }
  audit(input: Omit<SecurityAuditEvent, "id" | "created_at">) { this.otp.audit(input); }
  readAuditEvents() { return this.otp.auditEvents(); }
}
export const authSecurityStore = new AuthSecurityStore();
