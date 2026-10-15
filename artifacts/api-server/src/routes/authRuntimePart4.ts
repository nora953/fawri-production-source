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
import { ADDON_EXPIRY_REMINDER_DAYS, ALL_ADMIN_PERMISSIONS, DAY_MS, MERCHANT_SESSION_COOKIE, OTP_EXPIRE_MINUTES, OTP_RESEND_COOLDOWN_SECONDS, SUBSCRIPTION_EXPIRY_REMINDER_DAYS, SUBSCRIPTION_LIFECYCLE_SWEEP_MS, SUPPORT_LIFECYCLE_SWEEP_MS, isAdminRole, makeId, normalizeAdminSessionVersion, normalizeAssistantPermissions, now } from './authRuntimePart1';
import type { AdminPermission, AuthDb, ChannelPlatform, ChannelStatus, Merchant, MerchantOperationalNotificationRecord, OtpRecord } from './authRuntimePart1';
import { adminHasPermission, generateOtpCode, getBearerToken, isAssistantAdmin, isOwnerAdmin, normalizePhone, recalculateSubscriptionTotals, verifyAdminSessionToken, verifyMerchantSessionToken } from './authRuntimePart2';
import { appendMerchantNotificationRecord, buildMerchantRealtimePayload, emitAdminSubscriptionRealtimeState, ensureDb, findRegularMerchant, merchantRealtimeClients, merchantSessionAccountExists, operationalNotificationDedupeKey, operationalNotificationTimestamp, refreshInspectionRequestExpirations, refreshSupportTicketLifecycle, removeExpiredOtps, writeDb } from './authRuntimePart3';
import type { MerchantRealtimeEventName, MerchantRealtimePayload } from './authRuntimePart3';

export function requireMerchantSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = String(
    req.cookies?.[MERCHANT_SESSION_COOKIE] || "",
  ).trim();
  const payload = token ? verifyMerchantSessionToken(token) : null;

  if (!payload || !merchantSessionAccountExists(payload.merchantId)) {
    sendError(res, 401, "merchant session is missing or expired", {
      code: "MERCHANT_SESSION_REQUIRED",
    });
    return;
  }

  res.locals.merchantId = payload.merchantId;
  res.setHeader("Cache-Control", "no-store");
  next();
}

export function requireAdminSession(
  req: Request,
  res: Response,
  options: {
    allowPasswordChangeRequired?: boolean;
    recordActivity?: boolean;
  } = {},
): Merchant | null {
  const token = getBearerToken(req);
  const payload = token
    ? verifyAdminSessionToken(token)
    : null;

  if (!payload) {
    sendError(res, 401, "admin session is missing or expired");
    return null;
  }

  const db = ensureDb();
  const admin = db.merchants.find(
    (item) =>
      item.id === payload.adminId &&
      item.is_admin === true &&
      isAdminRole(item.admin_role) &&
      item.status === "approved" &&
      item.admin_enabled !== false,
  );

  if (!admin) {
    sendError(res, 401, "admin session is invalid");
    return null;
  }

  if (
    payload.sessionVersion !==
    normalizeAdminSessionVersion(admin.admin_session_version)
  ) {
    sendError(res, 401, "admin session was revoked", {
      code: "ADMIN_SESSION_REVOKED",
    });
    return null;
  }

  if (payload.sessionId) {
    const requestDeviceId = normalizeAdminDeviceId(
      req.headers["x-fawri-device-id"],
    );
    if (
      !requestDeviceId ||
      payload.deviceId !== requestDeviceId ||
      !validateAdminTrackedSession({
        adminId: admin.id,
        sessionId: payload.sessionId,
        deviceId: requestDeviceId,
      })
    ) {
      sendError(res, 401, "administrator session or device is no longer trusted", {
        code: "ADMIN_TRACKED_SESSION_REVOKED",
      });
      return null;
    }
    touchAdminTrackedSession(
      payload.sessionId,
      options.recordActivity !== false,
    );
  }

  if (
    admin.must_change_password === true &&
    options.allowPasswordChangeRequired !== true
  ) {
    sendError(res, 403, "administrator password change is required", {
      code: "ADMIN_PASSWORD_CHANGE_REQUIRED",
    });
    return null;
  }

  return admin;
}

