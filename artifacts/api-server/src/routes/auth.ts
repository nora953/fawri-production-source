import fs from "node:fs";
import path from "node:path";
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

type MerchantStatus = "pending_activation" | "approved" | "rejected" | "suspended";
type AccountStatus = "pending_review" | "approved" | "rejected" | "suspended";
type OnboardingStatus =
  | "pending_review"
  | "awaiting_channel"
  | "channel_connected"
  | "activation_expired";
type TrialStatus =
  | "eligible"
  | "not_started"
  | "active"
  | "expired"
  | "already_used"
  | "ineligible";
type SignupSource = "landing_trial" | "landing_plan" | "login" | "direct";
type RequestedPlan = "silver" | "gold" | "diamond";
type AdminRole = "owner_admin" | "assistant_admin";
type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";
type Lang = "ar" | "ku" | "en";

const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "view_merchants",
  "manage_merchant_status",
  "manage_subscriptions",
  "manage_channels",
  "view_logs",
  "inspect_merchant_sessions",
  "manage_support",
];
type ThemeMode = "light" | "dark" | "auto";
type ChannelPlatform = "instagram" | "messenger" | "telegram";
type ChannelStatus = "connected" | "disconnected" | "pending";
type DeletionRequestStatus = "pending" | "rejected" | "completed";

