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
import { SUPPORT_ASSISTANT_REMINDER_MS, SUPPORT_MERCHANT_AUTO_CLOSE_MS, SUPPORT_MERCHANT_REMINDER_MS, SUPPORT_OWNER_ESCALATION_MS, isAdminRole, makeId, now } from './authRuntimePart1';
import type { AddonReplyBatch, AdminLogRecord, AuthDb, InspectionConsentDecision, InspectionSessionEndReason, InspectionSessionMode, InspectionSessionRequestRecord, InspectionSessionRequestStatus, Lang, Merchant, MerchantBalanceNotificationRecord, MerchantEmergencyActivationNotificationRecord, MerchantInspectionNotificationRecord, MerchantNotificationRecord, MerchantOperationalNotificationRecord, MerchantSubscriptionPlanNotificationRecord, MerchantSupportReplyReminderNotificationRecord, OtpRecord, SubscriptionPlan, SubscriptionRecord, SupportTicketRecord, SupportTicketStatus, SupportTicketWaitingOn } from './authRuntimePart1';
import { DB_PATH, adminHasPermission, isSubscriptionPlan, normalizeAdminRoles, normalizeMerchantLifecycle, normalizeSubscriptions, otpDeliveryChannel, recalculateSubscriptionTotals, sendOtpViaWhatsApp } from './authRuntimePart2';

export function isMerchantNotificationRecord(
  value: unknown,
): value is MerchantNotificationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.merchant_id !== "string" ||
    typeof item.created_at !== "string"
  ) {
    return false;
  }

  if (item.type === "subscription_balance_purchase") return true;
  if (item.type === "subscription_plan_event") {
    return (
      (item.operation === "activate" || item.operation === "change" || item.operation === "renew") &&
      isSubscriptionPlan(item.plan_name) &&
      typeof item.start_date === "string" &&
      typeof item.expires_at === "string"
    );
  }
  if (item.type === "subscription_emergency_activated") {
    return typeof item.addon_batch_id === "string" && typeof item.expires_at === "string";
  }
  if (item.type === "subscription_expiry_reminder") {
    return isSubscriptionPlan(item.plan_name) && typeof item.expires_at === "string";
  }
  if (item.type === "subscription_expired") {
    return isSubscriptionPlan(item.plan_name) && typeof item.expired_at === "string";
  }
  if (item.type === "addon_expiry_reminder") {
    return typeof item.addon_batch_id === "string" && typeof item.expires_at === "string";
  }

  if (item.type === "operational_new_order") {
    return (
      typeof item.order_id === "string" &&
      typeof item.action_url === "string" &&
      typeof item.dedupe_key === "string"
    );
  }

  if (item.type === "operational_customer_message") {
    return (
      typeof item.conversation_id === "string" &&
      typeof item.action_url === "string" &&
      typeof item.dedupe_key === "string"
    );
  }

  if (item.type === "operational_payment_conflict") {
    return (
      typeof item.order_id === "string" &&
      typeof item.action_url === "string" &&
      typeof item.dedupe_key === "string"
    );
  }

  if (item.type === "support_reply_reminder") {
    return (
      typeof item.ticket_id === "string" &&
      typeof item.ticket_subject === "string" &&
      typeof item.action_url === "string"
    );
  }

  return (
    item.type === "inspection_session_request" &&
    typeof item.ticket_id === "string" &&
    typeof item.inspection_request_id === "string" &&
    typeof item.ticket_subject === "string" &&
    typeof item.admin_name === "string" &&
    isInspectionSessionMode(item.mode) &&
    typeof item.request_expires_at === "string" &&
    typeof item.action_url === "string"
  );
}

export function merchantSessionAccountExists(merchantId: string): boolean {
  const merchant = findRegularMerchant(ensureDb(), merchantId);

  return merchant !== undefined && merchant.otp_verified !== false;
}

export async function deliverOtp(
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (otpDeliveryChannel() === "whatsapp") {
    return sendOtpViaWhatsApp(phone, code, purpose);
  }

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_ALLOW_DEV_OTP_BYPASS === "true"
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    error: "إرسال رمز التحقق غير مهيأ على الخادم",
  };
}

