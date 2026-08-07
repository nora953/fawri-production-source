import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
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
import { accounts } from "./accounts";

export const accountSessions = pgTable(
  "account_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: sessionKindEnum("kind").notNull(),
    status: sessionStatusEnum("status").notNull().default("active"),
    tokenHash: text("token_hash").notNull(),
    tenantId: text("tenant_id").notNull(),
    deviceFingerprintHash: text("device_fingerprint_hash"),
    deviceLabel: text("device_label").notNull().default(""),
    sessionVersion: integer("session_version").notNull().default(1),
    securityVersion: integer("security_version").notNull(),
    roleSnapshot: text("role_snapshot"),
    permissionSnapshot: jsonb("permission_snapshot")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      withTimezone: true,
    }).notNull(),
    rotateAfter: timestamp("rotate_after", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByAccountId: text("revoked_by_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    revokeReason: text("revoke_reason"),
    replacedBySessionId: text("replaced_by_session_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
  },
  (table) => ({
    replacementForeignKey: foreignKey({
      name: "account_sessions_replacement_fk",
      columns: [table.replacedBySessionId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    tokenHashUnique: uniqueIndex("account_sessions_token_hash_unique").on(
      table.tokenHash,
    ),
    replacementUnique: uniqueIndex("account_sessions_replacement_unique")
      .on(table.replacedBySessionId)
      .where(sql`${table.replacedBySessionId} IS NOT NULL`),
    accountStatusIndex: index("account_sessions_account_status_idx").on(
      table.accountId,
      table.status,
    ),
    activeExpiryIndex: index("account_sessions_active_expiry_idx").on(
      table.status,
      table.idleExpiresAt,
      table.absoluteExpiresAt,
    ),
    deviceIndex: index("account_sessions_device_idx").on(
      table.accountId,
      table.deviceFingerprintHash,
      table.status,
    ),
    versionsCheck: check(
      "account_sessions_versions_check",
      sql`${table.sessionVersion} > 0 AND ${table.securityVersion} > 0`,
    ),
    expiryCheck: check(
      "account_sessions_expiry_check",
      sql`${table.lastSeenAt} >= ${table.createdAt} AND ${table.lastActivityAt} >= ${table.createdAt} AND ${table.idleExpiresAt} > ${table.createdAt} AND ${table.absoluteExpiresAt} > ${table.createdAt} AND ${table.idleExpiresAt} <= ${table.absoluteExpiresAt} AND ${table.rotateAfter} > ${table.createdAt} AND ${table.rotateAfter} <= ${table.absoluteExpiresAt}`,
    ),
    revocationCheck: check(
      "account_sessions_revocation_check",
      sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL AND ${table.revokeReason} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL AND ${table.revokeReason} IS NOT NULL) OR (${table.status} = 'expired' AND ${table.revokedAt} IS NULL)`,
    ),
    rotationCheck: check(
      "account_sessions_rotation_check",
      sql`${table.replacedBySessionId} IS NULL OR (${table.status} = 'revoked' AND ${table.revokeReason} = 'rotated' AND ${table.revokedAt} IS NOT NULL)`,
    ),
    authorizationSnapshotCheck: check(
      "account_sessions_authorization_snapshot_check",
      sql`jsonb_typeof(${table.permissionSnapshot}) = 'array' AND ((${table.kind} = 'admin' AND ${table.roleSnapshot} IS NOT NULL) OR (${table.kind} = 'merchant' AND ${table.roleSnapshot} IS NULL AND jsonb_array_length(${table.permissionSnapshot}) = 0))`,
    ),
    fingerprintCheck: check(
      "account_sessions_device_fingerprint_check",
      sql`${table.deviceFingerprintHash} IS NULL OR char_length(${table.deviceFingerprintHash}) BETWEEN 32 AND 128`,
    ),
  }),
);

export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: sessionKindEnum("kind").notNull(),
    deviceFingerprintHash: text("device_fingerprint_hash").notNull(),
    label: text("label").notNull().default(""),
    status: deviceTrustStatusEnum("status").notNull().default("pending"),
    trustSlot: integer("trust_slot"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    trustedAt: timestamp("trusted_at", { withTimezone: true }),
    trustedByAccountId: text("trusted_by_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByAccountId: text("revoked_by_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
  },
  (table) => ({
    accountFingerprintUnique: uniqueIndex(
      "trusted_devices_account_fingerprint_unique",
    ).on(table.accountId, table.deviceFingerprintHash),
    trustedSlotUnique: uniqueIndex("trusted_devices_account_slot_unique")
      .on(table.accountId, table.trustSlot)
      .where(sql`${table.trustSlot} IS NOT NULL`),
    statusIndex: index("trusted_devices_status_idx").on(
      table.accountId,
      table.status,
    ),
    fingerprintCheck: check(
      "trusted_devices_fingerprint_check",
      sql`char_length(${table.deviceFingerprintHash}) BETWEEN 32 AND 128`,
    ),
    trustStateCheck: check(
      "trusted_devices_trust_state_check",
      sql`(${table.status} = 'trusted' AND ${table.trustSlot} BETWEEN 1 AND 2 AND ${table.trustedAt} IS NOT NULL AND ${table.trustedByAccountId} IS NOT NULL AND ${table.revokedAt} IS NULL) OR (${table.status} = 'pending' AND ${table.trustSlot} IS NULL AND ${table.trustedAt} IS NULL AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.trustSlot} IS NULL AND ${table.revokedAt} IS NOT NULL)`,
    ),
    timeCheck: check(
      "trusted_devices_time_check",
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`,
    ),
  }),
);

/** Privacy-safe bounded abuse telemetry; raw phone/IP/device strings are absent. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    targetHash: text("target_hash").notNull(),
    kind: sessionKindEnum("kind").notNull(),
    ipHash: text("ip_hash").notNull(),
    success: boolean("success").notNull(),
    reasonCode: text("reason_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    targetCreatedIndex: index("login_attempts_target_created_idx").on(
      table.targetHash,
      table.kind,
      table.createdAt,
    ),
    ipCreatedIndex: index("login_attempts_ip_created_idx").on(
      table.ipHash,
      table.createdAt,
    ),
    expiryIndex: index("login_attempts_expiry_idx").on(table.expiresAt),
    hashCheck: check(
      "login_attempts_hash_check",
      sql`char_length(${table.targetHash}) BETWEEN 32 AND 128 AND char_length(${table.ipHash}) BETWEEN 32 AND 128`,
    ),
    retentionCheck: check(
      "login_attempts_retention_check",
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '30 days'`,
    ),
  }),
);

export type AccountSession = typeof accountSessions.$inferSelect;
export type NewAccountSession = typeof accountSessions.$inferInsert;
export type TrustedDevice = typeof trustedDevices.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