type AdminLogRecord = {
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

type MerchantDeletionRequest = {
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

type Merchant = {
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

type SafeMerchant = Omit<Merchant, "password">;

type SubscriptionPlan = "silver" | "gold" | "diamond" | "trial";
type SubscriptionStatus =
  | "pending_activation"
  | "active"
  | "expired"
  | "replies_exhausted"
  | "suspended";

type AddonReplyBatch = {
  id: string;
  source: "purchase" | "emergency";
  purchased_at: string;
  expires_at: string;
  amount: number;
  remaining: number;
  expiry_reminder_sent_at?: string;
};

type SubscriptionRecord = {
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

const SUBSCRIPTION_PLAN_CONFIG = {
  silver: { price_iqd: 25000, reply_limit: 4000, emergency_credit_amount: 400 },
  gold: { price_iqd: 49000, reply_limit: 8000, emergency_credit_amount: 800 },
  diamond: { price_iqd: 75000, reply_limit: 14000, emergency_credit_amount: 1400 },
} as const;

const BAGHDAD_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function getBaghdadDateParts(date: Date) {
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

function addBaghdadCalendarMonths(
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

function normalizeAddonReplyBatches(
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
    .sort(
      (left, right) =>
        new Date(left.expires_at).getTime() - new Date(right.expires_at).getTime(),
    );
}

function recalculateSubscriptionTotals(
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

function consumeReplies(subscription: SubscriptionRecord, amount: number): void {
  let remainingToConsume = amount;

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

function purchaseAdditionalReplies(
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

type MerchantBalanceNotificationRecord = {
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

type MerchantSubscriptionPlanNotificationRecord = {
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

type MerchantEmergencyActivationNotificationRecord = {
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

type MerchantSubscriptionExpiryReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_expiry_reminder";
  plan_name: SubscriptionPlan;
  expires_at: string;
  days_remaining: number;
  created_at: string;
  read_at?: string;
};

type MerchantSubscriptionExpiredNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_expired";
  plan_name: SubscriptionPlan;
  expired_at: string;
  addon_replies_remaining: number;
  created_at: string;
  read_at?: string;
};

type MerchantAddonExpiryReminderNotificationRecord = {
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

type MerchantInspectionNotificationRecord = {
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

type MerchantSupportReplyReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "support_reply_reminder";
  ticket_id: string;
  ticket_subject: string;
  action_url: string;
  created_at: string;
  read_at?: string;
};

type MerchantNotificationRecord =
  | MerchantBalanceNotificationRecord
  | MerchantSubscriptionPlanNotificationRecord
  | MerchantEmergencyActivationNotificationRecord
  | MerchantSubscriptionExpiryReminderNotificationRecord
  | MerchantSubscriptionExpiredNotificationRecord
  | MerchantAddonExpiryReminderNotificationRecord
  | MerchantInspectionNotificationRecord
  | MerchantSupportReplyReminderNotificationRecord;

type SupportTicketCategory =
  | "technical"
  | "billing"
  | "channels"
  | "account"
  | "other";
type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportTicketWaitingOn = "admin" | "merchant";
type SupportAutoCloseReason = "merchant_inactivity";
type SupportMessageSender = "merchant" | "admin" | "system";
type InspectionSessionMode = "live_observation" | "independent_read_only";
type InspectionSessionRequestStatus = "pending" | "approved" | "rejected" | "expired";
type InspectionConsentDecision = "approved" | "rejected";
type InspectionSessionEndReason =
  | "request_timeout"
  | "approval_window_expired"
  | "ticket_resolved"
  | "ticket_closed"
  | "merchant_terminated";

type InspectionSessionRequestRecord = {
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

type SupportTicketMessage = {
  id: string;
  sender_type: SupportMessageSender;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

type SupportTicketRecord = {
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

function isMerchantNotificationRecord(
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

type OtpRecord = {
  phone: string;
  code: string;
  purpose: "signup" | "password_reset";
  expires_at: string;
  used: boolean;
  created_at: string;
};

type AuthDb = {
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

const router = Router();

const OTP_EXPIRE_MINUTES = Number(process.env.AUTH_OTP_EXPIRE_MINUTES || 10);
const OTP_RESEND_COOLDOWN_SECONDS = Number(
  process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS || 60,
);
const ACCOUNT_CHANNEL_ACTIVATION_DAYS = 10;
const ACCOUNT_CHANNEL_ACTIVATION_MS =
  ACCOUNT_CHANNEL_ACTIVATION_DAYS * 24 * 60 * 60 * 1000;

function supportDurationMs(envName: string, fallbackMinutes: number): number {
  const configuredMinutes = Number(process.env[envName]);
  const minutes =
    Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : fallbackMinutes;
  return minutes * 60 * 1000;
}

const SUPPORT_ASSISTANT_REMINDER_MS = supportDurationMs(
  "SUPPORT_ASSISTANT_REMINDER_MINUTES",
  24 * 60,
);
const SUPPORT_OWNER_ESCALATION_MS = supportDurationMs(
  "SUPPORT_OWNER_ESCALATION_MINUTES",
  48 * 60,
);
const SUPPORT_MERCHANT_REMINDER_MS = supportDurationMs(
  "SUPPORT_MERCHANT_REMINDER_MINUTES",
  24 * 60,
);
const SUPPORT_MERCHANT_AUTO_CLOSE_MS = supportDurationMs(
  "SUPPORT_AUTO_CLOSE_MINUTES",
  72 * 60,
);
const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;
const SUBSCRIPTION_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_EXPIRY_REMINDER_DAYS = 7;
const ADDON_EXPIRY_REMINDER_DAYS = 10;

const PASSWORD_SALT = process.env.FAWRI_PASSWORD_SALT || "fawri-local-dev-salt";
const ADMIN_SESSION_SECRET =
  process.env.FAWRI_ADMIN_SESSION_SECRET || PASSWORD_SALT;
const ADMIN_SESSION_TTL_MS = Number(
  process.env.FAWRI_ADMIN_SESSION_TTL_MS || 8 * 60 * 60 * 1000,
);
const CONFIGURED_MERCHANT_SESSION_SECRET =
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

const MERCHANT_SESSION_SECRET =
  CONFIGURED_MERCHANT_SESSION_SECRET || "fawri-local-dev-salt";
const MERCHANT_SESSION_TTL_MS = Number(
  process.env.FAWRI_MERCHANT_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000,
);
const MERCHANT_OAUTH_STATE_TTL_MS = Number(
  process.env.FAWRI_MERCHANT_OAUTH_STATE_TTL_MS || 10 * 60 * 1000,
);
const MERCHANT_SESSION_COOKIE = "fawri_merchant_session";

type AdminSessionPayload = {
  adminId: string;
  expiresAt: number;
};

type MerchantSessionPayload = {
  kind: "merchant_session";
  merchantId: string;
  expiresAt: number;
};

type MerchantOAuthStatePayload = {
  kind: "meta_oauth";
  merchantId: string;
  platform: "messenger" | "instagram";
  expiresAt: number;
};

function isAdminRole(value: unknown): value is AdminRole {
  return value === "owner_admin" || value === "assistant_admin";
}

function isAdminPermission(value: unknown): value is AdminPermission {
  return (
    typeof value === "string" &&
    ALL_ADMIN_PERMISSIONS.includes(value as AdminPermission)
  );
}

const LEGACY_ADMIN_PERMISSION_MAP: Readonly<Record<string, readonly AdminPermission[]>> = {
  manage_merchants: ["view_merchants", "manage_merchant_status"],
  inspection_sessions: ["inspect_merchant_sessions"],
  manage_subscriptions: ["manage_subscriptions"],
  manage_channels: ["manage_channels"],
  view_logs: ["view_logs"],
};

function normalizeAssistantPermissions(
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

function resolveOwnerAdminId(merchants: Merchant[]): string | null {
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

function normalizeAdminRoles(merchants: Merchant[]): Merchant[] {
  const ownerAdminId = resolveOwnerAdminId(merchants);

  return merchants.map((merchant) => {
    if (merchant.is_admin !== true) {
      const {
        admin_role: _adminRole,
        permissions: _permissions,
        admin_enabled: _adminEnabled,
        ...regularMerchant
      } = merchant;

      void _adminRole;
      void _permissions;
      void _adminEnabled;

      return regularMerchant;
    }

    if (merchant.id === ownerAdminId) {
      return {
        ...merchant,
        admin_role: "owner_admin",
        permissions: undefined,
        admin_enabled: true,
      };
    }

    return {
      ...merchant,
      admin_role: "assistant_admin",
      permissions: normalizeAssistantPermissions(merchant.permissions),
      admin_enabled: merchant.admin_enabled !== false,
    };
  });
}

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function signMerchantPayload(
  purpose: "session" | "meta_oauth",
  encodedPayload: string,
): string {
  return crypto
    .createHmac("sha256", MERCHANT_SESSION_SECRET)
    .update(`${purpose}.${encodedPayload}`)
    .digest("base64url");
}

function createSignedMerchantPayload(
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

function verifySignedMerchantPayload(
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

function createMerchantSessionToken(merchantId: string): string {
  return createSignedMerchantPayload("session", {
    kind: "merchant_session",
    merchantId,
    expiresAt: Date.now() + MERCHANT_SESSION_TTL_MS,
  });
}

function verifyMerchantSessionToken(
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

function setMerchantSessionCookie(
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

function clearMerchantSessionCookie(res: Response): void {
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

export function merchantSessionAccountExists(merchantId: string): boolean {
  const merchant = findRegularMerchant(ensureDb(), merchantId);

  return merchant !== undefined && merchant.otp_verified !== false;
}

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

function signAdminSessionPayload(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createAdminSessionToken(adminId: string): string {
  const payload: AdminSessionPayload = {
    adminId,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  const signature = signAdminSessionPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyAdminSessionToken(
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
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

function getBearerToken(req: Request): string {
  const authorization = String(req.headers.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function requireAdminSession(
  req: Request,
  res: Response,
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

  return admin;
}


function isOwnerAdmin(admin: Merchant): boolean {
  return admin.is_admin === true && admin.admin_role === "owner_admin";
}

function isAssistantAdmin(admin: Merchant): boolean {
  return admin.is_admin === true && admin.admin_role === "assistant_admin";
}

function requireOwner(
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

function adminHasPermission(
  admin: Merchant,
  permission: AdminPermission,
): boolean {
  if (isOwnerAdmin(admin)) return true;

  return normalizeAssistantPermissions(admin.permissions).includes(permission);
}

function requireAdminPermission(
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

function requireAnyAdminPermission(
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


function requireSupportAssistant(
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

function requireInspectionSupportAssistant(
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

function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function getDataFilePath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), "data", fileName),
    path.resolve(process.cwd(), "..", "data", fileName),
    path.resolve(process.cwd(), "..", "..", "data", fileName),
    path.resolve("/home/runner/workspace", "data", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const DB_PATH = getDataFilePath("merchants.json");

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeOptionalUrl(value: unknown): string {
  return String(value || "").trim();
}

function normalizeLanguage(value: unknown): Lang {
  const lang = String(value || "ar");
  if (lang === "ar" || lang === "ku" || lang === "en") return lang;
  return "ar";
}

function isAccountStatus(value: unknown): value is AccountStatus {
  return ["pending_review", "approved", "rejected", "suspended"].includes(
    String(value),
  );
}

function isOnboardingStatus(value: unknown): value is OnboardingStatus {
  return [
    "pending_review",
    "awaiting_channel",
    "channel_connected",
    "activation_expired",
  ].includes(String(value));
}

function isTrialStatus(value: unknown): value is TrialStatus {
  return [
    "eligible",
    "not_started",
    "active",
    "expired",
    "already_used",
    "ineligible",
  ].includes(String(value));
}

function isSignupSource(value: unknown): value is SignupSource {
  return ["landing_trial", "landing_plan", "login", "direct"].includes(
    String(value),
  );
}

function isRequestedPlan(value: unknown): value is RequestedPlan {
  return ["silver", "gold", "diamond"].includes(String(value));
}

function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return ["silver", "gold", "diamond", "trial"].includes(String(value));
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return [
    "pending_activation",
    "active",
    "expired",
    "replies_exhausted",
    "suspended",
  ].includes(String(value));
}

function normalizeNonNegativeInteger(value: unknown): number {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function normalizeSubscriptionRecord(value: unknown): SubscriptionRecord | null {
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

function normalizeSubscriptions(value: unknown): SubscriptionRecord[] {
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

function createPaidSubscription(
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

function deriveAccountStatus(status: MerchantStatus): AccountStatus {
  if (status === "pending_activation") return "pending_review";
  return status;
}

function normalizeMerchantLifecycle(merchant: Merchant): Merchant {
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

function publicMerchant(merchant: Merchant): SafeMerchant {
  const { password, ...safeMerchant } = normalizeMerchantLifecycle(merchant);
  void password;
  return safeMerchant;
}

function includeDevCode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_INCLUDE_DEV_CODE === "true";
}


function otpDeliveryChannel(): string {
  return String(process.env.OTP_DELIVERY_CHANNEL || "").trim().toLowerCase();
}

function normalizeWhatsappRecipient(phone: string): string {
  const configuredTestNumber = String(process.env.WHATSAPP_TEST_TO || "").replace(/\D/g, "");
  if (configuredTestNumber) return configuredTestNumber;

  return String(phone || "").replace(/\D/g, "");
}

function buildOtpMessage(code: string, purpose: OtpRecord["purpose"]): string {
  if (purpose === "password_reset") {
    return `Fawri verification code: ${code}\nUse this code to reset your password. It expires in ${OTP_EXPIRE_MINUTES} minutes.`;
  }

  return `Fawri verification code: ${code}\nUse this code to verify your account. It expires in ${OTP_EXPIRE_MINUTES} minutes.`;
}

async function sendOtpViaWhatsApp(
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

async function deliverOtp(
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

function removeExpiredOtps(otps: OtpRecord[]): OtpRecord[] {
  const timestamp = Date.now();
  return otps.filter((otp) => !otp.used && new Date(otp.expires_at).getTime() >= timestamp);
}

function buildInitialDb(): AuthDb {
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

function ensureDb(): AuthDb {
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

function writeDb(db: AuthDb): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function isInspectionSessionMode(value: unknown): value is InspectionSessionMode {
  return value === "live_observation" || value === "independent_read_only";
}

function isInspectionSessionRequestStatus(
  value: unknown,
): value is InspectionSessionRequestStatus {
  return value === "pending" || value === "approved" || value === "rejected" || value === "expired";
}

function isInspectionConsentDecision(
  value: unknown,
): value is InspectionConsentDecision {
  return value === "approved" || value === "rejected";
}

function isInspectionSessionEndReason(
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

function normalizeInspectionRequests(
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

function normalizeSupportTicketLifecycle(
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

function setSupportTicketWaitingOn(
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

function refreshInspectionRequestExpirations(db: AuthDb): boolean {
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

function hasActiveInspectionRequest(db: AuthDb, merchantId: string): boolean {
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

function findRegularMerchant(db: AuthDb, merchantId: string): Merchant | undefined {
  return db.merchants.find(
    (merchant) => merchant.id === merchantId && merchant.is_admin !== true,
  );
}

function appendAdminLog(
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

function appendSystemAdminLog(
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

function appendMerchantNotificationRecord<T extends MerchantNotificationRecord>(
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

function appendMerchantBalanceNotification(
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

function appendMerchantSubscriptionPlanNotification(
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

function appendMerchantEmergencyActivationNotification(
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

function appendMerchantInspectionNotification(
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

function appendMerchantSupportReplyReminderNotification(
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

type SupportLifecycleRefreshResult = {
  changed: boolean;
  merchantIds: Set<string>;
  notificationMerchantIds: Set<string>;
};

function supportSystemMessage(
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

function refreshSupportTicketLifecycle(
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

type MerchantRealtimeEventName =
  | "snapshot"
  | "subscription_updated"
  | "notifications_updated"
  | "support_updated";

type MerchantRealtimePayload = {
  subscription: SubscriptionRecord | null;
  unread_notification_count: number;
  emitted_at: string;
};

type MerchantRealtimeClient = {
  id: string;
  response: Response;
};

const merchantRealtimeClients = new Map<
  string,
  Map<string, MerchantRealtimeClient>
>();

type AdminSubscriptionRealtimeEventName =
  | "snapshot"
  | "subscription_updated";

type AdminSubscriptionRealtimePayload = {
  merchant_id: string | null;
  subscription?: SubscriptionRecord | null;
  subscriptions?: SubscriptionRecord[];
  emitted_at: string;
};

type AdminSubscriptionRealtimeClient = {
  id: string;
  admin_id: string;
  response: Response;
};

const adminSubscriptionRealtimeClients = new Map<
  string,
  AdminSubscriptionRealtimeClient
>();

function buildAdminSubscriptionSnapshot(
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

function buildAdminSubscriptionUpdate(
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

function writeAdminSubscriptionRealtimeEvent(
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

function emitAdminSubscriptionRealtimeState(
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

function buildMerchantRealtimePayload(
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

function writeMerchantRealtimeEvent(
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

function emitMerchantRealtimeState(
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

function refreshAndPersistSupportLifecycle(db: AuthDb): boolean {
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

const supportLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSupportLifecycle(ensureDb());
  } catch (error) {
    console.error("Support ticket lifecycle sweep failed:", error);
  }
}, SUPPORT_LIFECYCLE_SWEEP_MS);
supportLifecycleTimer.unref();

function refreshAndPersistSubscriptionLifecycle(db: AuthDb): boolean {
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

const subscriptionLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSubscriptionLifecycle(ensureDb());
  } catch (error) {
    console.error("Subscription notification lifecycle sweep failed:", error);
  }
}, SUBSCRIPTION_LIFECYCLE_SWEEP_MS);
subscriptionLifecycleTimer.unref();

function isChannelPlatform(value: unknown): value is ChannelPlatform {
  return value === "instagram" || value === "messenger" || value === "telegram";
}

function isChannelStatus(value: unknown): value is ChannelStatus {
  return value === "connected" || value === "disconnected" || value === "pending";
}

function isMerchantDeleteReason(value: unknown): value is MerchantDeleteReason {
  return (
    value === MerchantDeleteReason.PolicyViolation ||
    value === MerchantDeleteReason.RetentionExpired
  );
}


function toAdminSummary(admin: Merchant): AdminSummary {
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


function issueOtp(db: AuthDb, phone: string, purpose: OtpRecord["purpose"]): OtpRecord {
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

function findValidOtp(
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

function getOtpRetryAfterSeconds(
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

function sendError(
  res: Response,
  statusCode: number,
  error: string,
  details: Record<string, unknown> = {},
) {
  return res.status(statusCode).json({ ok: false, error, ...details });
}

function sendOtpCooldownError(res: Response, retryAfterSeconds: number) {
  res.setHeader("Retry-After", String(retryAfterSeconds));

  return sendError(
    res,
    429,
    "انتظر قبل طلب رمز تحقق جديد",
    { retry_after_seconds: retryAfterSeconds },
  );
}

router.post("/signup", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "").trim();
  const ownerName = String(req.body?.owner_name || "").trim();
  const storeName = String(req.body?.store_name || "").trim();
  const activityType = String(req.body?.activity_type || "").trim();
  const language = normalizeLanguage(req.body?.language);

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");
  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    return sendError(res, 400, passwordError.message);
  }
  if (!ownerName) return sendError(res, 400, "اكتب اسم صاحب المتجر");
  if (!storeName) return sendError(res, 400, "اكتب اسم المتجر");
  if (!activityType) return sendError(res, 400, "اختر نوع النشاط");

  const db = ensureDb();
  const existing = db.merchants.find((merchant) => normalizePhone(merchant.phone) === phone);

  if (existing) {
    if (!existing.is_admin && existing.otp_verified === false) {
      const retryAfterSeconds = getOtpRetryAfterSeconds(
        db,
        phone,
        "signup",
      );

      if (retryAfterSeconds > 0) {
        return sendOtpCooldownError(res, retryAfterSeconds);
      }

      existing.owner_name = ownerName;
      existing.store_name = storeName;
      existing.password = hashPassword(password);
      existing.activity_type = activityType;
      existing.instagram_link = normalizeOptionalUrl(req.body?.instagram_link);
      existing.messenger_link = normalizeOptionalUrl(req.body?.messenger_link);
      existing.telegram_link = normalizeOptionalUrl(req.body?.telegram_link);
      existing.language = language;
      existing.status = "pending_activation";
      existing.account_status = "pending_review";
      existing.onboarding_status = "pending_review";
      existing.trial_status = "eligible";
      existing.signup_source = "direct";
      existing.requested_plan = null;
      existing.approved_at = undefined;
      existing.channel_activation_deadline = undefined;

      const otp = issueOtp(db, phone, "signup");
      const delivery = await deliverOtp(phone, otp.code, "signup");

      if (!delivery.ok) {
        return sendError(res, 502, delivery.error);
      }

      writeDb(db);

      return res.status(200).json({
        ok: true,
        merchant: publicMerchant(existing),
        ...(includeDevCode() ? { devCode: otp.code } : {}),
        message: "تم إرسال رمز تحقق جديد",
        retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
      });
    }

    return sendError(res, 409, "رقم الهاتف مسجل مسبقاً");
  }

  const merchant: Merchant = {
    id: makeId("merchant"),
    owner_name: ownerName,
    store_name: storeName,
    phone,
    password: hashPassword(password),
    activity_type: activityType,
    instagram_link: normalizeOptionalUrl(req.body?.instagram_link),
    messenger_link: normalizeOptionalUrl(req.body?.messenger_link),
    telegram_link: normalizeOptionalUrl(req.body?.telegram_link),
    status: "pending_activation",
    language,
    theme_preference: "auto",
    created_at: now(),
    otp_verified: false,
    account_status: "pending_review",
    onboarding_status: "pending_review",
    trial_status: "eligible",
    signup_source: "direct",
    requested_plan: null,
    warning_stage: 0,
    retention_status: MerchantRetentionStatus.Protected,
  };

  db.merchants.push(merchant);
  const otp = issueOtp(db, phone, "signup");
  const delivery = await deliverOtp(phone, otp.code, "signup");

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.status(201).json({
    ok: true,
    merchant: publicMerchant(merchant),
    ...(includeDevCode() ? { devCode: otp.code } : {}),
    message: "تم إنشاء الحساب وإرسال رمز التحقق",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
  });
});

router.post("/otp/resend", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const purpose = String(req.body?.purpose || "").trim();

  if (!phone) return sendError(res, 400, "رقم الهاتف مطلوب");

  if (purpose !== "signup" && purpose !== "password_reset") {
    return sendError(res, 400, "غرض رمز التحقق غير صالح");
  }

  const otpPurpose = purpose as OtpRecord["purpose"];
  const db = ensureDb();
  const merchant = db.merchants.find(
    (item) => normalizePhone(item.phone) === phone && !item.is_admin,
  );

  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  if (otpPurpose === "signup" && merchant.otp_verified === true) {
    return sendError(res, 409, "تم التحقق من رقم الهاتف مسبقاً");
  }

  const retryAfterSeconds = getOtpRetryAfterSeconds(
    db,
    phone,
    otpPurpose,
  );

  if (retryAfterSeconds > 0) {
    return sendOtpCooldownError(res, retryAfterSeconds);
  }

  const otp = issueOtp(db, phone, otpPurpose);
  const delivery = await deliverOtp(phone, otp.code, otpPurpose);

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.json({
    ok: true,
    message: "تم إرسال رمز تحقق جديد",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    ...(includeDevCode() ? { devCode: otp.code } : {}),
  });
});

router.post("/verify-otp", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();

  if (!phone) return sendError(res, 400, "رقم الهاتف مطلوب");
  if (!code) return sendError(res, 400, "رمز التحقق مطلوب");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  const otp = findValidOtp(db, phone, code, "signup");
  if (!otp) return sendError(res, 400, "رمز التحقق غير صحيح أو منتهي الصلاحية");

  otp.used = true;
  merchant.otp_verified = true;
  merchant.status = "pending_activation";
  merchant.account_status = "pending_review";
  merchant.onboarding_status = "pending_review";
  if (!isTrialStatus(merchant.trial_status)) merchant.trial_status = "eligible";
  writeDb(db);
  setMerchantSessionCookie(res, merchant.id);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

router.post("/login", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "").trim();

  if (!phone || !password) return sendError(res, 400, "اكتب رقم الهاتف وكلمة المرور");

  const db = ensureDb();
  const merchant = db.merchants.find(
    (item) =>
      normalizePhone(item.phone) === phone &&
      verifyPassword(password, item.password),
  );

  if (!merchant) {
    return sendError(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");
  }

  if (!merchant.is_admin && merchant.otp_verified === false) {
    return sendError(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");
  }

  if (
    merchant.is_admin === true &&
    merchant.admin_role === "assistant_admin" &&
    merchant.admin_enabled === false
  ) {
    return sendError(
      res,
      403,
      "admin account is disabled",
      { code: "ADMIN_DISABLED" },
    );
  }

  // Migrate old plain-text passwords to hashed passwords after a successful login.
  if (!merchant.password.startsWith("sha256$")) {
    merchant.password = hashPassword(password);
    writeDb(db);
  }

  if (merchant.is_admin) {
    clearMerchantSessionCookie(res);
  } else {
    setMerchantSessionCookie(res, merchant.id);
  }

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    ...(merchant.is_admin
      ? { admin_token: createAdminSessionToken(merchant.id) }
      : {}),
  });
});

router.post("/logout", (_req: Request, res: Response) => {
  clearMerchantSessionCookie(res);
  return res.json({ ok: true });
});

router.post("/password-reset/request", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "لا يوجد حساب بهذا الرقم");

  const retryAfterSeconds = getOtpRetryAfterSeconds(
    db,
    phone,
    "password_reset",
  );

  if (retryAfterSeconds > 0) {
    return sendOtpCooldownError(res, retryAfterSeconds);
  }

  const otp = issueOtp(db, phone, "password_reset");
  const delivery = await deliverOtp(phone, otp.code, "password_reset");

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.json({
    ok: true,
    message: "تم إرسال رمز التحقق",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    ...(includeDevCode() ? { devCode: otp.code } : {}),
  });
});

router.post("/password-reset/confirm", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || req.body?.new_password || "").trim();
  const confirmPassword = String(req.body?.confirmPassword || req.body?.confirm_password || "").trim();

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");
  if (!code) return sendError(res, 400, "اكتب رمز التحقق");
  const passwordError = getPasswordValidationError(newPassword);
  if (passwordError) {
    return sendError(res, 400, passwordError.message);
  }
  if (newPassword !== confirmPassword) return sendError(res, 400, "كلمتا المرور غير متطابقتين");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  const otp = findValidOtp(db, phone, code, "password_reset");
  if (!otp) return sendError(res, 400, "رمز التحقق غير صحيح أو منتهي الصلاحية");

  otp.used = true;
  merchant.otp_verified = true;
  merchant.password = hashPassword(newPassword);
  writeDb(db);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});


router.post(
  "/change-password",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const currentPassword = String(
      req.body?.currentPassword || req.body?.oldPassword || "",
    ).trim();
    const newPassword = String(
      req.body?.newPassword || req.body?.new_password || "",
    ).trim();
    const confirmPassword = String(
      req.body?.confirmPassword || req.body?.confirm_password || "",
    ).trim();

    if (currentPassword.length < 1) {
      return sendError(res, 400, "current password is required");
    }

    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return sendError(res, 400, passwordError.message);
    }
    if (newPassword !== confirmPassword) {
      return sendError(
        res,
        400,
        "new password confirmation does not match",
      );
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");
    if (!verifyPassword(currentPassword, merchant.password)) {
      return sendError(res, 401, "current password is incorrect");
    }

    merchant.password = hashPassword(newPassword);
    writeDb(db);

    return res.json({ ok: true, merchant: publicMerchant(merchant) });
  },
);
router.get("/me", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

router.get("/events", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const clientId = makeId("merchant-realtime");

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  req.socket.setTimeout(0);
  req.socket.setKeepAlive(true);

  let clients = merchantRealtimeClients.get(merchantId);
  if (!clients) {
    clients = new Map<string, MerchantRealtimeClient>();
    merchantRealtimeClients.set(merchantId, clients);
  }
  clients.set(clientId, { id: clientId, response: res });

  writeMerchantRealtimeEvent(
    res,
    "snapshot",
    buildMerchantRealtimePayload(ensureDb(), merchantId),
  );

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    try {
      res.write(": heartbeat\n\n");
      const flush = (res as Response & { flush?: () => void }).flush;
      if (typeof flush === "function") flush.call(res);
    } catch {
      // The close handler removes disconnected clients.
    }
  }, 25_000);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    const currentClients = merchantRealtimeClients.get(merchantId);
    currentClients?.delete(clientId);
    if (currentClients?.size === 0) {
      merchantRealtimeClients.delete(merchantId);
    }
    if (!res.writableEnded) res.end();
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
});

router.get(
  "/admin/subscriptions/events",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_subscriptions");
    if (!admin) return;

    const clientId = makeId("admin-subscription-realtime");

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true);

    adminSubscriptionRealtimeClients.set(clientId, {
      id: clientId,
      admin_id: admin.id,
      response: res,
    });

    writeAdminSubscriptionRealtimeEvent(
      res,
      "snapshot",
      buildAdminSubscriptionSnapshot(ensureDb()),
    );

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(": heartbeat\\n\\n");
        const flush = (res as Response & { flush?: () => void }).flush;
        if (typeof flush === "function") flush.call(res);
      } catch {
        // The close handler removes disconnected clients.
      }
    }, 25_000);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      adminSubscriptionRealtimeClients.delete(clientId);
      if (!res.writableEnded) res.end();
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  },
);

router.get("/notifications", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  refreshAndPersistSubscriptionLifecycle(db);
  const unreadOnly = String(req.query.unread || "") === "1";
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(50, requestedLimit))
    : 20;

  const notifications = db.merchant_notifications
    .filter(
      (item) =>
        item.merchant_id === merchantId &&
        (!unreadOnly || !item.read_at),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )
    .slice(0, limit)
    .map((notification) => {
      if (notification.type !== "inspection_session_request") return notification;

      const ticket = db.support_tickets.find(
        (item) =>
          item.id === notification.ticket_id &&
          item.merchant_id === merchantId,
      );
      const inspectionRequest = ticket?.inspection_requests.find(
        (item) => item.id === notification.inspection_request_id,
      );

      if (!inspectionRequest) {
        return {
          ...notification,
          request_status: "expired" as InspectionSessionRequestStatus,
        };
      }

      return {
        ...notification,
        request_status: inspectionRequest.status,
        consent_decision: inspectionRequest.consent_decision,
        responded_at: inspectionRequest.responded_at,
        session_expires_at: inspectionRequest.session_expires_at,
        ended_at: inspectionRequest.ended_at,
        end_reason: inspectionRequest.end_reason,
      };
    });

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, notifications });
});

router.patch(
  "/notifications/:id/read",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const notificationId = String(req.params.id || "").trim();
    const db = ensureDb();
    const notification = db.merchant_notifications.find(
      (item) => item.id === notificationId && item.merchant_id === merchantId,
    );
    if (!notification) return sendError(res, 404, "notification not found");

    notification.read_at = notification.read_at || now();
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    return res.json({ ok: true, notification });
  },
);


router.get("/support/tickets", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  const tickets = db.support_tickets
    .filter((ticket) => ticket.merchant_id === merchantId)
    .sort(
      (left, right) =>
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
    );

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, tickets });
});

router.post("/support/tickets", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  const category = String(req.body?.category || "other").trim() as SupportTicketCategory;
  const allowedCategories: readonly SupportTicketCategory[] = [
    "technical",
    "billing",
    "channels",
    "account",
    "other",
  ];

  if (subject.length < 3 || subject.length > 120) {
    return sendError(res, 400, "invalid support subject");
  }
  if (message.length < 2 || message.length > 4000) {
    return sendError(res, 400, "invalid support message");
  }
  if (!allowedCategories.includes(category)) {
    return sendError(res, 400, "invalid support category");
  }

  const activeCount = db.support_tickets.filter(
    (ticket) =>
      ticket.merchant_id === merchantId &&
      (ticket.status === "open" || ticket.status === "in_progress"),
  ).length;
  if (activeCount >= 10) {
    return sendError(res, 409, "too many active support tickets");
  }

  const createdAt = now();
  const ticket: SupportTicketRecord = {
    id: makeId("support-ticket"),
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    merchant_phone: merchant.phone,
    subject,
    category,
    status: "open",
    created_at: createdAt,
    updated_at: createdAt,
    waiting_on: "admin",
    waiting_since: createdAt,
    inspection_requests: [],
    messages: [
      {
        id: makeId("support-message"),
        sender_type: "merchant",
        sender_id: merchant.id,
        sender_name: merchant.owner_name,
        body: message,
        created_at: createdAt,
      },
    ],
  };

  db.support_tickets.unshift(ticket);
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "support_updated");
  return res.status(201).json({ ok: true, ticket });
});

router.get(
  "/support/tickets/:id",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const db = ensureDb();
    refreshAndPersistSupportLifecycle(db);
    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, ticket });
  },
);

router.post(
  "/support/tickets/:id/messages",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const body = String(req.body?.message || "").trim();
    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );

    if (!merchant) return sendError(res, 404, "merchant not found");
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status === "closed" || ticket.status === "resolved") {
      return sendError(res, 409, "support ticket is closed");
    }
    if (body.length < 1 || body.length > 4000) {
      return sendError(res, 400, "invalid support message");
    }

    const supportMessage: SupportTicketMessage = {
      id: makeId("support-message"),
      sender_type: "merchant",
      sender_id: merchant.id,
      sender_name: merchant.owner_name,
      body,
      created_at: now(),
    };
    ticket.messages.push(supportMessage);
    ticket.updated_at = supportMessage.created_at;
    setSupportTicketWaitingOn(ticket, "admin", supportMessage.created_at);
    let notificationChanged = false;
    for (const notification of db.merchant_notifications) {
      if (
        notification.type === "support_reply_reminder" &&
        notification.merchant_id === merchantId &&
        notification.ticket_id === ticket.id &&
        !notification.read_at
      ) {
        notification.read_at = supportMessage.created_at;
        notificationChanged = true;
      }
    }
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    if (notificationChanged) {
      emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    }
    return res.status(201).json({ ok: true, ticket, message: supportMessage });
  },
);


router.post(
  "/support/tickets/:id/inspection-requests/:requestId/decision",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const requestId = String(req.params.requestId || "").trim();
    const decision = String(req.body?.decision || "").trim();
    const db = ensureDb();
    refreshInspectionRequestExpirations(db);

    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    const inspectionRequest = (ticket.inspection_requests || []).find(
      (item) => item.id === requestId,
    );
    if (!inspectionRequest) {
      return sendError(res, 404, "inspection session request not found");
    }
    if (inspectionRequest.status !== "pending") {
      writeDb(db);
      return sendError(res, 409, "inspection session request is no longer pending", {
        code: "INSPECTION_REQUEST_NOT_PENDING",
        status: inspectionRequest.status,
      });
    }
    if (decision !== "approve" && decision !== "reject") {
      return sendError(res, 400, "invalid inspection session decision");
    }

    const respondedAt = now();
    inspectionRequest.responded_at = respondedAt;
    delete inspectionRequest.ended_at;
    delete inspectionRequest.end_reason;
    if (decision === "approve") {
      inspectionRequest.status = "approved";
      inspectionRequest.consent_decision = "approved";
      inspectionRequest.approved_at = respondedAt;
      delete inspectionRequest.rejected_at;
      inspectionRequest.session_expires_at = new Date(
        Date.now() + inspectionRequest.session_duration_minutes * 60 * 1000,
      ).toISOString();
    } else {
      inspectionRequest.status = "rejected";
      inspectionRequest.consent_decision = "rejected";
      inspectionRequest.rejected_at = respondedAt;
      delete inspectionRequest.approved_at;
      delete inspectionRequest.session_expires_at;
    }
    ticket.updated_at = respondedAt;

    const inspectionNotification = db.merchant_notifications.find(
      (item) =>
        item.type === "inspection_session_request" &&
        item.merchant_id === merchantId &&
        item.inspection_request_id === inspectionRequest.id,
    );
    if (inspectionNotification) {
      inspectionNotification.read_at = inspectionNotification.read_at || respondedAt;
    }

    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    return res.json({ ok: true, ticket, inspection_request: inspectionRequest });
  },
);

router.post(
  "/support/tickets/:id/inspection-requests/:requestId/terminate",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const requestId = String(req.params.requestId || "").trim();
    const db = ensureDb();
    if (refreshInspectionRequestExpirations(db)) writeDb(db);

    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    const inspectionRequest = (ticket.inspection_requests || []).find(
      (item) => item.id === requestId,
    );
    if (!inspectionRequest) {
      return sendError(res, 404, "inspection session request not found");
    }

    const sessionExpiresAt = new Date(
      inspectionRequest.session_expires_at || 0,
    ).getTime();
    const activeApprovedSession =
      inspectionRequest.status === "approved" &&
      inspectionRequest.consent_decision === "approved" &&
      !inspectionRequest.ended_at &&
      Number.isFinite(sessionExpiresAt) &&
      sessionExpiresAt > Date.now();

    if (!activeApprovedSession) {
      return sendError(res, 409, "inspection session is not active", {
        code: "INSPECTION_SESSION_NOT_ACTIVE",
        status: inspectionRequest.status,
        end_reason: inspectionRequest.end_reason || "",
      });
    }

    const endedAt = now();
    inspectionRequest.end_reason = "merchant_terminated";
    inspectionRequest.ended_at = endedAt;
    ticket.updated_at = endedAt;

    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    return res.json({
      ok: true,
      ticket,
      inspection_request: inspectionRequest,
    });
  },
);

router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (!subscription) return sendError(res, 404, "subscription not found");

  recalculateSubscriptionTotals(subscription);
  writeDb(db);
  return res.json({ ok: true, subscription });
});

router.post("/subscription/emergency", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant || merchant.status !== "approved") {
    return sendError(res, 403, "approved merchant account is required");
  }

  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (!subscription) return sendError(res, 404, "subscription not found");

  recalculateSubscriptionTotals(subscription);
  if (new Date(subscription.expires_at).getTime() <= Date.now()) {
    return sendError(res, 409, "subscription is expired");
  }
  const emergencyEligibilityThreshold = 500;
  const eligibleBalance =
    subscription.base_replies_remaining +
    subscription.addon_replies_remaining;
  if (eligibleBalance > emergencyEligibilityThreshold) {
    return sendError(
      res,
      409,
      "emergency credit requires 500 or fewer combined base and add-on replies",
      {
        code: "EMERGENCY_COMBINED_THRESHOLD_NOT_REACHED",
        base_replies_remaining: subscription.base_replies_remaining,
        addon_replies_remaining: subscription.addon_replies_remaining,
        eligible_balance: eligibleBalance,
        threshold: emergencyEligibilityThreshold,
      },
    );
  }
  if (subscription.emergency_credit_activated) {
    return sendError(res, 409, "emergency credit was already used in this cycle");
  }
  if (subscription.emergency_debt > 0) {
    return sendError(res, 409, "previous emergency debt must be paid first");
  }
  if (subscription.emergency_credit_amount <= 0) {
    return sendError(res, 409, "emergency credit is unavailable");
  }

  const activatedAt = new Date();
  const emergencyAmount = subscription.emergency_credit_amount;
  const anchorDay = getBaghdadDateParts(activatedAt).day;
  const emergencyBatch: AddonReplyBatch = {
    id: makeId("emergency-replies"),
    source: "emergency",
    purchased_at: activatedAt.toISOString(),
    expires_at: addBaghdadCalendarMonths(
      activatedAt,
      3,
      anchorDay,
    ).toISOString(),
    amount: emergencyAmount,
    remaining: emergencyAmount,
  };
  subscription.addon_reply_batches.push(emergencyBatch);
  subscription.emergency_credit_activated = true;
  subscription.emergency_credit_remaining = 0;
  subscription.emergency_credit_used = emergencyAmount;
  subscription.emergency_debt = emergencyAmount;
  subscription.pending_next_cycle_deduction = subscription.emergency_debt;
  subscription.status = "active";
  subscription.auto_reply_enabled = true;
  recalculateSubscriptionTotals(subscription, activatedAt);
  const merchantNotification = appendMerchantEmergencyActivationNotification(
    db,
    merchantId,
    emergencyBatch,
    subscription,
  );
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({
    ok: true,
    subscription,
    notification: merchantNotification,
  });
});


router.get("/admin/support/tickets", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_support");
  if (!admin) return;

  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  const tickets = [...db.support_tickets].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
  const activeCount = tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress",
  ).length;

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    tickets,
    active_count: activeCount,
    viewer_role: admin.admin_role,
  });
});

router.post(
  "/admin/support/tickets/:id/claim",
  (req: Request, res: Response) => {
    const admin = requireSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const db = ensureDb();
    const ticket = db.support_tickets.find((item) => item.id === ticketId);
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status === "resolved" || ticket.status === "closed") {
      return sendError(res, 409, "support ticket is closed");
    }
    if (ticket.assigned_admin_id && ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 409, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ALREADY_ASSIGNED",
      });
    }

    ticket.assigned_admin_id = admin.id;
    ticket.assigned_admin_name = admin.owner_name;
    ticket.status = "in_progress";
    ticket.updated_at = now();

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      "support_ticket_claimed",
      ticket.subject,
      { meta: { ticket_id: ticket.id, subject: ticket.subject } },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    return res.json({ ok: true, ticket });
  },
);

router.post(
  "/admin/support/tickets/:id/messages",
  (req: Request, res: Response) => {
    const admin = requireSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const body = String(req.body?.message || "").trim();
    const db = ensureDb();
    const ticket = db.support_tickets.find((item) => item.id === ticketId);

    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status === "resolved" || ticket.status === "closed") {
      return sendError(res, 409, "support ticket is closed");
    }
    if (!ticket.assigned_admin_id) {
      return sendError(res, 409, "support ticket must be claimed first", {
        code: "SUPPORT_TICKET_NOT_CLAIMED",
      });
    }
    if (ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 403, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ASSIGNED_TO_ANOTHER_ADMIN",
      });
    }
    if (body.length < 1 || body.length > 4000) {
      return sendError(res, 400, "invalid support message");
    }

    const message: SupportTicketMessage = {
      id: makeId("support-message"),
      sender_type: "admin",
      sender_id: admin.id,
      sender_name: admin.owner_name,
      body,
      created_at: now(),
    };
    ticket.messages.push(message);
    ticket.status = "in_progress";
    ticket.updated_at = message.created_at;
    setSupportTicketWaitingOn(ticket, "merchant", message.created_at);

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      "support_ticket_replied",
      ticket.subject,
      { meta: { ticket_id: ticket.id, subject: ticket.subject } },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    return res.status(201).json({ ok: true, ticket, message });
  },
);


router.post(
  "/admin/support/tickets/:id/inspection-requests",
  (req: Request, res: Response) => {
    const admin = requireInspectionSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const mode = String(req.body?.mode || "").trim() as InspectionSessionMode;
    const reason = String(req.body?.reason || "").trim();
    const db = ensureDb();
    refreshInspectionRequestExpirations(db);

    const ticket = db.support_tickets.find((item) => item.id === ticketId);
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status !== "open" && ticket.status !== "in_progress") {
      return sendError(res, 409, "inspection request requires an active support ticket", {
        code: "INSPECTION_ACTIVE_TICKET_REQUIRED",
      });
    }
    if (!ticket.assigned_admin_id) {
      return sendError(res, 409, "support ticket must be claimed first", {
        code: "SUPPORT_TICKET_NOT_CLAIMED",
      });
    }
    if (ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 403, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ASSIGNED_TO_ANOTHER_ADMIN",
      });
    }
    if (!isInspectionSessionMode(mode)) {
      return sendError(res, 400, "invalid inspection session mode");
    }
    if (reason.length < 5 || reason.length > 500) {
      return sendError(res, 400, "invalid inspection session reason");
    }
    if (hasActiveInspectionRequest(db, ticket.merchant_id)) {
      return sendError(res, 409, "merchant already has an active inspection request", {
        code: "INSPECTION_REQUEST_ALREADY_ACTIVE",
      });
    }

    const requestedAt = now();
    const inspectionRequest: InspectionSessionRequestRecord = {
      id: makeId("inspection-request"),
      ticket_id: ticket.id,
      merchant_id: ticket.merchant_id,
      admin_id: admin.id,
      admin_name: admin.owner_name,
      mode,
      reason,
      status: "pending",
      read_only: true,
      session_duration_minutes: 30,
      requested_at: requestedAt,
      request_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };

    ticket.inspection_requests = ticket.inspection_requests || [];
    ticket.inspection_requests.unshift(inspectionRequest);
    ticket.updated_at = requestedAt;
    appendMerchantInspectionNotification(db, ticket, inspectionRequest);

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      "inspection_session_requested",
      ticket.subject,
      {
        meta: {
          ticket_id: ticket.id,
          request_id: inspectionRequest.id,
          mode,
        },
        reason,
      },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    emitMerchantRealtimeState(db, ticket.merchant_id, "notifications_updated");
    return res.status(201).json({
      ok: true,
      ticket,
      inspection_request: inspectionRequest,
    });
  },
);

router.patch(
  "/admin/support/tickets/:id/status",
  (req: Request, res: Response) => {
    const admin = requireSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const status = String(req.body?.status || "").trim() as SupportTicketStatus;
    const db = ensureDb();
    const ticket = db.support_tickets.find((item) => item.id === ticketId);

    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (status !== "in_progress" && status !== "resolved") {
      return sendError(res, 400, "invalid support ticket status");
    }
    if (!ticket.assigned_admin_id) {
      return sendError(res, 409, "support ticket must be claimed first", {
        code: "SUPPORT_TICKET_NOT_CLAIMED",
      });
    }
    if (ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 403, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ASSIGNED_TO_ANOTHER_ADMIN",
      });
    }
    if (ticket.status === "closed") {
      return sendError(res, 409, "support ticket is closed");
    }

    ticket.status = status;
    ticket.updated_at = now();
    if (status === "resolved") {
      ticket.closed_at = ticket.updated_at;
      refreshInspectionRequestExpirations(db);
    } else {
      delete ticket.closed_at;
    }

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      status === "resolved"
        ? "support_ticket_resolved"
        : "support_ticket_in_progress",
      ticket.subject,
      {
        meta: {
          ticket_id: ticket.id,
          subject: ticket.subject,
          status,
        },
      },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    return res.json({ ok: true, ticket });
  },
);

router.get("/admin/me", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, admin: toAdminSummary(admin) });
});

router.get("/merchants", (req: Request, res: Response) => {
  const admin = requireAnyAdminPermission(req, res, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "inspect_merchant_sessions",
  ]);
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    merchants: db.merchants
      .filter(
        (merchant) =>
          merchant.is_admin !== true && merchant.otp_verified === true,
      )
      .map(publicMerchant),
  });
});


router.get("/admins", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  return res.json({
    ok: true,
    admins: listAdmins(),
  });
});

router.post("/admins", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  try {
    const admin = createAssistantAdmin({
      ownerName: String(req.body?.owner_name || ""),
      phone: String(req.body?.phone || ""),
      password: String(req.body?.password || ""),
      language: String(req.body?.language || "ar"),
    });

    return res.status(201).json({
      ok: true,
      admin,
    });
  } catch (error) {
    if (error instanceof AdminManagementError) {
      return sendError(
        res,
        error.statusCode,
        error.message,
        { code: error.code },
      );
    }

    console.error("Failed to create assistant admin:", error);
    return sendError(res, 500, "failed to create assistant admin");
  }
});

router.patch("/admins/:adminId/enabled", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const adminId = String(req.params.adminId || "").trim();
  const enabled = req.body?.enabled;

  if (!adminId) {
    return sendError(res, 400, "adminId is required");
  }

  if (typeof enabled !== "boolean") {
    return sendError(
      res,
      400,
      "enabled must be boolean",
      { code: "INVALID_ENABLED_VALUE" },
    );
  }

  try {
    const admin = setAssistantAdminEnabled(adminId, enabled);

    return res.json({
      ok: true,
      admin,
    });
  } catch (error) {
    if (error instanceof AdminManagementError) {
      return sendError(
        res,
        error.statusCode,
        error.message,
        { code: error.code },
      );
    }

    console.error("Failed to update assistant admin status:", error);
    return sendError(
      res,
      500,
      "failed to update assistant admin status",
    );
  }
});

