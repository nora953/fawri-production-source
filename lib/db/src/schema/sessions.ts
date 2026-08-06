import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  deviceTrustStatusEnum,
  sessionKindEnum,
  sessionStatusEnum,
} from "./enums";
import { merchants } from "./merchants";

export const accountSessions = pgTable(
  "account_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    kind: sessionKindEnum("kind").notNull(),
    status: sessionStatusEnum("status").notNull().default("active"),
    tokenHash: text("token_hash").notNull(),
    deviceId: text("device_id"),
    deviceLabel: text("device_label"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    sessionVersion: text("session_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByAccountId: text("revoked_by_account_id").references(
      () => merchants.id,
      { onDelete: "set null" },
    ),
    revokeReason: text("revoke_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("account_sessions_token_hash_unique").on(
      table.tokenHash,
    ),
    accountStatusIndex: index("account_sessions_account_status_idx").on(
      table.accountId,
      table.status,
    ),
    expiryIndex: index("account_sessions_expires_at_idx").on(table.expiresAt),
  }),
);

export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    label: text("label"),
    userAgent: text("user_agent"),
    status: deviceTrustStatusEnum("status").notNull().default("pending"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    trustedAt: timestamp("trusted_at", { withTimezone: true }),
    trustedByAdminId: text("trusted_by_admin_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    accountDeviceUnique: uniqueIndex("trusted_devices_account_device_unique").on(
      table.accountId,
      table.deviceId,
    ),
    statusIndex: index("trusted_devices_status_idx").on(
      table.accountId,
      table.status,
    ),
  }),
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    phone: text("phone"),
    kind: sessionKindEnum("kind").notNull(),
    success: text("success").notNull(),
    reasonCode: text("reason_code"),
    deviceId: text("device_id"),
    deviceLabel: text("device_label"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    phoneCreatedIndex: index("login_attempts_phone_created_idx").on(
      table.phone,
      table.createdAt,
    ),
    accountCreatedIndex: index("login_attempts_account_created_idx").on(
      table.accountId,
      table.createdAt,
    ),
  }),
);

export type AccountSession = typeof accountSessions.$inferSelect;
export type NewAccountSession = typeof accountSessions.$inferInsert;