export function sendAdminWorkMonitorError(
  res: Response,
  error: unknown,
): Response | null {
  if (!(error instanceof AdminWorkMonitorError)) return null;
  return sendError(res, error.statusCode, error.message, {
    code: error.code,
    ...(error.details || {}),
  });
}

export function requireOwnerPassword(
  owner: Merchant,
  req: Request,
  res: Response,
): boolean {
  const ownerPassword = String(req.body?.owner_password || "");
  if (!ownerPassword) {
    sendError(res, 400, "owner password is required", {
      code: "OWNER_PASSWORD_REQUIRED",
    });
    return false;
  }
  if (!verifyPassword(ownerPassword, owner.password)) {
    sendError(res, 401, "owner password is incorrect", {
      code: "OWNER_PASSWORD_INCORRECT",
    });
    return false;
  }
  return true;
}

export function requireOwner(
  req: Request,
  res: Response,
): Merchant | null {
  const admin = requireAdminSession(req, res);

  if (!admin) {
    return null;
  }

  if (!isOwnerAdmin(admin)) {
    sendError(res, 403, "owner admin permission is required");
    return null;
  }

  return admin;
}

export function requireAdminPermission(
  req: Request,
  res: Response,
  permission: AdminPermission,
): Merchant | null {
  const admin = requireAdminSession(req, res);

  if (!admin) return null;

  if (!adminHasPermission(admin, permission)) {
    sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permission,
    });
    return null;
  }

  return admin;
}

export function requireAnyAdminPermission(
  req: Request,
  res: Response,
  permissions: readonly AdminPermission[],
): Merchant | null {
  const admin = requireAdminSession(req, res);

  if (!admin) return null;

  if (!permissions.some((permission) => adminHasPermission(admin, permission))) {
    sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permissions,
    });
    return null;
  }

  return admin;
}

export function requireSupportAssistant(
  req: Request,
  res: Response,
): Merchant | null {
  const admin = requireAdminPermission(req, res, "manage_support");
  if (!admin) return null;

  if (!isAssistantAdmin(admin)) {
    sendError(res, 403, "owner admin has monitor-only support access", {
      code: "SUPPORT_OWNER_MONITOR_ONLY",
    });
    return null;
  }

  return admin;
}

export function requireInspectionSupportAssistant(
  req: Request,
  res: Response,
): Merchant | null {
  const admin = requireAdminSession(req, res);
  if (!admin) return null;

  if (!isAssistantAdmin(admin)) {
    sendError(res, 403, "owner admin has monitor-only support access", {
      code: "SUPPORT_OWNER_MONITOR_ONLY",
    });
    return null;
  }

  const requiredPermissions: readonly AdminPermission[] = [
    "manage_support",
    "inspect_merchant_sessions",
  ];
  const missingPermissions = requiredPermissions.filter(
    (permission) => !adminHasPermission(admin, permission),
  );
  if (missingPermissions.length > 0) {
    sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permissions: requiredPermissions,
      missing_permissions: missingPermissions,
    });
    return null;
  }

  return admin;
}

export function persistMerchantOperationalNotification(
  db: AuthDb,
  notification: MerchantOperationalNotificationRecord,
): {
  notification: MerchantOperationalNotificationRecord | null;
  deduplicated: boolean;
  skipped?: "merchant_not_found" | "notification_store_unavailable";
} {
  if (!findRegularMerchant(db, notification.merchant_id)) {
    return { notification: null, deduplicated: false, skipped: "merchant_not_found" };
  }

  const existing = db.merchant_notifications.find(
    (item): item is MerchantOperationalNotificationRecord =>
      (item.type === "operational_new_order" ||
        item.type === "operational_customer_message") &&
      item.merchant_id === notification.merchant_id &&
      item.dedupe_key === notification.dedupe_key,
  );
  if (existing) return { notification: existing, deduplicated: true };

  appendMerchantNotificationRecord(db, notification);
  try {
    writeDb(db);
  } catch (error) {
    console.error("Merchant operational notification persistence failed:", error);
    return {
      notification: null,
      deduplicated: false,
      skipped: "notification_store_unavailable",
    };
  }
  emitMerchantRealtimeState(db, notification.merchant_id, "notifications_updated");
  return { notification, deduplicated: false };
}