export function removeExpiredOtps(otps: OtpRecord[]): OtpRecord[] {
  const timestamp = Date.now();
  return otps.filter((otp) => !otp.used && new Date(otp.expires_at).getTime() >= timestamp);
}

export function buildInitialDb(): AuthDb {
  return {
    merchants: [],
    subscriptions: [],
    otps: [],
    admin_logs: [],
    merchant_notifications: [],
    support_tickets: [],
    deletion_requests: [],
    channel_overrides: {},
    admin_notes: {},
  };
}

export function ensureDb(): AuthDb {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (!fs.existsSync(DB_PATH)) {
    const initial = buildInitialDb();
    writeDb(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthDb>;

    return {
      merchants: Array.isArray(parsed.merchants)
        ? normalizeAdminRoles(parsed.merchants.map((merchant) => ({
            ...merchant,
            warning_stage:
              merchant.warning_stage === 1 ||
              merchant.warning_stage === 2 ||
              merchant.warning_stage === 3 ||
              merchant.warning_stage === 4
                ? merchant.warning_stage
                : 0,
            retention_status:
              merchant.retention_status &&
              Object.values(MerchantRetentionStatus).includes(
                merchant.retention_status,
              )
                ? merchant.retention_status
                : MerchantRetentionStatus.Protected,
          }))).map(normalizeMerchantLifecycle)
        : [],
      subscriptions: normalizeSubscriptions(parsed.subscriptions),
      otps: Array.isArray(parsed.otps) ? removeExpiredOtps(parsed.otps) : [],
      admin_logs: Array.isArray(parsed.admin_logs) ? parsed.admin_logs : [],
      merchant_notifications: Array.isArray(parsed.merchant_notifications)
        ? parsed.merchant_notifications.filter(isMerchantNotificationRecord)
        : [],
      support_tickets: Array.isArray(parsed.support_tickets)
        ? parsed.support_tickets
            .filter(
              (ticket): ticket is SupportTicketRecord =>
                Boolean(
                  ticket &&
                  typeof ticket === "object" &&
                  !Array.isArray(ticket) &&
                  typeof ticket.id === "string" &&
                  typeof ticket.merchant_id === "string" &&
                  typeof ticket.subject === "string" &&
                  Array.isArray(ticket.messages),
                ),
            )
            .map((ticket) =>
              normalizeSupportTicketLifecycle({
                ...ticket,
                inspection_requests: normalizeInspectionRequests(
                  ticket.inspection_requests,
                  ticket.status,
                ),
              }),
            )
        : [],
      deletion_requests: Array.isArray(parsed.deletion_requests)
        ? parsed.deletion_requests
        : [],
      channel_overrides:
        parsed.channel_overrides &&
        typeof parsed.channel_overrides === "object" &&
        !Array.isArray(parsed.channel_overrides)
          ? parsed.channel_overrides
          : {},
      admin_notes:
        parsed.admin_notes &&
        typeof parsed.admin_notes === "object" &&
        !Array.isArray(parsed.admin_notes)
          ? parsed.admin_notes
          : {},
    };
  } catch (error) {
    console.error("Failed to read auth database:", error);
    return buildInitialDb();
  }
}

export function writeDb(db: AuthDb): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export function isInspectionSessionMode(value: unknown): value is InspectionSessionMode {
  return value === "live_observation" || value === "independent_read_only";
}

export function isInspectionSessionRequestStatus(
  value: unknown,
): value is InspectionSessionRequestStatus {
  return value === "pending" || value === "approved" || value === "rejected" || value === "expired";
}

export function isInspectionConsentDecision(
  value: unknown,
): value is InspectionConsentDecision {
  return value === "approved" || value === "rejected";
}

export function isInspectionSessionEndReason(
  value: unknown,
): value is InspectionSessionEndReason {
  return (
    value === "request_timeout" ||
    value === "approval_window_expired" ||
    value === "ticket_resolved" ||
    value === "ticket_closed" ||
    value === "merchant_terminated"
  );
}

export function normalizeInspectionRequests(
  value: unknown,
  ticketStatus?: SupportTicketStatus,
): InspectionSessionRequestRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is InspectionSessionRequestRecord =>
        Boolean(
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.id === "string" &&
          typeof item.ticket_id === "string" &&
          typeof item.merchant_id === "string" &&
          typeof item.admin_id === "string" &&
          typeof item.admin_name === "string" &&
          isInspectionSessionMode(item.mode) &&
          typeof item.reason === "string" &&
          isInspectionSessionRequestStatus(item.status) &&
          item.read_only === true &&
          item.session_duration_minutes === 30 &&
          typeof item.requested_at === "string" &&
          typeof item.request_expires_at === "string",
        ),
    )
    .map((item) => {
      const consentDecision = isInspectionConsentDecision(item.consent_decision)
        ? item.consent_decision
        : item.status === "approved" || Boolean(item.approved_at)
          ? "approved"
          : item.status === "rejected" || Boolean(item.rejected_at)
            ? "rejected"
            : undefined;
      const inferredTicketEndReason =
        ticketStatus === "resolved"
          ? "ticket_resolved"
          : ticketStatus === "closed"
            ? "ticket_closed"
            : undefined;
      const endReason = isInspectionSessionEndReason(item.end_reason)
        ? item.end_reason
        : item.status === "expired"
          ? inferredTicketEndReason ||
            (consentDecision === "approved"
              ? "approval_window_expired"
              : "request_timeout")
          : undefined;
      const endedAt =
        typeof item.ended_at === "string"
          ? item.ended_at
          : endReason
            ? item.expired_at || item.responded_at || item.session_expires_at
            : undefined;

      return {
        ...item,
        ...(consentDecision ? { consent_decision: consentDecision } : {}),
        ...(endReason ? { end_reason: endReason } : {}),
        ...(endedAt ? { ended_at: endedAt } : {}),
      };
    })
    .sort(
      (left, right) =>
        new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime(),
    );
}

