import type { AccountKind, AdminPermission, AdminRole } from "./authPolicy";

export const MAX_TRUSTED_DEVICES_PER_ACCOUNT = 2;
export type SessionRevocationReason = "logout" | "logout_all" | "manual_revocation" | "owner_session_replaced" | "password_changed" | "password_reset" | "account_disabled" | "role_changed" | "device_revoked" | "expired" | "rotated";
export type OtpPurpose = "signup" | "password_reset" | "admin_recovery" | "admin_device_verification";
export type AuthSessionRecord = {
  id: string; token_hash: string; account_id: string; account_kind: AccountKind;
  tenant_id: string; account_version: number; admin_role?: AdminRole;
  permissions: AdminPermission[]; device_hash?: string; device_label: string;
  created_at: string; last_seen_at: string; idle_expires_at: string;
  absolute_expires_at: string; rotate_after: string; revoked_at?: string;
  revoked_reason?: SessionRevocationReason; replaced_by_session_id?: string;
};
export type TrustedDeviceRecord = {
  id: string; account_id: string; account_kind: AccountKind; device_hash: string;
  label: string; status: "pending" | "trusted" | "revoked"; created_at: string;
  last_seen_at: string; trusted_at?: string; trusted_by?: string; revoked_at?: string;
};
export type OtpChallengeRecord = {
  id: string; target_hash: string; purpose: OtpPurpose; code_hash: string;
  ip_hash: string; created_at: string; expires_at: string; resend_after: string;
  attempts: number; max_attempts: number; used_at?: string; revoked_at?: string;
};
export type LoginAttemptRecord = {
  id: string; target_hash: string; account_kind: AccountKind; ip_hash: string;
  created_at: string; success: boolean; reason: string; account_id?: string;
};
export type SecurityAuditEvent = {
  id: string; event_type: string; actor_account_id?: string;
  actor_kind?: AccountKind; subject_hash?: string; created_at: string;
  metadata?: Record<string, unknown>;
};
export type AuthSecurityData = {
  version: 1; sessions: AuthSessionRecord[]; devices: TrustedDeviceRecord[];
  otp_challenges: OtpChallengeRecord[]; login_attempts: LoginAttemptRecord[];
  audit_events: SecurityAuditEvent[];
};
export type AuthSecurityStoreOptions = {
  filePath?: string; secret?: string; now?: () => number;
  sessionTtlMs?: number; sessionAbsoluteTtlMs?: number; sessionRotationMs?: number;
  otpTtlMs?: number; otpResendMs?: number; otpMaxAttempts?: number;
};
export type IssuedSession = { token: string; session: AuthSessionRecord };
export type ValidatedSession = { session: AuthSessionRecord; needsRotation: boolean };
export type PublicAuthSessionRecord = Omit<AuthSessionRecord, "token_hash">;

export class AuthSecurityStoreError extends Error {
  readonly code: string;
  readonly retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) {
    super(`${code}: ${message}`); this.name = "AuthSecurityStoreError"; this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