export function notifyMerchantNewOrder(input: {
  merchantId: string;
  orderId: string;
  conversationId?: string;
  createdAt?: unknown;
}) {
  const merchantId = String(input.merchantId || "").trim();
  const orderId = String(input.orderId || "").trim();
  const conversationId = String(input.conversationId || "").trim();
  if (!merchantId || !orderId) {
    return { notification: null, deduplicated: false, skipped: "invalid_identity" as const };
  }
  const db = ensureDb();
  return persistMerchantOperationalNotification(db, {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "operational_new_order",
    order_id: orderId,
    ...(conversationId ? { conversation_id: conversationId } : {}),
    action_url: `/dashboard/orders?order=${encodeURIComponent(orderId)}`,
    dedupe_key: operationalNotificationDedupeKey(
      "operational_new_order",
      merchantId,
      orderId,
    ),
    created_at: operationalNotificationTimestamp(input.createdAt),
  });
}

export function notifyMerchantNewCustomerMessage(input: {
  merchantId: string;
  conversationId: string;
  sourceEventId: string;
  createdAt?: unknown;
}) {
  const merchantId = String(input.merchantId || "").trim();
  const conversationId = String(input.conversationId || "").trim();
  const sourceEventId = String(input.sourceEventId || "").trim();
  if (!merchantId || !conversationId || !sourceEventId) {
    return { notification: null, deduplicated: false, skipped: "invalid_identity" as const };
  }
  const db = ensureDb();
  return persistMerchantOperationalNotification(db, {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "operational_customer_message",
    conversation_id: conversationId,
    action_url: `/dashboard/conversations?conversation=${encodeURIComponent(conversationId)}`,
    dedupe_key: operationalNotificationDedupeKey(
      "operational_customer_message",
      merchantId,
      sourceEventId,
    ),
    created_at: operationalNotificationTimestamp(input.createdAt),
  });
}

export function writeMerchantRealtimeEvent(
  response: Response,
  eventName: MerchantRealtimeEventName,
  payload: MerchantRealtimePayload,
): boolean {
  if (response.writableEnded) return false;

  try {
    response.write(
      `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`,
    );
    const flush = (response as Response & { flush?: () => void }).flush;
    if (typeof flush === "function") flush.call(response);
    return true;
  } catch {
    return false;
  }
}

export function emitMerchantRealtimeState(
  db: AuthDb,
  merchantId: string,
  eventName: Exclude<MerchantRealtimeEventName, "snapshot">,
): void {
  if (eventName === "subscription_updated") {
    emitAdminSubscriptionRealtimeState(db, merchantId);
  }

  const clients = merchantRealtimeClients.get(merchantId);
  if (!clients || clients.size === 0) return;

  const payload = buildMerchantRealtimePayload(db, merchantId);
  for (const [clientId, client] of clients) {
    if (!writeMerchantRealtimeEvent(client.response, eventName, payload)) {
      clients.delete(clientId);
    }
  }

  if (clients.size === 0) merchantRealtimeClients.delete(merchantId);
}

export function refreshAndPersistSupportLifecycle(db: AuthDb): boolean {
  const lifecycle = refreshSupportTicketLifecycle(db);
  const inspectionChanged = refreshInspectionRequestExpirations(db);
  if (!lifecycle.changed && !inspectionChanged) return false;

  writeDb(db);
  for (const merchantId of lifecycle.merchantIds) {
    emitMerchantRealtimeState(db, merchantId, "support_updated");
  }
  for (const merchantId of lifecycle.notificationMerchantIds) {
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
  }
  return true;
}

export const supportLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSupportLifecycle(ensureDb());
  } catch (error) {
    console.error("Support ticket lifecycle sweep failed:", error);
  }
}, SUPPORT_LIFECYCLE_SWEEP_MS);

supportLifecycleTimer.unref();

