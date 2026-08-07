import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { deviceTrustStatusEnum, sessionKindEnum, sessionStatusEnum } from "./enums";
import { accounts } from "./accounts";

/** Stage-1 keeps legacy columns only so Drizzle can add secure columns without rename prompts. They are removed in the immediately following generated migration. */
export const accountSessions = pgTable("account_sessions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  kind: sessionKindEnum("kind").notNull(),
  status: sessionStatusEnum("status").notNull().default("active"),
  tokenHash: text("token_hash").notNull(),
  deviceId: text("device_id"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  deviceFingerprintHash: text("device_fingerprint_hash"),
  deviceLabel: text("device_label").notNull().default(""),
  tenantId: text("tenant_id").notNull().default("legacy-unset"),
  sessionVersion: integer("session_version").notNull().default(1),
  securityVersion: integer("security_version").notNull().default(1),
  roleSnapshot: text("role_snapshot"),
  permissionSnapshot: jsonb("permission_snapshot").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull().defaultNow(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull().defaultNow(),
  rotateAfter: timestamp("rotate_after", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByAccountId: text("revoked_by_account_id").references(() => accounts.id, { onDelete: "set null" }),
  revokeReason: text("revoke_reason"),
  replacedBySessionId: text("replaced_by_session_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => ({
  replacementForeignKey: foreignKey({ name: "account_sessions_replacement_fk", columns: [table.replacedBySessionId], foreignColumns: [table.id] }).onDelete("set null"),
  tokenHashUnique: uniqueIndex("account_sessions_token_hash_unique").on(table.tokenHash),
  replacementUnique: uniqueIndex("account_sessions_replacement_unique").on(table.replacedBySessionId).where(sql`${table.replacedBySessionId} IS NOT NULL`),
  accountStatusIndex: index("account_sessions_account_status_idx").on(table.accountId, table.status),
  activeExpiryIndex: index("account_sessions_active_expiry_idx").on(table.status, table.idleExpiresAt, table.absoluteExpiresAt),
  deviceIndex: index("account_sessions_device_idx").on(table.accountId, table.deviceFingerprintHash, table.status),
  versionsCheck: check("account_sessions_versions_check", sql`${table.sessionVersion} > 0 AND ${table.securityVersion} > 0`),
  fingerprintCheck: check("account_sessions_device_fingerprint_check", sql`${table.deviceFingerprintHash} IS NULL OR char_length(${table.deviceFingerprintHash}) BETWEEN 32 AND 128`),
}));

export const trustedDevices = pgTable("trusted_devices", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  kind: sessionKindEnum("kind").notNull().default("admin"),
  deviceId: text("device_id"),
  userAgent: text("user_agent"),
  deviceFingerprintHash: text("device_fingerprint_hash").notNull().default("legacy-unset"),
  label: text("label").notNull().default(""),
  status: deviceTrustStatusEnum("status").notNull().default("pending"),
  trustSlot: integer("trust_slot"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  trustedAt: timestamp("trusted_at", { withTimezone: true }),
  trustedByAccountId: text("trusted_by_account_id").references(() => accounts.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByAccountId: text("revoked_by_account_id").references(() => accounts.id, { onDelete: "set null" }),
}, (table) => ({
  accountDeviceLegacyUnique: uniqueIndex("trusted_devices_account_device_unique").on(table.accountId, table.deviceId),
  accountFingerprintUnique: uniqueIndex("trusted_devices_account_fingerprint_unique").on(table.accountId, table.deviceFingerprintHash),
  trustedSlotUnique: uniqueIndex("trusted_devices_account_slot_unique").on(table.accountId, table.trustSlot).where(sql`${table.trustSlot} IS NOT NULL`),
  statusIndex: index("trusted_devices_status_idx").on(table.accountId, table.status),
}));

export const loginAttempts = pgTable("login_attempts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  phone: text("phone"),
  deviceId: text("device_id"),
  deviceLabel: text("device_label"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  targetHash: text("target_hash").notNull().default("legacy-unset"),
  kind: sessionKindEnum("kind").notNull(),
  ipHash: text("ip_hash").notNull().default("legacy-unset"),
  success: boolean("success").notNull(),
  reasonCode: text("reason_code").notNull().default("legacy"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  targetCreatedIndex: index("login_attempts_target_created_idx").on(table.targetHash, table.kind, table.createdAt),
  ipCreatedIndex: index("login_attempts_ip_created_idx").on(table.ipHash, table.createdAt),
  expiryIndex: index("login_attempts_expiry_idx").on(table.expiresAt),
}));

export type AccountSession = typeof accountSessions.$inferSelect;
export type NewAccountSession = typeof accountSessions.$inferInsert;
export type TrustedDevice = typeof trustedDevices.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