export function normalizeSupportTicketLifecycle(
  ticket: SupportTicketRecord,
): SupportTicketRecord {
  const lastHumanMessage = [...ticket.messages]
    .reverse()
    .find(
      (message) =>
        message.sender_type === "merchant" || message.sender_type === "admin",
    );
  const waitingOn: SupportTicketWaitingOn =
    ticket.waiting_on === "merchant" || ticket.waiting_on === "admin"
      ? ticket.waiting_on
      : lastHumanMessage?.sender_type === "admin"
        ? "merchant"
        : "admin";
  const waitingSince =
    typeof ticket.waiting_since === "string" &&
    Number.isFinite(new Date(ticket.waiting_since).getTime())
      ? ticket.waiting_since
      : lastHumanMessage?.created_at || ticket.updated_at || ticket.created_at;

  return {
    ...ticket,
    waiting_on: waitingOn,
    waiting_since: waitingSince,
  };
}

export function setSupportTicketWaitingOn(
  ticket: SupportTicketRecord,
  waitingOn: SupportTicketWaitingOn,
  waitingSince: string,
): void {
  ticket.waiting_on = waitingOn;
  ticket.waiting_since = waitingSince;
  delete ticket.merchant_reminder_sent_at;
  delete ticket.assistant_reminder_sent_at;
  delete ticket.owner_escalated_at;
}

export function refreshInspectionRequestExpirations(db: AuthDb): boolean {
  const timestamp = Date.now();
  let changed = false;

  for (const ticket of db.support_tickets) {
    const ticketEndReason: InspectionSessionEndReason | undefined =
      ticket.status === "resolved"
        ? "ticket_resolved"
        : ticket.status === "closed"
          ? "ticket_closed"
          : undefined;

    for (const request of ticket.inspection_requests || []) {
      if (request.ended_at) continue;

      const pendingExpired =
        request.status === "pending" &&
        new Date(request.request_expires_at).getTime() <= timestamp;
      const approvedExpired =
        request.status === "approved" &&
        Boolean(request.session_expires_at) &&
        new Date(request.session_expires_at || 0).getTime() <= timestamp;
      const pendingOnInactiveTicket =
        request.status === "pending" && Boolean(ticketEndReason);
      const approvedOnInactiveTicket =
        request.status === "approved" && Boolean(ticketEndReason);

      if (
        !pendingExpired &&
        !approvedExpired &&
        !pendingOnInactiveTicket &&
        !approvedOnInactiveTicket
      ) {
        continue;
      }

      const endedAt = now();
      if (request.status === "pending") {
        request.status = "expired";
        request.expired_at = endedAt;
        request.end_reason = ticketEndReason || "request_timeout";
      } else {
        request.consent_decision = "approved";
        request.end_reason = ticketEndReason || "approval_window_expired";
      }
      request.ended_at = endedAt;
      changed = true;
    }
  }

  return changed;
}

