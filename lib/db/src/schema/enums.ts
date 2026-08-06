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

export const savedAnswerCategoryEnum = pgEnum("saved_answer_category", [
  "delivery",
  "payment",
  "return_exchange",
  "product",
  "warranty",
  "custom",
]);

export const trainingStatusEnum = pgEnum("training_status", [
  "pending_merchant_reply",
  "pending_review",
  "approved",
  "rejected",
]);

export const learnedAnswerSourceEnum = pgEnum("learned_answer_source", [
  "merchant_approved",
  "openai_generated",
]);

export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const supportWaitingOnEnum = pgEnum("support_waiting_on", [
  "admin",
  "merchant",
]);

export const supportSenderTypeEnum = pgEnum("support_sender_type", [
  "merchant",
  "admin",
  "system",
]);

export const inspectionModeEnum = pgEnum("inspection_mode", [
  "live_observation",
  "independent_read_only",
]);

export const inspectionStatusEnum = pgEnum("inspection_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const consentDecisionEnum = pgEnum("consent_decision", [
  "approved",
  "rejected",
]);

export const previewSessionStatusEnum = pgEnum("preview_session_status", [
  "active",
  "ended",
]);

export const notificationAudienceEnum = pgEnum("notification_audience", [
  "merchant",
  "admin",
]);

export const emergencySeverityEnum = pgEnum("emergency_severity", [
  "high",
  "critical",
]);

export const emergencyAccessStatusEnum = pgEnum("emergency_access_status", [
  "pending",
  "active",
  "rejected",
  "expired",
  "ended",
]);

export const emergencyActivationModeEnum = pgEnum(
  "emergency_activation_mode",
  [
    "owner_approval",
    "critical_self_activation",
    "owner_direct_activation",
  ],
);

export const auditActorKindEnum = pgEnum("audit_actor_kind", [
  "account",
  "system",
  "external",
]);

export const migrationModeEnum = pgEnum("migration_mode", [
  "dry_run",
  "rollback_test",
  "commit_test",
  "write",
]);

export const migrationRunStatusEnum = pgEnum("migration_run_status", [
  "planned",
  "running",
  "reconciling",
  "committed",
  "rolled_back",
  "cleaned_up",
  "failed",
]);

export const migrationSourceFileStatusEnum = pgEnum(
  "migration_source_file_status",
  ["missing", "parsed", "invalid", "skipped"],
);

export const migrationRecordDispositionEnum = pgEnum(
  "migration_record_disposition",
  ["planned", "inserted", "reconciled", "skipped", "failed"],
);

export const migrationReconciliationStatusEnum = pgEnum(
  "migration_reconciliation_status",
  ["matched", "mismatch", "warning", "skipped"],
);

export const backgroundJobStatusEnum = pgEnum("background_job_status", [
  "queued",
  "processing",
  "retry",
  "completed",
  "dead_letter",
]);

export const jobAttemptStatusEnum = pgEnum("job_attempt_status", [
  "processing",
  "succeeded",
  "failed",
  "timed_out",
]);