router.patch(
  "/admins/:adminId/permissions",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner) return;

    const adminId = String(req.params.adminId || "").trim();
    const permissions = req.body?.permissions;

    if (!adminId) {
      return sendError(res, 400, "adminId is required");
    }

    if (!Array.isArray(permissions)) {
      return sendError(
        res,
        400,
        "permissions must be an array",
        { code: "INVALID_PERMISSIONS_VALUE" },
      );
    }

    const hasInvalidPermission = permissions.some(
      (permission) => !isAdminPermission(permission),
    );

    if (hasInvalidPermission) {
      return sendError(
        res,
        400,
        "permissions contain an unknown value",
        { code: "INVALID_ADMIN_PERMISSION" },
      );
    }

    const normalizedPermissions = Array.from(
      new Set(permissions),
    ) as AdminPermission[];

    try {
      const admin = updateAssistantAdminPermissions(
        adminId,
        normalizedPermissions,
      );

      return res.json({
        ok: true,
        admin,
      });
    } catch (error) {
      if (error instanceof AdminManagementError) {
        return sendError(
          res,
          error.statusCode,
          error.message,
          { code: error.code },
        );
      }

      console.error(
        "Failed to update assistant admin permissions:",
        error,
      );

      return sendError(
        res,
        500,
        "failed to update assistant admin permissions",
      );
    }
  },
);

