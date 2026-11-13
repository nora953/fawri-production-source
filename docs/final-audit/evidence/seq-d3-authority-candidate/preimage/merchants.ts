import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
  accountKindEnum,
  accountStatusEnum,
  adminPermissionEnum,
  adminRoleEnum,
  merchantStatusEnum,
  onboardingStatusEnum,
  signupSourceEnum,
  subscriptionPlanEnum,
  trialStatusEnum,
} from "./enums";
import { accounts } from "./accounts";

export const merchants = pgTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    profileKind: accountKindEnum("profile_kind").notNull().default("merchant"),
    ownerName: text("owner_name").notNull(),
    storeName: text("store_name").notNull(),
    activityType: text("activity_type").notNull(),
    countryCode: text("country_code").notNull().default("IQ"),
    timezone: text("timezone").notNull().default("Asia/Baghdad"),
    currencyCode: text("currency_code").notNull().default("IQD"),
    status: merchantStatusEnum("status")
      .notNull()
      .default("pending_activation"),
    accountStatus: accountStatusEnum("account_status")
      .notNull()
      .default("pending_review"),
    onboardingStatus: onboardingStatusEnum("onboarding_status")
      .notNull()
      .default("pending_review"),
    trialStatus: trialStatusEnum("trial_status").notNull().default("eligible"),
    signupSource: signupSourceEnum("signup_source").notNull().default("direct"),
    requestedPlan: subscriptionPlanEnum("requested_plan"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
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
    productsReadOnly: boolean("products_read_only").notNull().default(false),
    retentionSuspendedAt: timestamp("retention_suspended_at", {
      withTimezone: true,
    }),
    gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
    eligibleForDeletionAt: timestamp("eligible_for_deletion_at", {
      withTimezone: true,
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountKindForeignKey: foreignKey({
      name: "merchants_account_kind_fk",
      columns: [table.accountId, table.profileKind],
      foreignColumns: [accounts.id, accounts.kind],
    }).onDelete("cascade"),
    accountUnique: uniqueIndex("merchants_account_unique").on(table.accountId),
    statusIndex: index("merchants_status_idx").on(table.status),
    retentionIndex: index("merchants_retention_status_idx").on(
      table.retentionStatus,
    ),
    countryCodeCheck: check(
      "merchants_country_code_check",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    timezoneCheck: check(
      "merchants_timezone_check",
      sql`char_length(${table.timezone}) BETWEEN 1 AND 100`,
    ),
    currencyCodeCheck: check(
      "merchants_currency_code_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    roleExclusivityCheck: check(
      "merchants_profile_kind_check",
      sql`${table.profileKind} = 'merchant' AND ${table.id} = ${table.accountId}`,
    ),
  }),
);

export const adminProfiles = pgTable(
  "admin_profiles",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    profileKind: accountKindEnum("profile_kind").notNull().default("admin"),
    displayName: text("display_name").notNull(),
    role: adminRoleEnum("role").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountKindForeignKey: foreignKey({
      name: "admin_profiles_account_kind_fk",
      columns: [table.accountId, table.profileKind],
      foreignColumns: [accounts.id, accounts.kind],
    }).onDelete("cascade"),
    accountUnique: uniqueIndex("admin_profiles_account_unique").on(
      table.accountId,
    ),
    roleIndex: index("admin_profiles_role_idx").on(table.role),
    roleExclusivityCheck: check(
      "admin_profiles_profile_kind_check",
      sql`${table.profileKind} = 'admin' AND ${table.id} = ${table.accountId}`,
    ),
  }),
);

export const adminPermissions = pgTable(
  "admin_permissions",
  {
    adminId: text("admin_id")
      .notNull()
      .references(() => adminProfiles.id, { onDelete: "cascade" }),
    permission: adminPermissionEnum("permission").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    grantedByAdminId: text("granted_by_admin_id").references(
      () => adminProfiles.id,
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
