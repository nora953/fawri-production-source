import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import crypto from "node:crypto";
import {
  calculateRetentionStatus,
  deleteMerchant,
  MerchantDeleteReason,
  MerchantRetentionStatus,
} from "../services/merchantLifecycle";
import { registerMerchantAuthDeletion } from "../services/merchantAuthData";
import {
  registerMerchantRetentionUpdate,
  startMerchantRetentionScheduler,
} from "../services/merchantRetentionScheduler";
import {
  AdminManagementError,
  createAssistantAdmin,
  listAdmins,
  setAssistantAdminEnabled,
  updateAssistantAdminPermissions,
  registerAdminManagement,
  type AdminSummary,
} from "../services/adminManagement";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/passwordService";
import {
  AdminWorkMonitorError,
  adminDeviceSecurityEnforced,
  approveAdminTrustedDevice,
  createAdminTrackedSession,
  getAdminCardSecuritySummary,
  getAdminWorkMonitor,
  isAdminDeviceTrusted,
  normalizeAdminDeviceId,
  recordAdminFailedLogin,
  registerAdminDeviceAttempt,
  revokeAdminTrackedSession,
  revokeAdminTrustedDevice,
  revokeAllAdminTrackedSessions,
  touchAdminTrackedSession,
  validateAdminTrackedSession,
  type AdminTrackedSession,
} from "../services/adminWorkMonitor";
import { ADMIN_SESSION_SECRET, ADMIN_SESSION_TTL_MS, MERCHANT_OAUTH_STATE_TTL_MS, MERCHANT_SESSION_COOKIE, MERCHANT_SESSION_SECRET, MERCHANT_SESSION_TTL_MS, OTP_EXPIRE_MINUTES, SUBSCRIPTION_PLAN_CONFIG, addBaghdadCalendarMonths, compareAddonReplyBatches, getBaghdadDateParts, makeId, normalizeAdminSessionVersion, normalizeAssistantPermissions } from './authRuntimePart1';
import type { AccountStatus, AddonReplyBatch, AdminPermission, AdminSessionPayload, Lang, Merchant, MerchantOAuthStatePayload, MerchantSessionPayload, MerchantStatus, OnboardingStatus, OtpRecord, RequestedPlan, SafeMerchant, SignupSource, SubscriptionPlan, SubscriptionRecord, SubscriptionStatus, TrialStatus } from './authRuntimePart1';

export function normalizeAddonReplyBatches(
  value: unknown,
  currentDate: Date = new Date(),
): AddonReplyBatch[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Partial<AddonReplyBatch>;
      const purchasedAt = new Date(String(record.purchased_at || ""));
      const expiresAt = new Date(String(record.expires_at || ""));
      const amount = normalizeNonNegativeInteger(record.amount);
      const remaining = Math.min(normalizeNonNegativeInteger(record.remaining), amount);
      const id = String(record.id || "").trim();
      const source = record.source === "emergency" ? "emergency" : "purchase";
      const expiryReminderSentAt =
        typeof record.expiry_reminder_sent_at === "string" &&
        record.expiry_reminder_sent_at.trim()
          ? record.expiry_reminder_sent_at
          : undefined;

      if (
        !id ||
        amount <= 0 ||
        remaining <= 0 ||
        !Number.isFinite(purchasedAt.getTime()) ||
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= currentDate.getTime()
      ) {
        return null;
      }

      return {
        id,
        source,
        purchased_at: purchasedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount,
        remaining,
        ...(expiryReminderSentAt
          ? { expiry_reminder_sent_at: expiryReminderSentAt }
          : {}),
      };
    })
    .filter((item): item is AddonReplyBatch => item !== null)
    .sort(compareAddonReplyBatches);
}