router.post("/admin/local-data-migration", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const db = ensureDb();
  const sourceLogs = Array.isArray(req.body?.logs) ? req.body.logs.slice(0, 5000) : [];
  const sourceNotes =
    req.body?.notes && typeof req.body.notes === "object" && !Array.isArray(req.body.notes)
      ? req.body.notes as Record<string, unknown>
      : {};
  const sourceChannels =
    req.body?.channel_overrides &&
    typeof req.body.channel_overrides === "object" &&
    !Array.isArray(req.body.channel_overrides)
      ? req.body.channel_overrides as Record<string, unknown>
      : {};

  const knownLogIds = new Set(db.admin_logs.map((log) => log.id));
  let importedLogs = 0;
  let importedNotes = 0;
  let importedChannels = 0;

  for (const candidate of sourceLogs) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const id = String(record.id || "").trim();
    const merchantId = String(record.merchant_id || "").trim();
    const merchantName = String(record.merchant_name || "").trim();
    const actionType = String(record.action_type || "").trim();
    const createdAt = String(record.created_at || "").trim();
    const adminId = String(record.admin_id || "").trim();
    const adminName = String(record.admin_name || "").trim();
    const adminRole = isAdminRole(record.admin_role)
      ? record.admin_role
      : undefined;
    if (!id || knownLogIds.has(id) || !merchantId || !merchantName || !actionType) continue;
    if (!Number.isFinite(new Date(createdAt).getTime())) continue;

    db.admin_logs.push({
      id,
      ...(adminId ? { admin_id: adminId } : {}),
      ...(adminName ? { admin_name: adminName } : {}),
      admin_phone: String(record.admin_phone || owner.phone).trim(),
      ...(adminRole ? { admin_role: adminRole } : {}),
      action_type: actionType,
      merchant_id: merchantId,
      merchant_name: merchantName,
      details: String(record.details || "").slice(0, 2000),
      ...(record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
        ? { meta: record.meta as Record<string, string | number> }
        : {}),
      ...(record.reason ? { reason: String(record.reason).slice(0, 1000) } : {}),
      created_at: createdAt,
    });
    knownLogIds.add(id);
    importedLogs += 1;
  }

  for (const [merchantId, value] of Object.entries(sourceNotes)) {
    if (typeof value !== "string" || value.length > 5000) continue;
    if (db.admin_notes[merchantId] !== undefined) continue;
    if (!findRegularMerchant(db, merchantId)) continue;
    db.admin_notes[merchantId] = value;
    importedNotes += 1;
  }

  for (const [merchantId, value] of Object.entries(sourceChannels)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (!findRegularMerchant(db, merchantId)) continue;

    const current = db.channel_overrides[merchantId] || {};
    const candidate = value as Record<string, unknown>;
    for (const [platform, status] of Object.entries(candidate)) {
      if (!isChannelPlatform(platform) || !isChannelStatus(status)) continue;
      if (current[platform] !== undefined) continue;
      current[platform] = status;
      importedChannels += 1;
    }
    db.channel_overrides[merchantId] = current;
  }

  db.admin_logs.sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  writeDb(db);

  return res.json({
    ok: true,
    imported: {
      logs: importedLogs,
      notes: importedNotes,
      channels: importedChannels,
    },
  });
});

