import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { accountKindEnum } from "./enums";

export const authOtpPurposeEnum = pgEnum("auth_otp_purpose", [
  "signup",
  "password_reset",
  "admin_recovery",
]);

export const authOtpChallenges = pgTable(
  "auth_otp_challenges",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    targetHash: text("target_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    purpose: authOtpPurposeEnum("purpose").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resendAfter: timestamp("resend_after", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    supersededByChallengeId: text("superseded_by_challenge_id"),
  },
  (table) => ({
    supersessionForeignKey: foreignKey({
      name: "auth_otp_challenges_supersession_fk",
      columns: [table.supersededByChallengeId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    liveTargetPurposeUnique: uniqueIndex(
      "auth_otp_challenges_live_target_purpose_unique",
    )
      .on(table.targetHash, table.purpose)
      .where(
        sql`${table.usedAt} IS NULL AND ${table.revokedAt} IS NULL AND ${table.supersededByChallengeId} IS NULL`,
      ),
    supersededByUnique: uniqueIndex(
      "auth_otp_challenges_superseded_by_unique",
    )
      .on(table.supersededByChallengeId)
      .where(sql`${table.supersededByChallengeId} IS NOT NULL`),
    targetCreatedIndex: index("auth_otp_challenges_target_created_idx").on(
      table.targetHash,
      table.purpose,
      table.createdAt,
    ),
    ipCreatedIndex: index("auth_otp_challenges_ip_created_idx").on(
      table.ipHash,
      table.createdAt,
    ),
    attemptsCheck: check(
      "auth_otp_challenges_attempts_check",
      sql`${table.attempts} >= 0 AND ${table.maxAttempts} > 0 AND ${table.attempts} <= ${table.maxAttempts}`,
    ),
    timeCheck: check(
      "auth_otp_challenges_time_check",
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.resendAfter} >= ${table.createdAt} AND ${table.resendAfter} < ${table.expiresAt}`,
    ),
    terminalStateCheck: check(
      "auth_otp_challenges_terminal_state_check",
      sql`NOT (${table.usedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL) AND (${table.usedAt} IS NULL OR (${table.usedAt} >= ${table.createdAt} AND ${table.usedAt} <= ${table.expiresAt})) AND (${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.createdAt}) AND (${table.supersededByChallengeId} IS NULL OR ${table.revokedAt} IS NOT NULL)`,
    ),
    targetHashCheck: check(
      "auth_otp_challenges_target_hash_check",
      sql`char_length(${table.targetHash}) BETWEEN 32 AND 128`,
    ),
    codeHashCheck: check(
      "auth_otp_challenges_code_hash_check",
      sql`char_length(${table.codeHash}) BETWEEN 32 AND 256`,
    ),
    ipHashCheck: check(
      "auth_otp_challenges_ip_hash_check",
      sql`char_length(${table.ipHash}) BETWEEN 32 AND 128`,
    ),
  }),
);

/**
 * Deliberately payload-free authentication security audit storage.
 * No generic JSON/details column exists here so password/OTP/token/cookie/
 * authorization/credential/customer payload material has no persistence slot.
 */
export const authAuditEvents = pgTable(
  "auth_audit_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    actorAccountId: text("actor_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    actorKind: accountKindEnum("actor_kind"),
    subjectHash: text("subject_hash"),
    reasonCode: text("reason_code"),
    decisionCode: text("decision_code"),
    requestIdHash: text("request_id_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventCreatedIndex: index("auth_audit_events_event_created_idx").on(
      table.eventType,
      table.createdAt,
    ),
    actorCreatedIndex: index("auth_audit_events_actor_created_idx").on(
      table.actorAccountId,
      table.createdAt,
    ),
    subjectCreatedIndex: index("auth_audit_events_subject_created_idx").on(
      table.subjectHash,
      table.createdAt,
    ),
    subjectHashCheck: check(
      "auth_audit_events_subject_hash_check",
      sql`${table.subjectHash} IS NULL OR char_length(${table.subjectHash}) BETWEEN 32 AND 128`,
    ),
    requestHashCheck: check(
      "auth_audit_events_request_hash_check",
      sql`${table.requestIdHash} IS NULL OR char_length(${table.requestIdHash}) BETWEEN 32 AND 128`,
    ),
  }),
);

export type AuthOtpChallenge = typeof authOtpChallenges.$inferSelect;
export type AuthAuditEvent = typeof authAuditEvents.$inferSelect;