export function refreshAndPersistSubscriptionLifecycle(db: AuthDb): boolean {
  const currentDate = new Date();
  const timestamp = currentDate.getTime();
  const createdAt = currentDate.toISOString();
  const changedMerchants = new Set<string>();
  const notificationMerchants = new Set<string>();
  let changed = false;

  for (const subscription of db.subscriptions) {
    recalculateSubscriptionTotals(subscription, currentDate);
    const expiresAt = new Date(subscription.expires_at).getTime();
    const timeUntilExpiry = expiresAt - timestamp;

    if (
      timeUntilExpiry > 0 &&
      timeUntilExpiry <= SUBSCRIPTION_EXPIRY_REMINDER_DAYS * DAY_MS &&
      !subscription.expiry_reminder_sent_at
    ) {
      appendMerchantNotificationRecord(db, {
        id: makeId("merchant-notification"),
        merchant_id: subscription.merchant_id,
        type: "subscription_expiry_reminder",
        plan_name: subscription.plan_name,
        expires_at: subscription.expires_at,
        days_remaining: Math.max(1, Math.ceil(timeUntilExpiry / DAY_MS)),
        created_at: createdAt,
      });
      subscription.expiry_reminder_sent_at = createdAt;
      notificationMerchants.add(subscription.merchant_id);
      changed = true;
    }

    if (timeUntilExpiry <= 0 && !subscription.expired_notification_sent_at) {
      appendMerchantNotificationRecord(db, {
        id: makeId("merchant-notification"),
        merchant_id: subscription.merchant_id,
        type: "subscription_expired",
        plan_name: subscription.plan_name,
        expired_at: subscription.expires_at,
        addon_replies_remaining: subscription.addon_replies_remaining,
        created_at: createdAt,
      });
      subscription.expired_notification_sent_at = createdAt;
      notificationMerchants.add(subscription.merchant_id);
      changedMerchants.add(subscription.merchant_id);
      changed = true;
    }

    for (const batch of subscription.addon_reply_batches) {
      const batchExpiresAt = new Date(batch.expires_at).getTime();
      const timeUntilBatchExpiry = batchExpiresAt - timestamp;
      if (
        timeUntilBatchExpiry > 0 &&
        timeUntilBatchExpiry <= ADDON_EXPIRY_REMINDER_DAYS * DAY_MS &&
        !batch.expiry_reminder_sent_at
      ) {
        appendMerchantNotificationRecord(db, {
          id: makeId("merchant-notification"),
          merchant_id: subscription.merchant_id,
          type: "addon_expiry_reminder",
          addon_batch_id: batch.id,
          source: batch.source,
          remaining_replies: batch.remaining,
          expires_at: batch.expires_at,
          days_remaining: Math.max(1, Math.ceil(timeUntilBatchExpiry / DAY_MS)),
          created_at: createdAt,
        });
        batch.expiry_reminder_sent_at = createdAt;
        notificationMerchants.add(subscription.merchant_id);
        changed = true;
      }
    }
  }

  if (!changed) return false;
  writeDb(db);
  for (const merchantId of changedMerchants) {
    emitMerchantRealtimeState(db, merchantId, "subscription_updated");
  }
  for (const merchantId of notificationMerchants) {
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
  }
  return true;
}

export const subscriptionLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSubscriptionLifecycle(ensureDb());
  } catch (error) {
    console.error("Subscription notification lifecycle sweep failed:", error);
  }
}, SUBSCRIPTION_LIFECYCLE_SWEEP_MS);

subscriptionLifecycleTimer.unref();

export function isChannelPlatform(value: unknown): value is ChannelPlatform {
  return value === "instagram" || value === "messenger" || value === "telegram";
}

export function isChannelStatus(value: unknown): value is ChannelStatus {
  return value === "connected" || value === "disconnected" || value === "pending";
}

export function isMerchantDeleteReason(value: unknown): value is MerchantDeleteReason {
  return (
    value === MerchantDeleteReason.PolicyViolation ||
    value === MerchantDeleteReason.RetentionExpired
  );
}