router.post("/admin/logs", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const allowedActions = new Set([
    "plan_activated",
    "plan_changed",
    "plan_renewed",
    "replies_reset",
    "replies_added",
    "replies_deducted",
    "auto_reply_enabled",
    "auto_reply_disabled",
  ]);
  const actionType = String(req.body?.action_type || "").trim();
  const merchantId = String(req.body?.merchant_id || "").trim();
  const details = String(req.body?.details || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const meta =
    req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)
      ? req.body.meta as Record<string, string | number>
      : undefined;

  if (!allowedActions.has(actionType)) {
    return sendError(res, 400, "invalid admin log action");
  }
  if (!merchantId) return sendError(res, 400, "merchantId is required");

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const log = appendAdminLog(db, admin, merchant, actionType, details, {
    ...(meta ? { meta } : {}),
    ...(reason ? { reason } : {}),
  });
  writeDb(db);

  return res.status(201).json({ ok: true, log });
});

router.get("/admin/logs", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "view_logs");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    logs: db.admin_logs.slice(0, 1000),
  });
});

router.get("/admin/channels", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_channels");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    channel_overrides: db.channel_overrides,
  });
});

router.patch(
  "/merchants/:id/channels/:platform",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_channels");
    if (!admin) return;

    const merchantId = String(req.params.id || "").trim();
    const platform = String(req.params.platform || "").trim();
    const status = String(req.body?.status || "").trim();

    if (!merchantId) return sendError(res, 400, "merchantId is required");
    if (!isChannelPlatform(platform)) {
      return sendError(res, 400, "invalid channel platform");
    }
    if (!isChannelStatus(status)) {
      return sendError(res, 400, "invalid channel status");
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");

    db.channel_overrides[merchantId] = {
      ...(db.channel_overrides[merchantId] || {}),
      [platform]: status,
    };
    appendAdminLog(
      db,
      admin,
      merchant,
      "channel_status_changed",
      `${platform}: ${status}`,
      { meta: { platform, status } },
    );
    writeDb(db);

    return res.json({
      ok: true,
      merchant_id: merchantId,
      platform,
      status,
    });
  },
);

