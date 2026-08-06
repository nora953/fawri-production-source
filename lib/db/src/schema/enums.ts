import { pgEnum } from "drizzle-orm/pg-core";

export const interfaceLanguageEnum = pgEnum("interface_language", [
  "ar",
  "ku",
  "en",
]);

export const merchantStatusEnum = pgEnum("merchant_status", [
  "pending_activation",
  "approved",
  "rejected",
  "suspended",
]);

export const accountStatusEnum = pgEnum("account_status", [
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
