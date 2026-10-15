import crypto from "node:crypto";

export type AccountKind = "merchant" | "admin";
export type AdminRole = "owner_admin" | "assistant_admin";
export type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";

export type MerchantAccountStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

const PENDING_MERCHANT_EXACT_PATHS = new Set([
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/logout-all",
  "/api/auth/change-password",
  "/api/auth/sessions",
]);

const PENDING_MERCHANT_PREFIXES = [
  "/api/auth/sessions/",
  "/api/auth/onboarding",
  "/api/auth/support",
] as const;

export function isPendingMerchantPathAllowed(
  method: string,
  requestPath: string,
): boolean {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(requestPath || "").split("?", 1)[0];

  if (normalizedMethod === "OPTIONS") return true;
  if (PENDING_MERCHANT_EXACT_PATHS.has(normalizedPath)) return true;

  return PENDING_MERCHANT_PREFIXES.some(
    (prefix) =>
      normalizedPath === prefix.slice(0, -1) ||
      normalizedPath.startsWith(prefix),
  );
}

export function canMerchantAccessPath(input: {
  accountStatus: MerchantAccountStatus;
  method: string;
  requestPath: string;
}): { allowed: true } | { allowed: false; code: string } {
  if (input.accountStatus === "approved") return { allowed: true };

  if (input.accountStatus === "pending_review") {
    return isPendingMerchantPathAllowed(input.method, input.requestPath)
      ? { allowed: true }
      : { allowed: false, code: "MERCHANT_OPERATIONAL_ACCESS_PENDING" };
  }

  if (input.accountStatus === "suspended") {
    return { allowed: false, code: "MERCHANT_ACCOUNT_SUSPENDED" };
  }

  return { allowed: false, code: "MERCHANT_ACCOUNT_REJECTED" };
}

export function assertTenantIsolation(
  sessionTenantId: string,
  requestedTenantId: string | undefined,
): { allowed: true } | { allowed: false; code: "CROSS_TENANT_ACCESS_FORBIDDEN" } {
  const requested = String(requestedTenantId || "").trim();
  if (!requested || requested === sessionTenantId) return { allowed: true };
  return { allowed: false, code: "CROSS_TENANT_ACCESS_FORBIDDEN" };
}

export function hasAdminPermission(
  role: AdminRole,
  grantedPermissions: readonly AdminPermission[],
  requiredPermission: AdminPermission,
): boolean {
  if (role === "owner_admin") return true;
  return grantedPermissions.includes(requiredPermission);
}

export function canManageAdminAccount(input: {
  actorRole: AdminRole;
  targetRole: AdminRole;
  action: "create" | "enable" | "disable" | "permissions" | "sessions" | "devices";
}): boolean {
  if (input.actorRole !== "owner_admin") return false;
  return input.targetRole === "assistant_admin";
}

export function normalizeAdminPermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<AdminPermission>([
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "view_logs",
    "inspect_merchant_sessions",
    "manage_support",
  ]);

  return [...new Set(value.filter((item): item is AdminPermission =>
    typeof item === "string" && allowed.has(item as AdminPermission),
  ))];
}

export type GenericOtpResponse = {
  ok: true;
  message: string;
  retry_after_seconds: number;
  challenge_id: string;
  expires_at: string;
};

export function buildGenericOtpResponse(
  purpose: "signup" | "password_reset",
  nowMs = Date.now(),
): GenericOtpResponse {
  return {
    ok: true,
    message: purpose === "password_reset"
      ? "If the account is eligible, a verification code will be sent."
      : "If verification is eligible, a code will be sent.",
    retry_after_seconds: 60,
    challenge_id: crypto.randomUUID(),
    expires_at: new Date(nowMs + 10 * 60 * 1000).toISOString(),
  };
}