router.get("/merchants/:id/note", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  return res.json({
    ok: true,
    merchant_id: merchantId,
    note: db.admin_notes[merchantId] || "",
  });
});

router.put("/merchants/:id/note", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const note = String(req.body?.note || "").trim();
  if (note.length > 5000) {
    return sendError(res, 400, "note is too long");
  }

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  if (note) db.admin_notes[merchantId] = note;
  else delete db.admin_notes[merchantId];

  appendAdminLog(db, admin, merchant, "note_saved", "internal note saved");
  writeDb(db);

  return res.json({ ok: true, merchant_id: merchantId, note });
});

router.get("/admin/deletion-requests", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  if (
    !isOwnerAdmin(admin) &&
    !adminHasPermission(admin, "manage_merchant_status")
  ) {
    return sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permission: "manage_merchant_status",
    });
  }

  const db = ensureDb();
  return res.json({
    ok: true,
    deletion_requests: [...db.deletion_requests].sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    ),
  });
});

router.post(
  "/merchants/:id/deletion-requests",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_merchant_status");
    if (!admin) return;

    if (!isAssistantAdmin(admin)) {
      return sendError(res, 403, "only an assistant admin can submit a deletion request", {
        code: "ASSISTANT_ADMIN_REQUIRED",
      });
    }

    const merchantId = String(req.params.id || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const details = String(req.body?.details || "").trim();

    if (!merchantId) return sendError(res, 400, "merchantId is required");
    if (!isMerchantDeleteReason(reason)) {
      return sendError(res, 400, "invalid deletion reason");
    }
    if (!details) return sendError(res, 400, "deletion request details are required");
    if (details.length > 1000) {
      return sendError(res, 400, "deletion request details are too long");
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");
    if (merchant.status !== "suspended") {
      return sendError(res, 409, "merchant must be suspended before requesting deletion");
    }

    if (
      db.deletion_requests.some(
        (request) =>
          request.merchant_id === merchantId && request.status === "pending",
      )
    ) {
      return sendError(res, 409, "a pending deletion request already exists");
    }

    if (reason === MerchantDeleteReason.RetentionExpired) {
      const retention = calculateRetentionStatus(merchant.subscription_expires_at);
      if (String(retention.retentionStatus) !== "eligible_for_deletion") {
        return sendError(res, 409, "merchant is not eligible for retention deletion");
      }
    }

    const deletionRequest: MerchantDeletionRequest = {
      id: makeId("deletion-request"),
      merchant_id: merchant.id,
      merchant_name: merchant.store_name,
      merchant_phone: merchant.phone,
      requested_by_admin_id: admin.id,
      requested_by_admin_name: admin.owner_name,
      requested_by_admin_phone: admin.phone,
      reason,
      details,
      status: "pending",
      created_at: now(),
    };

    db.deletion_requests.unshift(deletionRequest);
    appendAdminLog(
      db,
      admin,
      merchant,
      "deletion_requested",
      "merchant deletion requested",
      { reason: `${reason}: ${details}` },
    );
    writeDb(db);

    return res.status(201).json({ ok: true, deletion_request: deletionRequest });
  },
);

router.post(
  "/admin/deletion-requests/:requestId/reject",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner) return;

    const requestId = String(req.params.requestId || "").trim();
    const db = ensureDb();
    const deletionRequest = db.deletion_requests.find(
      (request) => request.id === requestId,
    );

    if (!deletionRequest) return sendError(res, 404, "deletion request not found");
    if (deletionRequest.status !== "pending") {
      return sendError(res, 409, "deletion request is already reviewed");
    }

    deletionRequest.status = "rejected";
    deletionRequest.reviewed_by_admin_id = owner.id;
    deletionRequest.reviewed_at = now();
    appendAdminLog(
      db,
      owner,
      { id: deletionRequest.merchant_id, store_name: deletionRequest.merchant_name },
      "deletion_request_rejected",
      "merchant deletion request rejected",
      { reason: deletionRequest.details },
    );
    writeDb(db);

    return res.json({ ok: true, deletion_request: deletionRequest });
  },
);

