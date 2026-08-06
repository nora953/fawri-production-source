import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  emergencyAccessStatusEnum,
  emergencyActivationModeEnum,
  emergencySeverityEnum,
} from "./enums";
import { accounts } from "./accounts";
import { merchants } from "./merchants";
import { accountSessions } from "./sessions";

export const emergencyAuthorizations = pgTable(
  "emergency_authorizations",
  {
    adminAccountId: text("admin_account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    canRequest: boolean("can_request").notNull().default(false),
    canCriticalSelfActivate: boolean("can_critical_self_activate")
      .notNull()
      .default(false),
    grantedByOwnerAccountId: text("granted_by_owner_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    activeIndex: index("emergency_authorizations_active_idx").on(
      table.canRequest,
      table.revokedAt,
    ),
  }),
);

export const emergencyAccessRequests = pgTable(
  "emergency_access_requests",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    requestedByAdminAccountId: text("requested_by_admin_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    incidentReference: text("incident_reference").notNull(),
    severity: emergencySeverityEnum("severity").notNull(),
    reason: text("reason").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    readOnly: boolean("read_only").notNull().default(true),
    status: emergencyAccessStatusEnum("status").notNull().default("pending"),
    activationMode: emergencyActivationModeEnum("activation_mode").notNull(),
    reviewedByOwnerAccountId: text("reviewed_by_owner_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    adminSessionId: text("admin_session_id").references(() => accountSessions.id, {
      onDelete: "set null",
    }),
    requestExpiresAt: timestamp("request_expires_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    viewedSections: jsonb("viewed_sections").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantStatusIndex: index("emergency_requests_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.createdAt,
    ),
    adminStatusIndex: index("emergency_requests_admin_status_idx").on(
      table.requestedByAdminAccountId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const emergencyOwnerAlerts = pgTable(
  "emergency_owner_alerts",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => emergencyAccessRequests.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    titleKey: text("title_key").notNull(),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    requestTypeUnique: uniqueIndex("emergency_owner_alert_request_type_unique").on(
      table.requestId,
      table.type,
    ),
    unreadIndex: index("emergency_owner_alerts_unread_idx").on(
      table.readAt,
      table.createdAt,
    ),
  }),
);

export const emergencyMerchantNotices = pgTable(
  "emergency_merchant_notices",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => emergencyAccessRequests.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    accessedByAdminAccountId: text("accessed_by_admin_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    incidentReference: text("incident_reference").notNull(),
    activationMode: emergencyActivationModeEnum("activation_mode").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    requestUnique: uniqueIndex("emergency_merchant_notice_request_unique").on(
      table.requestId,
    ),
    merchantUnreadIndex: index("emergency_merchant_notices_unread_idx").on(
      table.merchantId,
      table.readAt,
      table.createdAt,
    ),
  }),
);

export type EmergencyAuthorization = typeof emergencyAuthorizations.$inferSelect;
export type EmergencyAccessRequest = typeof emergencyAccessRequests.$inferSelect;
export type EmergencyOwnerAlert = typeof emergencyOwnerAlerts.$inferSelect;
export type EmergencyMerchantNotice = typeof emergencyMerchantNotices.$inferSelect;