export function toAdminSummary(admin: Merchant): AdminSummary {
  if (
    admin.is_admin !== true ||
    !admin.admin_role ||
    !isAdminRole(admin.admin_role)
  ) {
    throw new Error("invalid admin account");
  }

  return {
    id: admin.id,
    owner_name: admin.owner_name,
    store_name: admin.store_name,
    phone: admin.phone,
    status: admin.status,
    language: admin.language,
    theme_preference: admin.theme_preference,
    created_at: admin.created_at,
    is_admin: true,
    admin_role: admin.admin_role,
    permissions:
      admin.admin_role === "owner_admin"
        ? [...ALL_ADMIN_PERMISSIONS]
        : normalizeAssistantPermissions(admin.permissions),
    admin_enabled: admin.admin_enabled !== false,
    otp_verified: admin.otp_verified === true,
    must_change_password: admin.must_change_password === true,
  };
}

registerAdminManagement({
  listAdmins: () => {
    const db = ensureDb();

    return db.merchants
      .filter(
        (merchant) =>
          merchant.is_admin === true &&
          merchant.admin_role !== undefined &&
          isAdminRole(merchant.admin_role),
      )
      .map(toAdminSummary)
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      );
  },

  createAssistantAdmin: (input) => {
    const ownerName = input.ownerName.trim();
    const phone = normalizePhone(input.phone);
    const password = input.password;
    const language =
      input.language === "en" || input.language === "ku"
        ? input.language
        : "ar";

    if (!ownerName) {
      throw new AdminManagementError(
        400,
        "OWNER_NAME_REQUIRED",
        "owner_name is required",
      );
    }

    if (!/^07\d{9}$/.test(phone)) {
      throw new AdminManagementError(
        400,
        "INVALID_PHONE",
        "phone must start with 07 and contain 11 digits",
      );
    }

    const passwordError = getPasswordValidationError(password);

    if (passwordError) {
      throw new AdminManagementError(
        400,
        passwordError.code,
        passwordError.message,
      );
    }

    const db = ensureDb();

    const duplicatePhone = db.merchants.some(
      (merchant) => normalizePhone(merchant.phone) === phone,
    );

    if (duplicatePhone) {
      throw new AdminManagementError(
        409,
        "PHONE_ALREADY_EXISTS",
        "phone already exists",
      );
    }

    const assistant: Merchant = {
      id: `admin-${crypto.randomUUID()}`,
      owner_name: ownerName,
      store_name: "Fawri Admin",
      phone,
      password: hashPassword(password),
      activity_type: "admin",
      status: "approved",
      language,
      theme_preference: "auto",
      created_at: now(),
      is_admin: true,
      admin_role: "assistant_admin",
      permissions: [],
      admin_enabled: true,
      otp_verified: true,
      must_change_password: false,
      admin_session_version: 0,
      warning_stage: 0,
      retention_status: MerchantRetentionStatus.Protected,
    };

    db.merchants.push(assistant);
    writeDb(db);

    return toAdminSummary(assistant);
  },

  setAssistantAdminEnabled: (adminId, enabled) => {
    const db = ensureDb();
    const admin = db.merchants.find(
      (merchant) => merchant.id === adminId && merchant.is_admin === true,
    );

    if (!admin) {
      throw new AdminManagementError(
        404,
        "ADMIN_NOT_FOUND",
        "admin account not found",
      );
    }

    if (!isAssistantAdmin(admin)) {
      throw new AdminManagementError(
        400,
        "OWNER_ADMIN_CANNOT_BE_CHANGED",
        "owner admin cannot be enabled or disabled",
      );
    }

    admin.admin_enabled = enabled;
    writeDb(db);

    return toAdminSummary(admin);
  },

  updateAssistantAdminPermissions: (adminId, permissions) => {
    const db = ensureDb();
    const admin = db.merchants.find(
      (merchant) =>
        merchant.id === adminId &&
        merchant.is_admin === true,
    );

    if (!admin) {
      throw new AdminManagementError(
        404,
        "ADMIN_NOT_FOUND",
        "admin account not found",
      );
    }

    if (!isAssistantAdmin(admin)) {
      throw new AdminManagementError(
        400,
        "OWNER_ADMIN_PERMISSIONS_CANNOT_BE_CHANGED",
        "owner admin permissions cannot be changed",
      );
    }

    admin.permissions = normalizeAssistantPermissions(permissions);
    writeDb(db);

    return toAdminSummary(admin);
  },
});