export function recalculateSubscriptionTotals(
  subscription: SubscriptionRecord,
  currentDate: Date = new Date(),
): SubscriptionRecord {
  subscription.addon_reply_batches = normalizeAddonReplyBatches(
    subscription.addon_reply_batches,
    currentDate,
  );
  subscription.addon_replies_remaining = subscription.addon_reply_batches.reduce(
    (total, batch) => total + batch.remaining,
    0,
  );
  subscription.base_replies_used = Math.min(
    subscription.base_reply_limit,
    Math.max(0, subscription.base_replies_used),
  );
  subscription.base_replies_remaining = Math.max(
    0,
    subscription.base_reply_limit - subscription.base_replies_used,
  );
  subscription.emergency_credit_remaining = 0;
  subscription.emergency_credit_used = subscription.emergency_credit_activated
    ? subscription.emergency_credit_amount
    : 0;
  subscription.emergency_debt = Math.max(0, subscription.emergency_debt);
  subscription.pending_next_cycle_deduction = subscription.emergency_debt;
  subscription.replies_used =
    subscription.base_replies_used +
    subscription.addon_reply_batches.reduce(
      (total, batch) => total + (batch.amount - batch.remaining),
      0,
    );
  subscription.replies_remaining =
    subscription.base_replies_remaining +
    subscription.addon_replies_remaining;
  subscription.reply_limit = subscription.replies_used + subscription.replies_remaining;

  const expired = new Date(subscription.expires_at).getTime() <= currentDate.getTime();
  if (subscription.status !== "suspended") {
    subscription.status = expired
      ? "expired"
      : subscription.replies_remaining <= 0
        ? "replies_exhausted"
        : "active";
  }
  if (subscription.status !== "active") subscription.auto_reply_enabled = false;

  return subscription;
}

export function purchaseAdditionalReplies(
  subscription: SubscriptionRecord,
  amount: number,
  purchasedAt: Date = new Date(),
): {
  debtPaid: number;
  addonAdded: number;
  addonBatch?: AddonReplyBatch;
} {
  const debtPaid = Math.min(subscription.emergency_debt, amount);
  subscription.emergency_debt -= debtPaid;
  subscription.pending_next_cycle_deduction = subscription.emergency_debt;
  const addonAdded = amount - debtPaid;
  let addonBatch: AddonReplyBatch | undefined;

  if (addonAdded > 0) {
    const anchorDay = getBaghdadDateParts(purchasedAt).day;
    addonBatch = {
      id: makeId("addon-replies"),
      source: "purchase",
      purchased_at: purchasedAt.toISOString(),
      expires_at: addBaghdadCalendarMonths(
        purchasedAt,
        3,
        anchorDay,
      ).toISOString(),
      amount: addonAdded,
      remaining: addonAdded,
    };
    subscription.addon_reply_batches.push(addonBatch);
  }

  recalculateSubscriptionTotals(subscription, purchasedAt);
  return { debtPaid, addonAdded, addonBatch };
}

export function resolveOwnerAdminId(merchants: Merchant[]): string | null {
  const admins = merchants.filter((merchant) => merchant.is_admin === true);
  if (admins.length === 0) return null;

  const configuredOwnerPhone = normalizePhone(
    process.env.FAWRI_ADMIN_PHONE || "",
  );

  if (configuredOwnerPhone) {
    const configuredOwner = admins.find(
      (admin) => normalizePhone(admin.phone) === configuredOwnerPhone,
    );

    if (!configuredOwner) {
      throw new Error(
        "FAWRI_ADMIN_PHONE does not match an existing administrator account",
      );
    }

    return configuredOwner.id;
  }

  const explicitOwners = admins.filter(
    (admin) => admin.admin_role === "owner_admin",
  );

  if (explicitOwners.length > 1) {
    throw new Error("multiple owner administrators are configured");
  }

  return explicitOwners[0]?.id || null;
}