export function hasActiveInspectionRequest(db: AuthDb, merchantId: string): boolean {
  const timestamp = Date.now();
  return db.support_tickets.some(
    (ticket) =>
      ticket.merchant_id === merchantId &&
      (ticket.status === "open" || ticket.status === "in_progress") &&
      (ticket.inspection_requests || []).some((request) => {
        if (request.ended_at) return false;
        if (request.status === "pending") {
          return new Date(request.request_expires_at).getTime() > timestamp;
        }
        if (request.status === "approved") {
          return new Date(request.session_expires_at || 0).getTime() > timestamp;
        }
        return false;
      }),
  );
}

export function findRegularMerchant(db: AuthDb, merchantId: string): Merchant | undefined {
  return db.merchants.find(
    (merchant) => merchant.id === merchantId && merchant.is_admin !== true,
  );
}

export function appendAdminLog(
  db: AuthDb,
  admin: Merchant,
  merchant: Pick<Merchant, "id" | "store_name">,
  actionType: string,
  details: string,
  options: {
    meta?: Record<string, string | number>;
    reason?: string;
  } = {},
): AdminLogRecord {
  const log: AdminLogRecord = {
    id: makeId("admin-log"),
    admin_id: admin.id,
    admin_name: admin.owner_name,
    admin_phone: admin.phone,
    admin_role: admin.admin_role,
    action_type: actionType,
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    details,
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
    created_at: now(),
  };

  db.admin_logs.unshift(log);
  return log;
}

export function appendSystemAdminLog(
  db: AuthDb,
  ticket: SupportTicketRecord,
  actionType: string,
  details: string,
): AdminLogRecord {
  const log: AdminLogRecord = {
    id: makeId("admin-log"),
    admin_name: "Fawri System",
    admin_phone: "system",
    action_type: actionType,
    merchant_id: ticket.merchant_id,
    merchant_name: ticket.merchant_name,
    details,
    meta: {
      ticket_id: ticket.id,
      subject: ticket.subject,
    },
    created_at: now(),
  };
  db.admin_logs.unshift(log);
  return log;
}

export function appendMerchantNotificationRecord<T extends MerchantNotificationRecord>(
  db: AuthDb,
  notification: T,
): T {
  db.merchant_notifications.unshift(notification);
  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === notification.merchant_id)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }
  return notification;
}

export function operationalNotificationTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const numericDate = new Date(value);
    if (Number.isFinite(numericDate.getTime())) return numericDate.toISOString();
  }
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : now();
}