registerMerchantAuthDeletion((merchantId) => {
  const db = ensureDb();
  const merchant = db.merchants.find((item) => item.id === merchantId);

  if (!merchant) {
    throw new Error("merchant not found");
  }

  if (merchant.is_admin === true) {
    throw new Error("admin account cannot be deleted");
  }

  const phone = normalizePhone(merchant.phone);
  const beforeOtpCount = db.otps.length;

  db.merchants = db.merchants.filter(
    (item) => item.id !== merchantId,
  );
  db.subscriptions = db.subscriptions.filter(
    (subscription) => subscription.merchant_id !== merchantId,
  );

  db.otps = db.otps.filter(
    (otp) => normalizePhone(otp.phone) !== phone,
  );

  writeDb(db);

  return {
    merchant: 1,
    otps: beforeOtpCount - db.otps.length,
    phone: merchant.phone,
  };
});

registerMerchantRetentionUpdate(() => {
  const db = ensureDb();
  let updated = 0;

  for (const merchant of db.merchants) {
    if (merchant.is_admin === true) continue;

    const retention = calculateRetentionStatus(
      merchant.subscription_expires_at,
    );

    const nextEligibleAt = retention.eligibleForDeletionAt;
    const nextGraceEnd = retention.gracePeriodEndsAt;

    const changed =
      merchant.warning_stage !== retention.warningStage ||
      merchant.retention_status !== retention.retentionStatus ||
      merchant.eligible_for_deletion_at !== nextEligibleAt ||
      merchant.grace_period_ends_at !== nextGraceEnd;

    if (!changed) continue;

    merchant.warning_stage = retention.warningStage;
    merchant.retention_status = retention.retentionStatus;
    merchant.eligible_for_deletion_at = nextEligibleAt;
    merchant.grace_period_ends_at = nextGraceEnd;
    updated += 1;
  }

  if (updated > 0) {
    writeDb(db);
  }

  return {
    checked: db.merchants.filter(
      (merchant) => merchant.is_admin !== true,
    ).length,
    updated,
  };
});

startMerchantRetentionScheduler();

export function issueOtp(db: AuthDb, phone: string, purpose: OtpRecord["purpose"]): OtpRecord {
  const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000).toISOString();

  const cleanOtps = removeExpiredOtps(db.otps).filter(
    (otp) => !(otp.phone === phone && otp.purpose === purpose),
  );

  const record: OtpRecord = {
    phone,
    code: generateOtpCode(),
    purpose,
    expires_at: expiresAt,
    used: false,
    created_at: now(),
  };

  db.otps = [record, ...cleanOtps];
  return record;
}

export function findValidOtp(
  db: AuthDb,
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): OtpRecord | undefined {
  return db.otps.find(
    (otp) =>
      otp.phone === phone &&
      otp.code === code &&
      otp.purpose === purpose &&
      !otp.used &&
      new Date(otp.expires_at).getTime() >= Date.now(),
  );
}

export function getOtpRetryAfterSeconds(
  db: AuthDb,
  phone: string,
  purpose: OtpRecord["purpose"],
): number {
  const latestOtp = db.otps
    .filter((otp) => otp.phone === phone && otp.purpose === purpose)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )[0];

  if (!latestOtp) return 0;

  const createdAt = new Date(latestOtp.created_at).getTime();
  if (!Number.isFinite(createdAt)) return 0;

  const remainingSeconds = Math.ceil(
    (createdAt + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000,
  );

  return Math.min(
    OTP_RESEND_COOLDOWN_SECONDS,
    Math.max(0, remainingSeconds),
  );
}

export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  details: Record<string, unknown> = {},
) {
  return res.status(statusCode).json({ ok: false, error, ...details });
}

export function sendOtpCooldownError(res: Response, retryAfterSeconds: number) {
  res.setHeader("Retry-After", String(retryAfterSeconds));

  return sendError(
    res,
    429,
    "انتظر قبل طلب رمز تحقق جديد",
    { retry_after_seconds: retryAfterSeconds },
  );
}
