import { pgEnum } from "drizzle-orm/pg-core";

export const interfaceLanguageEnum = pgEnum("interface_language", [
  "ar",
  "ku",
  "en",
]);

export const accountKindEnum = pgEnum("account_kind", [
  "merchant",
  "admin",
]);

export const accountStateEnum = pgEnum("account_state", [
  "active",
  "suspended",
  "closed",
]);

export const merchantStatusEnum = pgEnum("merchant_status", [
  "pending_activation",
  "approved",
  "rejected",
  "suspended",
]);

export const accountStatusEnum = pgEnum("merchant_account_status", [
  "pending_review",
  "approved",
  "rejected",
  "suspended",
]);

export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "pending_review",
  "awaiting_channel",
  "channel_connected",
  "activation_expired",
]);

export const trialStatusEnum = pgEnum("trial_status", [
  "eligible",
  "not_started",
  "active",
  "expired",
  "already_used",
  "ineligible",
]);

export const signupSourceEnum = pgEnum("signup_source", [
  "landing_trial",
  "landing_plan",
  "login",
  "direct",
]);

export const adminRoleEnum = pgEnum("admin_role", [
  "owner_admin",
  "assistant_admin",
]);

export const adminPermissionEnum = pgEnum("admin_permission", [
  "view_merchants",
  "manage_merchant_status",
  "manage_subscriptions",
  "manage_channels",
  "view_logs",
  "inspect_merchant_sessions",
  "manage_support",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "silver",
  "gold",
  "diamond",
  "trial",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "pending_activation",
  "active",
  "expired",
  "replies_exhausted",
  "suspended",
]);

export const replyBatchSourceEnum = pgEnum("reply_batch_source", [
  "purchase",
  "emergency",
]);

export const sessionKindEnum = pgEnum("session_kind", [
  "merchant",
  "admin",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "revoked",
  "expired",
]);

export const deviceTrustStatusEnum = pgEnum("device_trust_status", [
  "pending",
  "trusted",
  "revoked",
]);

export const channelPlatformEnum = pgEnum("channel_platform", [
  "messenger",
  "instagram",
  "whatsapp",
  "telegram",
  "tiktok",
  "web_chat",
]);

export const channelStatusEnum = pgEnum("channel_status", [
  "connected",
  "disconnected",
  "pending",
  "error",
  "revoked",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "auto_replying",
  "needs_reply",
  "manual",
  "closed",
]);

export const messageSenderEnum = pgEnum("message_sender", [
  "customer",
  "fawri",
  "merchant",
  "system",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "received",
  "queued",
  "sent",
  "failed",
]);

export const replyTypeEnum = pgEnum("reply_type", [
  "ai",
  "database",
  "fallback",
  "manual",
  "system",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "pending_confirmation",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "out_of_stock",
  "waiting_customer_approval",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "cash_on_delivery",
  "electronic_pending",
  "manual_review",
  "paid",
  "failed",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash_on_delivery",
  "superqi",
  "fastpay",
  "zaincash",
  "other",
]);
