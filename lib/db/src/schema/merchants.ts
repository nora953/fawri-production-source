import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  accountStatusEnum,
  adminPermissionEnum,
  adminRoleEnum,
  interfaceLanguageEnum,
  merchantStatusEnum,
  onboardingStatusEnum,
  signupSourceEnum,
  subscriptionPlanEnum,
  trialStatusEnum,
} from "./enums";

export const merchants = pgTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    ownerName: text("owner_name").notNull(),
    storeName: text("store_name").notNull(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    activityType: text("activity_type").notNull(),
    language: interfaceLanguageEnum("language").notNull().default("ar"),
    status: merchantStatusEnum("status").notNull().default("pending_activation"),
    accountStatus: accountStatusEnum("account_status")
      .notNull()
      .default("pending_review"),
    onboardingStatus: onboardingStatusEnum("onboarding_status")
      .notNull()
      .default("pending_review"),
    trialStatus: trialStatusEnum("trial_status").notNull().default("eligible"),
    signupSource: signupSourceEnum("signup_source").notNull().default("direct"),
    requestedPlan: subscriptionPlanEnum("requested_plan"),
    otpVerified: boolean("otp_verified").notNull().default(false),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    firstChannelConnectedAt: timestamp("first_channel_connected_at", {
      withTimezone: true,
    }),
    channelActivationDeadline: timestamp("channel_activation_deadline", {
      withTimezone: true,
    }),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialExpiresAt: timestamp("trial_expires_at", { withTimezone: true }),
    lastSubscriptionEndedAt: timestamp("last_subscription_ended_at", {
      withTimezone: true,
    }),
    retentionStatus: text("retention_status"),
    warningStage: integer("warning_stage").notNull().default(0),
    gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
    eligibleForDeletionAt: timestamp("eligible_for_deletion_at", {
      withTimezone: true,
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    phoneUnique: uniqueIndex("merchants_phone_unique").on(table.phone),
    statusIndex: index("merchants_status_idx").on(table.status),
    retentionIndex: index("merchants_retention_status_idx").on(
      table.retentionStatus,
    ),
  }),
);

export const adminProfiles = pgTable(
  "admin_profiles",
  {
    merchantId: text("merchant_id")
      .primaryKey()
      .references(() => merchants.id, { onDelete: "cascade" }),
    role: adminRoleEnum("role").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roleIndex: index("admin_profiles_role_idx").on(table.role),
  }),
);

export const adminPermissions = pgTable(
  "admin_permissions",
  {
    adminId: text("admin_id")
      .notNull()
      .references(() => adminProfiles.merchantId, { onDelete: "cascade" }),
    permission: adminPermissionEnum("permission").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    grantedByAdminId: text("granted_by_admin_id").references(
      () => adminProfiles.merchantId,
      { onDelete: "set null" },
    ),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.adminId, table.permission] }),
  }),
);

export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;
export type AdminProfile = typeof adminProfiles.$inferSelect;
export type NewAdminProfile = typeof adminProfiles.$inferInsert;
