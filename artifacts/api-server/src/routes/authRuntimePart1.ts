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

export type MerchantStatus = "pending_activation" | "approved" | "rejected" | "suspended";

export type AccountStatus = "pending_review" | "approved" | "rejected" | "suspended";

export type OnboardingStatus =
  | "pending_review"
  | "awaiting_channel"
  | "channel_connected"
  | "activation_expired";

export type TrialStatus =
  | "eligible"
  | "not_started"
  | "active"
  | "expired"
  | "already_used"
  | "ineligible";

export type SignupSource = "landing_trial" | "landing_plan" | "login" | "direct";

export type RequestedPlan = "silver" | "gold" | "diamond";

export type AdminRole = "owner_admin" | "assistant_admin";

export type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";

export type Lang = "ar" | "ku" | "en";

export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "view_merchants",
  "manage_merchant_status",
  "manage_subscriptions",
  "manage_channels",
  "view_logs",
  "inspect_merchant_sessions",
  "manage_support",
];

export type ThemeMode = "light" | "dark" | "auto";

export type ChannelPlatform = "instagram" | "messenger" | "telegram";

export type ChannelStatus = "connected" | "disconnected" | "pending";

export type DeletionRequestStatus = "pending" | "rejected" | "completed";

export type AdminLogRecord = {
  id: string;
  admin_id?: string;
  admin_name?: string;
  admin_phone: string;
  admin_role?: AdminRole;
  action_type: string;
  merchant_id: string;
  merchant_name: string;
  details: string;
  meta?: Record<string, string | number>;
  reason?: string;
  created_at: string;
};

export type MerchantDeletionRequest = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  requested_by_admin_id: string;
  requested_by_admin_name: string;
  requested_by_admin_phone: string;
  reason: MerchantDeleteReason;
  details: string;
  status: DeletionRequestStatus;
  created_at: string;
  reviewed_by_admin_id?: string;
  reviewed_at?: string;
};

export type Merchant = {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  password: string;
  activity_type: string;
  instagram_link?: string;
  messenger_link?: string;
  telegram_link?: string;
  status: MerchantStatus;
  language: Lang;
  theme_preference: ThemeMode;
  created_at: string;
  is_admin?: boolean;
  admin_role?: AdminRole;
  permissions?: AdminPermission[];
  admin_enabled?: boolean;
  otp_verified?: boolean;
  must_change_password?: boolean;
  admin_session_version?: number;
  account_status?: AccountStatus;
  onboarding_status?: OnboardingStatus;
  trial_status?: TrialStatus;
  signup_source?: SignupSource;
  requested_plan?: RequestedPlan | null;
  approved_at?: string;
  channel_activation_deadline?: string;
  first_channel_connected_at?: string;
  trial_started_at?: string;
  trial_expires_at?: string;
  subscription_started_at?: string;
  subscription_expires_at?: string;
  last_subscription_ended_at?: string;
  warning_stage?: 0 | 1 | 2 | 3 | 4;
  retention_status?: MerchantRetentionStatus;
  eligible_for_deletion_at?: string;
  grace_period_ends_at?: string;
};

export type SafeMerchant = Omit<Merchant, "password" | "admin_session_version">;

export type SubscriptionPlan = "silver" | "gold" | "diamond" | "trial";

export type SubscriptionStatus =
  | "pending_activation"
  | "active"
  | "expired"
  | "replies_exhausted"
  | "suspended";

export type AddonReplyBatch = {
  id: string;
  source: "purchase" | "emergency";
  purchased_at: string;
  expires_at: string;
  amount: number;
  remaining: number;
  expiry_reminder_sent_at?: string;
};