router.post("/admin/verify-password", (req: Request, res: Response) => {
  const sessionAdmin = requireAdminSession(req, res);
  if (!sessionAdmin) return;

  const adminId = String(req.body?.adminId || "").trim();
  const adminPassword = String(req.body?.adminPassword || "");

  if (!adminId) return sendError(res, 400, "adminId is required");
  if (!adminPassword) {
    return sendError(res, 400, "admin password is required");
  }

  if (
    sessionAdmin.id !== adminId ||
    !verifyPassword(adminPassword, sessionAdmin.password)
  ) {
    return sendError(res, 401, "admin credentials are incorrect");
  }

  return res.json({ ok: true });
});


router.post("/merchants/:id/delete", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const merchantId = String(req.params.id || "").trim();
  const adminId = String(req.body?.adminId || "").trim();
  const adminPassword = String(req.body?.adminPassword || "");
  const deletionRequestId = String(req.body?.deletionRequestId || "").trim();

  if (!merchantId) return sendError(res, 400, "merchantId is required");
  if (!adminId) return sendError(res, 400, "adminId is required");
  if (!adminPassword) return sendError(res, 400, "admin password is required");
  if (!deletionRequestId) {
    return sendError(res, 400, "deletionRequestId is required");
  }

  const db = ensureDb();

  if (
    owner.id !== adminId ||
    !verifyPassword(adminPassword, owner.password)
  ) {
    return sendError(res, 401, "admin credentials are incorrect");
  }

  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");
  if (merchant.status !== "suspended") {
    return sendError(res, 409, "merchant must remain suspended until deletion review");
  }

  const deletionRequest = db.deletion_requests.find(
    (request) =>
      request.id === deletionRequestId &&
      request.merchant_id === merchantId,
  );

  if (!deletionRequest) {
    return sendError(res, 404, "deletion request not found");
  }
  if (deletionRequest.status !== "pending") {
    return sendError(res, 409, "deletion request is already reviewed");
  }

  const retention = calculateRetentionStatus(
    merchant.subscription_expires_at,
  );

  if (
    deletionRequest.reason === MerchantDeleteReason.RetentionExpired &&
    String(retention.retentionStatus) !== "eligible_for_deletion"
  ) {
    return sendError(res, 409, "merchant is not eligible for retention deletion");
  }

  try {
    const result = deleteMerchant({
      merchantId,
      reason: deletionRequest.reason,
      performedBy: owner.id,
      performedAt: now(),
      retentionStatus: retention.retentionStatus,
    });

    const latestDb = ensureDb();
    const latestRequest = latestDb.deletion_requests.find(
      (request) => request.id === deletionRequestId,
    );

    if (latestRequest) {
      latestRequest.status = "completed";
      latestRequest.reviewed_by_admin_id = owner.id;
      latestRequest.reviewed_at = now();
    }

    delete latestDb.channel_overrides[merchantId];
    delete latestDb.admin_notes[merchantId];
    appendAdminLog(
      latestDb,
      owner,
      merchant,
      "merchant_deleted",
      "merchant account and dependent data permanently deleted",
      { reason: `${deletionRequest.reason}: ${deletionRequest.details}` },
    );
    writeDb(latestDb);

    return res.json({
      ...result,
      deletion_request: latestRequest || deletionRequest,
    });
  } catch (error) {
    console.error("Merchant deletion failed:", error);

    const message =
      error instanceof Error
        ? error.message
        : "merchant deletion failed";

    if (message.includes("not eligible")) {
      return sendError(res, 409, message);
    }

    return sendError(res, 500, "merchant deletion failed");
  }
});


router.get("/admin/subscriptions", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    subscriptions: [...db.subscriptions].sort(
      (left, right) =>
        new Date(right.start_date).getTime() -
        new Date(left.start_date).getTime(),
    ),
  });
});

router.post("/admin/subscriptions/migrate", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const candidates = Array.isArray(req.body?.subscriptions)
    ? req.body.subscriptions
    : [];
  if (candidates.length > 1000) {
    return sendError(res, 400, "too many subscriptions to migrate");
  }

  const db = ensureDb();
  let imported = 0;

  for (const candidate of candidates) {
    const subscription = normalizeSubscriptionRecord(candidate);
    if (!subscription) continue;
    const merchant = findRegularMerchant(db, subscription.merchant_id);
    if (!merchant) continue;
    if (db.subscriptions.some(
      (existing) => existing.merchant_id === subscription.merchant_id,
    )) {
      continue;
    }

    db.subscriptions.push(subscription);
    merchant.subscription_started_at = subscription.start_date;
    merchant.subscription_expires_at = subscription.expires_at;
    merchant.warning_stage = 0;
    merchant.retention_status = MerchantRetentionStatus.Protected;
    merchant.eligible_for_deletion_at = undefined;
    merchant.grace_period_ends_at = undefined;
    imported += 1;
  }

  if (imported > 0) writeDb(db);
  return res.json({ ok: true, imported, subscriptions: db.subscriptions });
});