export function normalizeAdminRoles(merchants: Merchant[]): Merchant[] {
  const ownerAdminId = resolveOwnerAdminId(merchants);

  return merchants.map((merchant) => {
    if (merchant.is_admin !== true) {
      const {
        admin_role: _adminRole,
        permissions: _permissions,
        admin_enabled: _adminEnabled,
        must_change_password: _mustChangePassword,
        admin_session_version: _adminSessionVersion,
        ...regularMerchant
      } = merchant;

      void _adminRole;
      void _permissions;
      void _adminEnabled;
      void _mustChangePassword;
      void _adminSessionVersion;

      return regularMerchant;
    }

    if (merchant.id === ownerAdminId) {
      return {
        ...merchant,
        admin_role: "owner_admin",
        permissions: undefined,
        admin_enabled: true,
        must_change_password: false,
        admin_session_version: normalizeAdminSessionVersion(
          merchant.admin_session_version,
        ),
      };
    }

    return {
      ...merchant,
      admin_role: "assistant_admin",
      permissions: normalizeAssistantPermissions(merchant.permissions),
      admin_enabled: merchant.admin_enabled !== false,
      must_change_password: merchant.must_change_password === true,
      admin_session_version: normalizeAdminSessionVersion(
        merchant.admin_session_version,
      ),
    };
  });
}

export function revokeAdminSessions(admin: Merchant): void {
  admin.admin_session_version =
    normalizeAdminSessionVersion(admin.admin_session_version) + 1;
  revokeAllAdminTrackedSessions(admin.id, "security_version_revoked");
}

export function signMerchantPayload(
  purpose: "session" | "meta_oauth",
  encodedPayload: string,
): string {
  return crypto
    .createHmac("sha256", MERCHANT_SESSION_SECRET)
    .update(`${purpose}.${encodedPayload}`)
    .digest("base64url");
}