export function compareAddonReplyBatches(
  left: AddonReplyBatch,
  right: AddonReplyBatch,
): number {
  const expiryDifference =
    new Date(left.expires_at).getTime() -
    new Date(right.expires_at).getTime();
  if (expiryDifference !== 0) return expiryDifference;

  const purchaseDifference =
    new Date(left.purchased_at).getTime() -
    new Date(right.purchased_at).getTime();
  if (purchaseDifference !== 0) return purchaseDifference;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export type SubscriptionRecord = {
  id: string;
  merchant_id: string;
  plan_name: SubscriptionPlan;
  price_iqd: number;
  reply_limit: number;
  replies_used: number;
  replies_remaining: number;
  base_reply_limit: number;
  base_replies_used: number;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  addon_reply_batches: AddonReplyBatch[];
  billing_anchor_day: number;
  start_date: string;
  expires_at: string;
  status: SubscriptionStatus;
  auto_reply_enabled: boolean;
  emergency_credit_used: number;
  emergency_credit_amount: number;
  emergency_credit_remaining: number;
  emergency_credit_activated: boolean;
  emergency_debt: number;
  pending_next_cycle_deduction: number;
  expiry_reminder_sent_at?: string;
  expired_notification_sent_at?: string;
};

export const SUBSCRIPTION_PLAN_CONFIG = {
  silver: { price_iqd: 25000, reply_limit: 4000, emergency_credit_amount: 400 },
  gold: { price_iqd: 49000, reply_limit: 8000, emergency_credit_amount: 800 },
  diamond: { price_iqd: 75000, reply_limit: 14000, emergency_credit_amount: 1400 },
} as const;

export const BAGHDAD_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getBaghdadDateParts(date: Date) {
  const shifted = new Date(date.getTime() + BAGHDAD_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

export function addBaghdadCalendarMonths(
  source: Date,
  months: number,
  anchorDay?: number,
): Date {
  const parts = getBaghdadDateParts(source);
  const targetMonthStart = new Date(
    Date.UTC(parts.year, parts.month + months, 1, parts.hour, parts.minute, parts.second, parts.millisecond),
  );
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const desiredDay = Math.min(Math.max(1, anchorDay || parts.day), lastDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      desiredDay,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - BAGHDAD_UTC_OFFSET_MS,
  );
}

export function consumeReplies(subscription: SubscriptionRecord, amount: number): void {
  let remainingToConsume = amount;

  subscription.addon_reply_batches.sort(compareAddonReplyBatches);

  const fromBase = Math.min(subscription.base_replies_remaining, remainingToConsume);
  subscription.base_replies_used += fromBase;
  remainingToConsume -= fromBase;

  for (const batch of subscription.addon_reply_batches) {
    if (remainingToConsume <= 0) break;
    const fromBatch = Math.min(batch.remaining, remainingToConsume);
    batch.remaining -= fromBatch;
    remainingToConsume -= fromBatch;
  }


  if (remainingToConsume > 0) {
    throw new Error("amount exceeds remaining replies");
  }
}

export type MerchantBalanceNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_balance_purchase";
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  addon_batch_id?: string;
  addon_batch_expires_at?: string;
  created_at: string;
  read_at?: string;
};

export type MerchantSubscriptionPlanNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_plan_event";
  operation: "activate" | "change" | "renew";
  plan_name: SubscriptionPlan;
  previous_plan_name?: SubscriptionPlan;
  start_date: string;
  expires_at: string;
  emergency_debt_paid: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
};

export type MerchantEmergencyActivationNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_emergency_activated";
  addon_batch_id: string;
  emergency_replies_added: number;
  emergency_debt: number;
  expires_at: string;
  created_at: string;
  read_at?: string;
};

export type MerchantSubscriptionExpiryReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_expiry_reminder";
  plan_name: SubscriptionPlan;
  expires_at: string;
  days_remaining: number;
  created_at: string;
  read_at?: string;
};

export type MerchantSubscriptionExpiredNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_expired";
  plan_name: SubscriptionPlan;
  expired_at: string;
  addon_replies_remaining: number;
  created_at: string;
  read_at?: string;
};

export type MerchantAddonExpiryReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "addon_expiry_reminder";
  addon_batch_id: string;
  source: "purchase" | "emergency";
  remaining_replies: number;
  expires_at: string;
  days_remaining: number;
  created_at: string;
  read_at?: string;
};

export type MerchantInspectionNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "inspection_session_request";
  ticket_id: string;
  inspection_request_id: string;
  ticket_subject: string;
  admin_name: string;
  mode: InspectionSessionMode;
  request_expires_at: string;
  action_url: string;
  created_at: string;
  read_at?: string;
};

export type MerchantSupportReplyReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "support_reply_reminder";
  ticket_id: string;
  ticket_subject: string;
  action_url: string;
  created_at: string;
  read_at?: string;
};

export type MerchantOperationalOrderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "operational_new_order";
  order_id: string;
  conversation_id?: string;
  action_url: string;
  dedupe_key: string;
  created_at: string;
  read_at?: string;
};

export type MerchantOperationalCustomerMessageNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "operational_customer_message";
  conversation_id: string;
  action_url: string;
  dedupe_key: string;
  created_at: string;
  read_at?: string;
};

export type MerchantOperationalPaymentConflictNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "operational_payment_conflict";
  order_id: string;
  conversation_id?: string;
  provider?: string;
  action_url: string;
  dedupe_key: string;
  created_at: string;
  read_at?: string;
};

export type MerchantOperationalNotificationRecord =
  | MerchantOperationalOrderNotificationRecord
  | MerchantOperationalCustomerMessageNotificationRecord
  | MerchantOperationalPaymentConflictNotificationRecord;

export type MerchantNotificationRecord =
  | MerchantBalanceNotificationRecord
  | MerchantSubscriptionPlanNotificationRecord
  | MerchantEmergencyActivationNotificationRecord
  | MerchantSubscriptionExpiryReminderNotificationRecord
  | MerchantSubscriptionExpiredNotificationRecord
  | MerchantAddonExpiryReminderNotificationRecord
  | MerchantInspectionNotificationRecord
  | MerchantSupportReplyReminderNotificationRecord
  | MerchantOperationalNotificationRecord;

export type SupportTicketCategory =
  | "technical"
  | "billing"
  | "channels"
  | "account"
  | "other";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportTicketWaitingOn = "admin" | "merchant";

export type SupportAutoCloseReason = "merchant_inactivity";

export type SupportMessageSender = "merchant" | "admin" | "system";

export type InspectionSessionMode = "live_observation" | "independent_read_only";

export type InspectionSessionRequestStatus = "pending" | "approved" | "rejected" | "expired";

export type InspectionConsentDecision = "approved" | "rejected";

export type InspectionSessionEndReason =
  | "request_timeout"
  | "approval_window_expired"
  | "ticket_resolved"
  | "ticket_closed"
  | "merchant_terminated";

export type InspectionSessionRequestRecord = {
  id: string;
  ticket_id: string;
  merchant_id: string;
  admin_id: string;
  admin_name: string;
  mode: InspectionSessionMode;
  reason: string;
  status: InspectionSessionRequestStatus;
  consent_decision?: InspectionConsentDecision;
  end_reason?: InspectionSessionEndReason;
  ended_at?: string;
  read_only: true;
  session_duration_minutes: 30;
  requested_at: string;
  request_expires_at: string;
  responded_at?: string;
  approved_at?: string;
  rejected_at?: string;
  expired_at?: string;
  session_expires_at?: string;
};

export type SupportTicketMessage = {
  id: string;
  sender_type: SupportMessageSender;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

export type SupportTicketRecord = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  assigned_admin_id?: string;
  assigned_admin_name?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  waiting_on?: SupportTicketWaitingOn;
  waiting_since?: string;
  merchant_reminder_sent_at?: string;
  assistant_reminder_sent_at?: string;
  owner_escalated_at?: string;
  auto_closed_at?: string;
  auto_closed_reason?: SupportAutoCloseReason;
  messages: SupportTicketMessage[];
  inspection_requests: InspectionSessionRequestRecord[];
};

export type OtpRecord = {
  phone: string;
  code: string;
  purpose: "signup" | "password_reset";
  expires_at: string;
  used: boolean;
  created_at: string;
};

export type AuthDb = {
  merchants: Merchant[];
  subscriptions: SubscriptionRecord[];
  otps: OtpRecord[];
  admin_logs: AdminLogRecord[];
  merchant_notifications: MerchantNotificationRecord[];
  support_tickets: SupportTicketRecord[];
  deletion_requests: MerchantDeletionRequest[];
  channel_overrides: Record<string, Partial<Record<ChannelPlatform, ChannelStatus>>>;
  admin_notes: Record<string, string>;
};

export const router = Router();

export const OTP_EXPIRE_MINUTES = Number(process.env.AUTH_OTP_EXPIRE_MINUTES || 10);

export const OTP_RESEND_COOLDOWN_SECONDS = Number(
  process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS || 60,
);

export const ACCOUNT_CHANNEL_ACTIVATION_DAYS = 10;

export const ACCOUNT_CHANNEL_ACTIVATION_MS =
  ACCOUNT_CHANNEL_ACTIVATION_DAYS * 24 * 60 * 60 * 1000;

export function supportDurationMs(envName: string, fallbackMinutes: number): number {
  const configuredMinutes = Number(process.env[envName]);
  const minutes =
    Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : fallbackMinutes;
  return minutes * 60 * 1000;
}