router.put("/merchants/:id/subscription", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const operation = String(req.body?.operation || "").trim() as
    | "activate"
    | "change"
    | "renew";
  const plan = String(req.body?.plan || "").trim();

  if (!merchantId) return sendError(res, 400, "merchantId is required");
  if (!["activate", "change", "renew"].includes(operation)) {
    return sendError(res, 400, "invalid subscription operation");
  }
  if (!isSubscriptionPlan(plan) || plan === "trial") {
    return sendError(res, 400, "invalid paid subscription plan");
  }

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const existingIndex = db.subscriptions.findIndex(
    (subscription) => subscription.merchant_id === merchantId,
  );
  const existing = existingIndex >= 0
    ? recalculateSubscriptionTotals(db.subscriptions[existingIndex])
    : undefined;
  const existingExpired = existing
    ? new Date(existing.expires_at).getTime() <= Date.now()
    : true;
  const existingBaseExhausted = existing
    ? existing.base_replies_remaining <= 0
    : false;
  const canStartNewCycle = existingExpired || existingBaseExhausted;

  if (operation === "activate" && existing) {
    return sendError(res, 409, "merchant already has a subscription");
  }
  if ((operation === "change" || operation === "renew") && !existing) {
    return sendError(res, 409, "merchant does not have a subscription");
  }
  if (
    (operation === "change" || operation === "renew") &&
    existing &&
    !canStartNewCycle
  ) {
    return sendError(
      res,
      409,
      "a new subscription cycle requires exhausted base replies or an expired subscription",
      {
        code: "SUBSCRIPTION_CYCLE_STILL_ACTIVE",
        base_replies_remaining: existing.base_replies_remaining,
        expires_at: existing.expires_at,
      },
    );
  }
  if (operation === "renew" && existing && existing.plan_name !== plan) {
    return sendError(res, 409, "renewal must keep the current plan");
  }

  const previousExpiresAt = existing?.expires_at;
  const previousPlanName = existing?.plan_name;
  const emergencyDeduction = existing?.emergency_debt || 0;
  const subscription = createPaidSubscription(
    merchantId,
    plan,
    existing,
    operation,
  );
  if (existingIndex >= 0) db.subscriptions[existingIndex] = subscription;
  else db.subscriptions.push(subscription);

  if (previousExpiresAt && previousExpiresAt !== subscription.expires_at) {
    merchant.last_subscription_ended_at = existingExpired
      ? previousExpiresAt
      : subscription.start_date;
  }
  merchant.subscription_started_at = subscription.start_date;
  merchant.subscription_expires_at = subscription.expires_at;
  merchant.warning_stage = 0;
  merchant.retention_status = MerchantRetentionStatus.Protected;
  merchant.eligible_for_deletion_at = undefined;
  merchant.grace_period_ends_at = undefined;

  const actionType = operation === "activate"
    ? "plan_activated"
    : operation === "change"
      ? "plan_changed"
      : "plan_renewed";
  appendAdminLog(
    db,
    admin,
    merchant,
    actionType,
    `subscription ${operation}: ${plan}`,
    {
      meta: {
        plan,
        ...(emergencyDeduction > 0
          ? { emergency_deduction: emergencyDeduction }
          : {}),
      },
    },
  );
  const merchantNotification = appendMerchantSubscriptionPlanNotification(
    db,
    merchantId,
    operation,
    subscription,
    previousPlanName,
    Math.max(0, emergencyDeduction - subscription.emergency_debt),
  );
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    subscription,
    notification: merchantNotification,
  });
});

router.patch("/merchants/:id/subscription", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const action = String(req.body?.action || "").trim();
  const amount = Number(req.body?.amount);
  const enabled = req.body?.enabled;

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (!subscription) return sendError(res, 404, "subscription not found");

  recalculateSubscriptionTotals(subscription);
  let actionType = "";
  let details = "";
  let meta: Record<string, string | number> = {};
  let merchantNotification: MerchantBalanceNotificationRecord | undefined;

  if (action === "add_replies") {
    if (!Number.isInteger(amount) || amount <= 0) {
      return sendError(res, 400, "positive integer amount is required");
    }
    const purchase = purchaseAdditionalReplies(subscription, amount);
    if (subscription.status === "replies_exhausted" && subscription.replies_remaining > 0) {
      subscription.status = "active";
      subscription.auto_reply_enabled = true;
    }
    actionType = "replies_added";
    details = `purchased ${amount} replies`;
    meta = {
      amount,
      emergency_debt_paid: purchase.debtPaid,
      addon_replies_added: purchase.addonAdded,
    };
    merchantNotification = appendMerchantBalanceNotification(
      db,
      merchant.id,
      amount,
      purchase,
      subscription,
    );
  } else if (action === "deduct_replies") {
    if (!Number.isInteger(amount) || amount <= 0) {
      return sendError(res, 400, "positive integer amount is required");
    }
    if (amount > subscription.replies_remaining) {
      return sendError(res, 409, "amount exceeds remaining replies", {
        replies_remaining: subscription.replies_remaining,
      });
    }
    consumeReplies(subscription, amount);
    recalculateSubscriptionTotals(subscription);
    actionType = "replies_deducted";
    details = `deducted ${amount} replies`;
    meta = { amount };
  } else if (action === "reset_replies") {
    subscription.base_replies_used = 0;
    recalculateSubscriptionTotals(subscription);
    actionType = "replies_reset";
    details = `base reply counter reset to ${subscription.base_reply_limit}`;
    meta = { limit: subscription.base_reply_limit };
  } else if (action === "set_auto_reply") {
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "enabled boolean is required");
    }
    if (enabled && subscription.status !== "active") {
      return sendError(res, 409, "automatic replies require an active subscription");
    }
    subscription.auto_reply_enabled = enabled;
    actionType = enabled ? "auto_reply_enabled" : "auto_reply_disabled";
    details = enabled ? "automatic replies enabled" : "automatic replies disabled";
  } else {
    return sendError(res, 400, "invalid subscription action");
  }

  appendAdminLog(db, admin, merchant, actionType, details, { meta });
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");
  return res.json({
    ok: true,
    subscription,
    ...(merchantNotification ? { notification: merchantNotification } : {}),
  });
});

router.patch("/merchants/:id/status", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const status = String(req.body?.status || "").trim() as MerchantStatus;
  const reason = String(req.body?.reason || "").trim();

  if (!["pending_activation", "approved", "rejected", "suspended"].includes(status)) {
    return sendError(res, 400, "invalid status");
  }

  const db = ensureDb();
  const merchant = db.merchants.find((item) => item.id === merchantId && !item.is_admin);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const hasPendingDeletionRequest = db.deletion_requests.some(
    (request) =>
      request.merchant_id === merchantId && request.status === "pending",
  );
  if (hasPendingDeletionRequest && status !== "suspended") {
    return sendError(
      res,
      409,
      "merchant must remain suspended until the deletion request is reviewed",
    );
  }

  if (status === "approved" && merchant.otp_verified !== true) {
    return sendError(res, 409, "phone number must be verified before approval");
  }

  if ((status === "suspended" || status === "rejected") && !reason) {
    return sendError(res, 400, "reason is required for this status");
  }

  const previousStatus = merchant.status;
  const transitionAt = now();
  merchant.status = status;

  if (status === "approved") {
    merchant.account_status = "approved";

    if (previousStatus !== "suspended") {
      merchant.approved_at = transitionAt;
      merchant.channel_activation_deadline = new Date(
        new Date(transitionAt).getTime() + ACCOUNT_CHANNEL_ACTIVATION_MS,
      ).toISOString();

      if (merchant.onboarding_status !== "channel_connected") {
        merchant.onboarding_status = "awaiting_channel";
      }
      if (merchant.trial_status === "eligible" || !merchant.trial_status) {
        merchant.trial_status = "not_started";
      }
    }
  } else if (status === "pending_activation") {
    merchant.account_status = "pending_review";
    merchant.onboarding_status = "pending_review";
    merchant.approved_at = undefined;
    merchant.channel_activation_deadline = undefined;
    if (merchant.trial_status === "not_started" || !merchant.trial_status) {
      merchant.trial_status = "eligible";
    }
  } else if (status === "rejected") {
    merchant.account_status = "rejected";
    merchant.onboarding_status = "pending_review";
    merchant.channel_activation_deadline = undefined;
  } else {
    merchant.account_status = "suspended";
  }

  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (subscription && status === "suspended") {
    subscription.status = "suspended";
    subscription.auto_reply_enabled = false;
  } else if (
    subscription &&
    status === "approved" &&
    previousStatus === "suspended"
  ) {
    const expired = new Date(subscription.expires_at).getTime() <= Date.now();
    subscription.status = expired
      ? "expired"
      : subscription.replies_remaining <= 0
        ? "replies_exhausted"
        : "active";
    subscription.auto_reply_enabled = subscription.status === "active";
  }

  appendAdminLog(
    db,
    admin,
    merchant,
    status === "approved" && previousStatus === "suspended"
      ? "unsuspended"
      : status === "pending_activation"
        ? "restore_pending"
        : status,
    `merchant status changed from ${previousStatus} to ${status}`,
    { ...(reason ? { reason } : {}) },
  );
  writeDb(db);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

export default router;