export function createSignedMerchantPayload(
  purpose: "session" | "meta_oauth",
  payload: MerchantSessionPayload | MerchantOAuthStatePayload,
): string {
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
  const signature = signMerchantPayload(purpose, encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySignedMerchantPayload(
  purpose: "session" | "meta_oauth",
  token: string,
): Record<string, unknown> | null {
  const [encodedPayload, suppliedSignature, extraPart] = token.split(".");

  if (!encodedPayload || !suppliedSignature || extraPart) {
    return null;
  }

  const expectedSignature = signMerchantPayload(purpose, encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    return payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function createMerchantSessionToken(merchantId: string): string {
  return createSignedMerchantPayload("session", {
    kind: "merchant_session",
    merchantId,
    expiresAt: Date.now() + MERCHANT_SESSION_TTL_MS,
  });
}

export function verifyMerchantSessionToken(
  token: string,
): MerchantSessionPayload | null {
  const payload = verifySignedMerchantPayload("session", token);

  if (
    payload?.kind !== "merchant_session" ||
    typeof payload.merchantId !== "string" ||
    !payload.merchantId ||
    typeof payload.expiresAt !== "number" ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt <= Date.now()
  ) {
    return null;
  }

  return {
    kind: "merchant_session",
    merchantId: payload.merchantId,
    expiresAt: payload.expiresAt,
  };
}

export function setMerchantSessionCookie(
  res: Response,
  merchantId: string,
): void {
  res.cookie(
    MERCHANT_SESSION_COOKIE,
    createMerchantSessionToken(merchantId),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api",
      maxAge: MERCHANT_SESSION_TTL_MS,
    },
  );
}

export function clearMerchantSessionCookie(res: Response): void {
  res.clearCookie(MERCHANT_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
  });
}

export function createMerchantOAuthState(
  merchantId: string,
  platform: MerchantOAuthStatePayload["platform"],
): string {
  return createSignedMerchantPayload("meta_oauth", {
    kind: "meta_oauth",
    merchantId,
    platform,
    expiresAt: Date.now() + MERCHANT_OAUTH_STATE_TTL_MS,
  });
}

export function verifyMerchantOAuthState(
  token: string,
): MerchantOAuthStatePayload | null {
  const payload = verifySignedMerchantPayload("meta_oauth", token);

  if (
    payload?.kind !== "meta_oauth" ||
    typeof payload.merchantId !== "string" ||
    !payload.merchantId ||
    (payload.platform !== "messenger" &&
      payload.platform !== "instagram") ||
    typeof payload.expiresAt !== "number" ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt <= Date.now()
  ) {
    return null;
  }

  return {
    kind: "meta_oauth",
    merchantId: payload.merchantId,
    platform: payload.platform,
    expiresAt: payload.expiresAt,
  };
}

export function getMerchantIdFromSession(res: Response): string {
  return typeof res.locals.merchantId === "string"
    ? res.locals.merchantId
    : "";
}

export function signAdminSessionPayload(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

export function createAdminSessionToken(
  admin: Merchant,
  trackedSession?: AdminTrackedSession,
): string {
  const payload: AdminSessionPayload = {
    adminId: admin.id,
    sessionVersion: normalizeAdminSessionVersion(
      admin.admin_session_version,
    ),
    ...(trackedSession
      ? {
          sessionId: trackedSession.id,
          deviceId: trackedSession.device_id,
        }
      : {}),
    expiresAt: trackedSession
      ? new Date(trackedSession.expires_at).getTime()
      : Date.now() + ADMIN_SESSION_TTL_MS,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  const signature = signAdminSessionPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(
  token: string,
): AdminSessionPayload | null {
  const [encodedPayload, suppliedSignature, extraPart] = token.split(".");

  if (!encodedPayload || !suppliedSignature || extraPart) {
    return null;
  }

  const expectedSignature =
    signAdminSessionPayload(encodedPayload);

  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;

    if (
      typeof payload.adminId !== "string" ||
      !payload.adminId ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      adminId: payload.adminId,
      sessionVersion:
        typeof payload.sessionVersion === "number" &&
        Number.isInteger(payload.sessionVersion) &&
        payload.sessionVersion >= 0
          ? payload.sessionVersion
          : 0,
      ...(typeof payload.sessionId === "string" && payload.sessionId
        ? { sessionId: payload.sessionId }
        : {}),
      ...(typeof payload.deviceId === "string" && payload.deviceId
        ? { deviceId: payload.deviceId }
        : {}),
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

export function getBearerToken(req: Request): string {
  const authorization = String(req.headers.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function getAdminDeviceContext(req: Request): {
  deviceId: string;
  deviceLabel: string;
  userAgent: string;
} {
  return {
    deviceId: normalizeAdminDeviceId(
      req.body?.device_id || req.headers["x-fawri-device-id"],
    ),
    deviceLabel: String(req.body?.device_label || "").trim(),
    userAgent: String(req.headers["user-agent"] || "").trim(),
  };
}

export function createAssistantTrackedSession(
  admin: Merchant,
  req: Request,
): AdminTrackedSession | undefined {
  if (!isAssistantAdmin(admin) || !adminDeviceSecurityEnforced()) {
    return undefined;
  }
  const device = getAdminDeviceContext(req);
  const attemptedDevice = registerAdminDeviceAttempt({
    adminId: admin.id,
    deviceId: device.deviceId,
    deviceLabel: device.deviceLabel,
    userAgent: device.userAgent,
  });
  if (!isAdminDeviceTrusted(admin.id, device.deviceId)) {
    throw new AdminWorkMonitorError(
      403,
      "ADMIN_DEVICE_APPROVAL_REQUIRED",
      "administrator device approval is required",
      {
        device_id: attemptedDevice.device_id,
        trusted_device_limit: 2,
      },
    );
  }
  return createAdminTrackedSession({
    adminId: admin.id,
    deviceId: device.deviceId,
    deviceLabel: device.deviceLabel,
    userAgent: device.userAgent,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
}

export function isOwnerAdmin(admin: Merchant): boolean {
  return admin.is_admin === true && admin.admin_role === "owner_admin";
}

export function isAssistantAdmin(admin: Merchant): boolean {
  return admin.is_admin === true && admin.admin_role === "assistant_admin";
}

export function adminHasPermission(
  admin: Merchant,
  permission: AdminPermission,
): boolean {
  if (isOwnerAdmin(admin)) return true;

  return normalizeAssistantPermissions(admin.permissions).includes(permission);
}

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export const DB_PATH = getFawriDataFilePath("merchants.json");

export function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

export function normalizeOptionalUrl(value: unknown): string {
  return String(value || "").trim();
}

export function normalizeLanguage(value: unknown): Lang {
  const lang = String(value || "ar");
  if (lang === "ar" || lang === "ku" || lang === "en") return lang;
  return "ar";
}

export function isAccountStatus(value: unknown): value is AccountStatus {
  return ["pending_review", "approved", "rejected", "suspended"].includes(
    String(value),
  );
}

export function isOnboardingStatus(value: unknown): value is OnboardingStatus {
  return [
    "pending_review",
    "awaiting_channel",
    "channel_connected",
    "activation_expired",
  ].includes(String(value));
}

export function isTrialStatus(value: unknown): value is TrialStatus {
  return [
    "eligible",
    "not_started",
    "active",
    "expired",
    "already_used",
    "ineligible",
  ].includes(String(value));
}

export function isSignupSource(value: unknown): value is SignupSource {
  return ["landing_trial", "landing_plan", "login", "direct"].includes(
    String(value),
  );
}

export function isRequestedPlan(value: unknown): value is RequestedPlan {
  return ["silver", "gold", "diamond"].includes(String(value));
}

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return ["silver", "gold", "diamond", "trial"].includes(String(value));
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return [
    "pending_activation",
    "active",
    "expired",
    "replies_exhausted",
    "suspended",
  ].includes(String(value));
}

export function normalizeNonNegativeInteger(value: unknown): number {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : 0;
}

export function normalizeSubscriptionRecord(value: unknown): SubscriptionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<SubscriptionRecord>;
  const merchantId = String(record.merchant_id || "").trim();
  const id = String(record.id || "").trim();
  const startDate = new Date(String(record.start_date || ""));
  const expiresDate = new Date(String(record.expires_at || ""));

  if (
    !merchantId ||
    !id ||
    !isSubscriptionPlan(record.plan_name) ||
    !isSubscriptionStatus(record.status) ||
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(expiresDate.getTime()) ||
    expiresDate.getTime() <= startDate.getTime()
  ) {
    return null;
  }

  const legacyReplyLimit = normalizeNonNegativeInteger(record.reply_limit);
  const baseReplyLimit =
    normalizeNonNegativeInteger(record.base_reply_limit) || legacyReplyLimit;
  const baseRepliesUsed = Math.min(
    normalizeNonNegativeInteger(
      record.base_replies_used ?? record.replies_used,
    ),
    baseReplyLimit,
  );
  const emergencyAmount = normalizeNonNegativeInteger(
    record.emergency_credit_amount,
  );
  const emergencyActivated = record.emergency_credit_activated === true;
  const emergencyRemaining = emergencyActivated
    ? Math.min(
        normalizeNonNegativeInteger(record.emergency_credit_remaining),
        emergencyAmount,
      )
    : 0;
  const emergencyDebt = normalizeNonNegativeInteger(
    record.emergency_debt ?? record.pending_next_cycle_deduction,
  );
  const billingAnchorDay = Math.min(
    31,
    Math.max(
      1,
      normalizeNonNegativeInteger(record.billing_anchor_day) ||
        getBaghdadDateParts(startDate).day,
    ),
  );
  const addonReplyBatches = normalizeAddonReplyBatches(record.addon_reply_batches);

  if (
    emergencyRemaining > 0 &&
    !addonReplyBatches.some((batch) => batch.source === "emergency")
  ) {
    const migratedAt = new Date();
    const migratedAnchorDay = getBaghdadDateParts(migratedAt).day;
    addonReplyBatches.push({
      id: "legacy-emergency-" + id,
      source: "emergency",
      purchased_at: migratedAt.toISOString(),
      expires_at: addBaghdadCalendarMonths(
        migratedAt,
        3,
        migratedAnchorDay,
      ).toISOString(),
      amount: emergencyRemaining,
      remaining: emergencyRemaining,
    });
  }

  return recalculateSubscriptionTotals({
    id,
    merchant_id: merchantId,
    plan_name: record.plan_name,
    price_iqd: normalizeNonNegativeInteger(record.price_iqd),
    reply_limit: legacyReplyLimit,
    replies_used: normalizeNonNegativeInteger(record.replies_used),
    replies_remaining: normalizeNonNegativeInteger(record.replies_remaining),
    base_reply_limit: baseReplyLimit,
    base_replies_used: baseRepliesUsed,
    base_replies_remaining: Math.max(0, baseReplyLimit - baseRepliesUsed),
    addon_replies_remaining: 0,
    addon_reply_batches: addonReplyBatches,
    billing_anchor_day: billingAnchorDay,
    start_date: startDate.toISOString(),
    expires_at: expiresDate.toISOString(),
    status: record.status,
    auto_reply_enabled: record.auto_reply_enabled === true,
    emergency_credit_used: emergencyActivated
      ? emergencyAmount - emergencyRemaining
      : 0,
    emergency_credit_amount: emergencyAmount,
    emergency_credit_remaining: emergencyRemaining,
    emergency_credit_activated: emergencyActivated,
    emergency_debt: emergencyDebt,
    pending_next_cycle_deduction: emergencyDebt,
    ...(typeof record.expiry_reminder_sent_at === "string" && record.expiry_reminder_sent_at.trim()
      ? { expiry_reminder_sent_at: record.expiry_reminder_sent_at }
      : {}),
    ...(typeof record.expired_notification_sent_at === "string" && record.expired_notification_sent_at.trim()
      ? { expired_notification_sent_at: record.expired_notification_sent_at }
      : {}),
  });
}

export function normalizeSubscriptions(value: unknown): SubscriptionRecord[] {
  if (!Array.isArray(value)) return [];
  const byMerchant = new Map<string, SubscriptionRecord>();

  for (const item of value) {
    const subscription = normalizeSubscriptionRecord(item);
    if (!subscription) continue;
    const current = byMerchant.get(subscription.merchant_id);
    if (
      !current ||
      new Date(subscription.start_date).getTime() >=
        new Date(current.start_date).getTime()
    ) {
      byMerchant.set(subscription.merchant_id, subscription);
    }
  }

  return [...byMerchant.values()];
}

export function createPaidSubscription(
  merchantId: string,
  plan: Exclude<SubscriptionPlan, "trial">,
  existing: SubscriptionRecord | undefined,
  operation: "activate" | "change" | "renew",
  currentDate: Date = new Date(),
): SubscriptionRecord {
  const config = SUBSCRIPTION_PLAN_CONFIG[plan];
  const existingNormalized = existing
    ? recalculateSubscriptionTotals(existing, currentDate)
    : undefined;
  const billingAnchorDay = getBaghdadDateParts(currentDate).day;
  const expirationBase = currentDate;
  const existingEmergencyDebt = existingNormalized?.emergency_debt || 0;
  const emergencyDeduction = Math.min(
    existingEmergencyDebt,
    config.reply_limit,
  );
  const remainingEmergencyDebt = Math.max(
    0,
    existingEmergencyDebt - emergencyDeduction,
  );
  const addonBatches = existingNormalized
    ? normalizeAddonReplyBatches(existingNormalized.addon_reply_batches, currentDate)
    : [];

  return recalculateSubscriptionTotals({
    id: existingNormalized?.id || makeId("subscription"),
    merchant_id: merchantId,
    plan_name: plan,
    price_iqd: config.price_iqd,
    reply_limit: config.reply_limit,
    replies_used: emergencyDeduction,
    replies_remaining: config.reply_limit - emergencyDeduction,
    base_reply_limit: config.reply_limit,
    base_replies_used: emergencyDeduction,
    base_replies_remaining: config.reply_limit - emergencyDeduction,
    addon_replies_remaining: 0,
    addon_reply_batches: addonBatches,
    billing_anchor_day: billingAnchorDay,
    start_date: currentDate.toISOString(),
    expires_at: addBaghdadCalendarMonths(
      expirationBase,
      1,
      billingAnchorDay,
    ).toISOString(),
    status: emergencyDeduction >= config.reply_limit
      ? "replies_exhausted"
      : "active",
    auto_reply_enabled: emergencyDeduction < config.reply_limit,
    emergency_credit_used: 0,
    emergency_credit_amount: config.emergency_credit_amount,
    emergency_credit_remaining: 0,
    emergency_credit_activated: false,
    emergency_debt: remainingEmergencyDebt,
    pending_next_cycle_deduction: remainingEmergencyDebt,
  }, currentDate);
}

export function deriveAccountStatus(status: MerchantStatus): AccountStatus {
  if (status === "pending_activation") return "pending_review";
  return status;
}

export function normalizeMerchantLifecycle(merchant: Merchant): Merchant {
  if (merchant.is_admin === true) return merchant;

  const accountStatus = isAccountStatus(merchant.account_status)
    ? merchant.account_status
    : deriveAccountStatus(merchant.status);
  const hasLegacySubscription = Boolean(
    merchant.subscription_started_at || merchant.subscription_expires_at,
  );
  const onboardingStatus = isOnboardingStatus(merchant.onboarding_status)
    ? merchant.onboarding_status
    : accountStatus === "approved" && hasLegacySubscription
      ? "channel_connected"
      : accountStatus === "approved"
        ? "awaiting_channel"
        : "pending_review";
  const trialStatus = isTrialStatus(merchant.trial_status)
    ? merchant.trial_status
    : hasLegacySubscription
      ? "ineligible"
      : merchant.trial_started_at
        ? new Date(merchant.trial_expires_at || 0).getTime() > Date.now()
          ? "active"
          : "expired"
        : accountStatus === "approved"
          ? "not_started"
          : "eligible";

  return {
    ...merchant,
    account_status: accountStatus,
    onboarding_status: onboardingStatus,
    trial_status: trialStatus,
    signup_source: isSignupSource(merchant.signup_source)
      ? merchant.signup_source
      : "direct",
    requested_plan:
      merchant.requested_plan === null || isRequestedPlan(merchant.requested_plan)
        ? merchant.requested_plan ?? null
        : null,
  };
}

export function publicMerchant(merchant: Merchant): SafeMerchant {
  const {
    password,
    admin_session_version: adminSessionVersion,
    ...safeMerchant
  } = normalizeMerchantLifecycle(merchant);
  void password;
  void adminSessionVersion;
  return safeMerchant;
}

export function includeDevCode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_INCLUDE_DEV_CODE === "true";
}

export function otpDeliveryChannel(): string {
  return String(process.env.OTP_DELIVERY_CHANNEL || "").trim().toLowerCase();
}

export function normalizeWhatsappRecipient(phone: string): string {
  const configuredTestNumber = String(process.env.WHATSAPP_TEST_TO || "").replace(/\D/g, "");
  if (configuredTestNumber) return configuredTestNumber;

  return String(phone || "").replace(/\D/g, "");
}

export function buildOtpMessage(code: string, purpose: OtpRecord["purpose"]): string {
  if (purpose === "password_reset") {
    return `Fawri verification code: ${code}\nUse this code to reset your password. It expires in ${OTP_EXPIRE_MINUTES} minutes.`;
  }

  return `Fawri verification code: ${code}\nUse this code to verify your account. It expires in ${OTP_EXPIRE_MINUTES} minutes.`;
}

export async function sendOtpViaWhatsApp(
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const to = normalizeWhatsappRecipient(phone);

  if (!token || !phoneNumberId || !to) {
    return {
      ok: false,
      error: "إعدادات واتساب غير مكتملة لإرسال رمز التحقق",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: buildOtpMessage(code, purpose),
          },
        }),
      },
    );

    const result = await response.json().catch(() => null) as {
      error?: {
        message?: string;
        type?: string;
        code?: number | string;
      };
    } | null;

    if (!response.ok) {
      const message =
        result?.error?.message ||
        "تعذر إرسال رمز التحقق عبر واتساب";

      console.error("WhatsApp OTP send failed:", {
        status: response.status,
        message,
        type: result?.error?.type,
        code: result?.error?.code,
      });

      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (error) {
    console.error("WhatsApp OTP send error:", error);
    return {
      ok: false,
      error: "تعذر الاتصال بخدمة واتساب لإرسال رمز التحقق",
    };
  }
}