export const SUPPORT_ASSISTANT_REMINDER_MS = supportDurationMs(
  "SUPPORT_ASSISTANT_REMINDER_MINUTES",
  24 * 60,
);

export const SUPPORT_OWNER_ESCALATION_MS = supportDurationMs(
  "SUPPORT_OWNER_ESCALATION_MINUTES",
  48 * 60,
);

export const SUPPORT_MERCHANT_REMINDER_MS = supportDurationMs(
  "SUPPORT_MERCHANT_REMINDER_MINUTES",
  24 * 60,
);

export const SUPPORT_MERCHANT_AUTO_CLOSE_MS = supportDurationMs(
  "SUPPORT_AUTO_CLOSE_MINUTES",
  72 * 60,
);

export const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;

export const SUBSCRIPTION_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const SUBSCRIPTION_EXPIRY_REMINDER_DAYS = 7;

export const ADDON_EXPIRY_REMINDER_DAYS = 10;

export const PASSWORD_SALT = process.env.FAWRI_PASSWORD_SALT || "fawri-local-dev-salt";

export const ADMIN_SESSION_SECRET =
  process.env.FAWRI_ADMIN_SESSION_SECRET || PASSWORD_SALT;

export const ADMIN_SESSION_TTL_MS = Number(
  process.env.FAWRI_ADMIN_SESSION_TTL_MS || 8 * 60 * 60 * 1000,
);

export const CONFIGURED_MERCHANT_SESSION_SECRET =
  process.env.FAWRI_MERCHANT_SESSION_SECRET ||
  process.env.FAWRI_ADMIN_SESSION_SECRET ||
  process.env.FAWRI_PASSWORD_SALT;

if (
  process.env.NODE_ENV === "production" &&
  !CONFIGURED_MERCHANT_SESSION_SECRET
) {
  throw new Error(
    "FAWRI_MERCHANT_SESSION_SECRET or an approved fallback secret is required",
  );
}

export const MERCHANT_SESSION_SECRET =
  CONFIGURED_MERCHANT_SESSION_SECRET || "fawri-local-dev-salt";

export const MERCHANT_SESSION_TTL_MS = Number(
  process.env.FAWRI_MERCHANT_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000,
);

export const MERCHANT_OAUTH_STATE_TTL_MS = Number(
  process.env.FAWRI_MERCHANT_OAUTH_STATE_TTL_MS || 10 * 60 * 1000,
);

export const MERCHANT_SESSION_COOKIE = "fawri_merchant_session";

export type AdminSessionPayload = {
  adminId: string;
  sessionVersion: number;
  sessionId?: string;
  deviceId?: string;
  expiresAt: number;
};

export type MerchantSessionPayload = {
  kind: "merchant_session";
  merchantId: string;
  expiresAt: number;
};

export type MerchantOAuthStatePayload = {
  kind: "meta_oauth";
  merchantId: string;
  platform: "messenger" | "instagram";
  expiresAt: number;
};

export function isAdminRole(value: unknown): value is AdminRole {
  return value === "owner_admin" || value === "assistant_admin";
}

export function isAdminPermission(value: unknown): value is AdminPermission {
  return (
    typeof value === "string" &&
    ALL_ADMIN_PERMISSIONS.includes(value as AdminPermission)
  );
}

export const LEGACY_ADMIN_PERMISSION_MAP: Readonly<Record<string, readonly AdminPermission[]>> = {
  manage_merchants: ["view_merchants", "manage_merchant_status"],
  inspection_sessions: ["inspect_merchant_sessions"],
  manage_subscriptions: ["manage_subscriptions"],
  manage_channels: ["manage_channels"],
  view_logs: ["view_logs"],
};

export function normalizeAssistantPermissions(
  value: unknown,
): AdminPermission[] {
  if (!Array.isArray(value)) return [];

  const normalized = new Set<AdminPermission>();

  for (const permission of value) {
    if (typeof permission !== "string" || permission === "manage_admins") {
      continue;
    }

    if (isAdminPermission(permission)) {
      normalized.add(permission);
      continue;
    }

    for (const migratedPermission of LEGACY_ADMIN_PERMISSION_MAP[permission] || []) {
      normalized.add(migratedPermission);
    }
  }

  return ALL_ADMIN_PERMISSIONS.filter((permission) => normalized.has(permission));
}

export function now(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAdminSessionVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}