export function operationalNotificationDedupeKey(
  type: MerchantOperationalNotificationRecord["type"],
  merchantId: string,
  sourceId: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${type}:${merchantId}:${sourceId}`)
    .digest("hex");
}

export function appendMerchantBalanceNotification(
  db: AuthDb,
  merchantId: string,
  purchasedReplies: number,
  purchase: {
    debtPaid: number;
    addonAdded: number;
    addonBatch?: AddonReplyBatch;
  },
  subscription: SubscriptionRecord,
): MerchantBalanceNotificationRecord {
  const notification: MerchantBalanceNotificationRecord = {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_balance_purchase",
    purchased_replies: purchasedReplies,
    emergency_debt_paid: purchase.debtPaid,
    addon_replies_added: purchase.addonAdded,
    emergency_debt_remaining: subscription.emergency_debt,
    base_replies_remaining: subscription.base_replies_remaining,
    emergency_replies_remaining: subscription.emergency_credit_remaining,
    addon_replies_remaining: subscription.addon_replies_remaining,
    total_replies_available: subscription.replies_remaining,
    ...(purchase.addonBatch
      ? {
          addon_batch_id: purchase.addonBatch.id,
          addon_batch_expires_at: purchase.addonBatch.expires_at,
        }
      : {}),
    created_at: now(),
  };

  db.merchant_notifications.unshift(notification);
  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === merchantId)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }

  return notification;
}

export function appendMerchantSubscriptionPlanNotification(
  db: AuthDb,
  merchantId: string,
  operation: "activate" | "change" | "renew",
  subscription: SubscriptionRecord,
  previousPlanName: SubscriptionPlan | undefined,
  emergencyDebtPaid: number,
): MerchantSubscriptionPlanNotificationRecord {
  return appendMerchantNotificationRecord(db, {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_plan_event",
    operation,
    plan_name: subscription.plan_name,
    ...(operation === "change" && previousPlanName
      ? { previous_plan_name: previousPlanName }
      : {}),
    start_date: subscription.start_date,
    expires_at: subscription.expires_at,
    emergency_debt_paid: emergencyDebtPaid,
    emergency_debt_remaining: subscription.emergency_debt,
    base_replies_remaining: subscription.base_replies_remaining,
    addon_replies_remaining: subscription.addon_replies_remaining,
    total_replies_available: subscription.replies_remaining,
    created_at: now(),
  });
}

export function appendMerchantEmergencyActivationNotification(
  db: AuthDb,
  merchantId: string,
  batch: AddonReplyBatch,
  subscription: SubscriptionRecord,
): MerchantEmergencyActivationNotificationRecord {
  return appendMerchantNotificationRecord(db, {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_emergency_activated",
    addon_batch_id: batch.id,
    emergency_replies_added: batch.amount,
    emergency_debt: subscription.emergency_debt,
    expires_at: batch.expires_at,
    created_at: now(),
  });
}

export function appendMerchantInspectionNotification(
  db: AuthDb,
  ticket: SupportTicketRecord,
  request: InspectionSessionRequestRecord,
): MerchantInspectionNotificationRecord {
  const notification: MerchantInspectionNotificationRecord = {
    id: makeId("merchant-notification"),
    merchant_id: ticket.merchant_id,
    type: "inspection_session_request",
    ticket_id: ticket.id,
    inspection_request_id: request.id,
    ticket_subject: ticket.subject,
    admin_name: request.admin_name,
    mode: request.mode,
    request_expires_at: request.request_expires_at,
    action_url: `/dashboard/support?ticket=${encodeURIComponent(ticket.id)}`,
    created_at: request.requested_at,
  };

  db.merchant_notifications.unshift(notification);
  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === ticket.merchant_id)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }

  return notification;
}

export function appendMerchantSupportReplyReminderNotification(
  db: AuthDb,
  ticket: SupportTicketRecord,
): MerchantSupportReplyReminderNotificationRecord {
  const notification: MerchantSupportReplyReminderNotificationRecord = {
    id: makeId("merchant-notification"),
    merchant_id: ticket.merchant_id,
    type: "support_reply_reminder",
    ticket_id: ticket.id,
    ticket_subject: ticket.subject,
    action_url: `/dashboard/support?ticket=${encodeURIComponent(ticket.id)}`,
    created_at: now(),
  };
  db.merchant_notifications.unshift(notification);

  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === ticket.merchant_id)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }

  return notification;
}

export type SupportLifecycleRefreshResult = {
  changed: boolean;
  merchantIds: Set<string>;
  notificationMerchantIds: Set<string>;
};

export function supportSystemMessage(
  language: Lang,
): { senderName: string; body: string } {
  if (language === "en") {
    return {
      senderName: "Fawri",
      body: "This ticket was closed automatically because no merchant reply was received for 72 hours. You can open a new ticket if the issue continues.",
    };
  }
  if (language === "ku") {
    return {
      senderName: "فورى",
      body: "ئەم تیکێتە خۆکارانە داخرا، چونکە بۆ ماوەی ٧٢ کاتژمێر هیچ وەڵامێک لە بازرگانەوە نەگەیشت. ئەگەر کێشەکە بەردەوامە دەتوانیت تیکێتێکی نوێ بکەیتەوە.",
    };
  }
  return {
    senderName: "فوري",
    body: "تم إغلاق هذه التذكرة تلقائيًا لعدم ورود رد من التاجر خلال 72 ساعة. يمكنك فتح تذكرة جديدة إذا استمرت المشكلة.",
  };
}

export function refreshSupportTicketLifecycle(
  db: AuthDb,
): SupportLifecycleRefreshResult {
  const timestamp = Date.now();
  const merchantIds = new Set<string>();
  const notificationMerchantIds = new Set<string>();
  let changed = false;

  for (const rawTicket of db.support_tickets) {
    Object.assign(rawTicket, normalizeSupportTicketLifecycle(rawTicket));
    const ticket = rawTicket;
    if (ticket.status !== "open" && ticket.status !== "in_progress") continue;

    const waitingSince = new Date(ticket.waiting_since || ticket.updated_at).getTime();
    if (!Number.isFinite(waitingSince)) continue;
    const elapsed = timestamp - waitingSince;

    if (ticket.waiting_on === "merchant") {
      if (
        !ticket.merchant_reminder_sent_at &&
        elapsed >= SUPPORT_MERCHANT_REMINDER_MS
      ) {
        const existingReminder = db.merchant_notifications.find(
          (notification) =>
            notification.type === "support_reply_reminder" &&
            notification.merchant_id === ticket.merchant_id &&
            notification.ticket_id === ticket.id &&
            new Date(notification.created_at).getTime() >= waitingSince,
        );
        const reminder =
          existingReminder ||
          appendMerchantSupportReplyReminderNotification(db, ticket);
        ticket.merchant_reminder_sent_at = reminder.created_at;
        merchantIds.add(ticket.merchant_id);
        notificationMerchantIds.add(ticket.merchant_id);
        changed = true;
      }

      if (elapsed >= SUPPORT_MERCHANT_AUTO_CLOSE_MS) {
        const closedAt = now();
        ticket.status = "closed";
        ticket.closed_at = closedAt;
        ticket.updated_at = closedAt;
        ticket.auto_closed_at = closedAt;
        ticket.auto_closed_reason = "merchant_inactivity";

        const merchant = findRegularMerchant(db, ticket.merchant_id);
        const systemMessageText = supportSystemMessage(
          merchant?.language || "ar",
        );
        ticket.messages.push({
          id: makeId("support-message"),
          sender_type: "system",
          sender_id: "system",
          sender_name: systemMessageText.senderName,
          body: systemMessageText.body,
          created_at: closedAt,
        });

        for (const notification of db.merchant_notifications) {
          if (
            notification.type === "support_reply_reminder" &&
            notification.merchant_id === ticket.merchant_id &&
            notification.ticket_id === ticket.id &&
            !notification.read_at
          ) {
            notification.read_at = closedAt;
            notificationMerchantIds.add(ticket.merchant_id);
          }
        }

        appendSystemAdminLog(
          db,
          ticket,
          "support_ticket_auto_closed_merchant_inactivity",
          "Ticket auto-closed after 72 hours without a merchant reply",
        );
        merchantIds.add(ticket.merchant_id);
        changed = true;
      }
      continue;
    }

    if (
      !ticket.assistant_reminder_sent_at &&
      elapsed >= SUPPORT_ASSISTANT_REMINDER_MS
    ) {
      ticket.assistant_reminder_sent_at = now();
      changed = true;
    }

    if (
      !ticket.owner_escalated_at &&
      elapsed >= SUPPORT_OWNER_ESCALATION_MS
    ) {
      const matchingEscalations = db.admin_logs
        .filter(
          (log) =>
            log.action_type === "support_ticket_owner_escalated" &&
            log.meta?.ticket_id === ticket.id &&
            new Date(log.created_at).getTime() >= waitingSince,
        )
        .sort(
          (left, right) =>
            new Date(left.created_at).getTime() -
            new Date(right.created_at).getTime(),
        );
      const existingEscalation = matchingEscalations[0];

      if (matchingEscalations.length > 1) {
        const duplicateIds = new Set(
          matchingEscalations.slice(1).map((log) => log.id),
        );
        db.admin_logs = db.admin_logs.filter(
          (log) => !duplicateIds.has(log.id),
        );
      }

      ticket.owner_escalated_at = existingEscalation?.created_at || now();
      if (!existingEscalation) {
        appendSystemAdminLog(
          db,
          ticket,
          "support_ticket_owner_escalated",
          "Ticket escalated to the owner because the merchant is still waiting for support",
        );
      }
      changed = true;
    }
  }

  if (changed) refreshInspectionRequestExpirations(db);
  return { changed, merchantIds, notificationMerchantIds };
}

export type MerchantRealtimeEventName =
  | "snapshot"
  | "subscription_updated"
  | "notifications_updated"
  | "support_updated";

export type MerchantRealtimePayload = {
  subscription: SubscriptionRecord | null;
  unread_notification_count: number;
  emitted_at: string;
};

export type MerchantRealtimeClient = {
  id: string;
  response: Response;
};

export const merchantRealtimeClients = new Map<
  string,
  Map<string, MerchantRealtimeClient>
>();

export type AdminSubscriptionRealtimeEventName =
  | "snapshot"
  | "subscription_updated";

export type AdminSubscriptionRealtimePayload = {
  merchant_id: string | null;
  subscription?: SubscriptionRecord | null;
  subscriptions?: SubscriptionRecord[];
  emitted_at: string;
};

export type AdminSubscriptionRealtimeClient = {
  id: string;
  admin_id: string;
  response: Response;
};

export const adminSubscriptionRealtimeClients = new Map<
  string,
  AdminSubscriptionRealtimeClient
>();

export function buildAdminSubscriptionSnapshot(
  db: AuthDb,
): AdminSubscriptionRealtimePayload {
  const subscriptions = db.subscriptions
    .map((subscription) => recalculateSubscriptionTotals(subscription))
    .sort(
      (left, right) =>
        new Date(right.start_date).getTime() -
        new Date(left.start_date).getTime(),
    );

  return {
    merchant_id: null,
    subscriptions,
    emitted_at: now(),
  };
}

export function buildAdminSubscriptionUpdate(
  db: AuthDb,
  merchantId: string,
): AdminSubscriptionRealtimePayload {
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (subscription) recalculateSubscriptionTotals(subscription);

  return {
    merchant_id: merchantId,
    subscription: subscription || null,
    emitted_at: now(),
  };
}

export function writeAdminSubscriptionRealtimeEvent(
  response: Response,
  eventName: AdminSubscriptionRealtimeEventName,
  payload: AdminSubscriptionRealtimePayload,
): boolean {
  if (response.writableEnded) return false;

  try {
    response.write(
      `event: ${eventName}
data: ${JSON.stringify(payload)}

`,
    );
    const flush = (response as Response & { flush?: () => void }).flush;
    if (typeof flush === "function") flush.call(response);
    return true;
  } catch {
    return false;
  }
}

export function emitAdminSubscriptionRealtimeState(
  db: AuthDb,
  merchantId: string,
): void {
  if (adminSubscriptionRealtimeClients.size === 0) return;

  const payload = buildAdminSubscriptionUpdate(db, merchantId);
  for (const [clientId, client] of adminSubscriptionRealtimeClients) {
    const admin = db.merchants.find(
      (item) =>
        item.id === client.admin_id &&
        item.is_admin === true &&
        item.status === "approved" &&
        item.admin_enabled !== false,
    );
    if (
      !admin ||
      !isAdminRole(admin.admin_role) ||
      !adminHasPermission(admin, "manage_subscriptions") ||
      !writeAdminSubscriptionRealtimeEvent(
        client.response,
        "subscription_updated",
        payload,
      )
    ) {
      adminSubscriptionRealtimeClients.delete(clientId);
      if (!client.response.writableEnded) client.response.end();
    }
  }
}

export function buildMerchantRealtimePayload(
  db: AuthDb,
  merchantId: string,
): MerchantRealtimePayload {
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (subscription) recalculateSubscriptionTotals(subscription);

  return {
    subscription: subscription || null,
    unread_notification_count: db.merchant_notifications.filter(
      (item) => item.merchant_id === merchantId && !item.read_at,
    ).length,
    emitted_at: now(),
  };
}
