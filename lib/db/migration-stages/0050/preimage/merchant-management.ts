import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { channelPlatformEnum, channelStatusEnum } from "./enums";
import { adminProfiles, merchants } from "./merchants";

/**
 * Server-authoritative merchant notes used by the administrative merchant UI.
 * Notes are operational data and are purged with the merchant tombstone flow.
 */
export const merchantAdminNotes = pgTable(
  "merchant_admin_notes",
  {
    merchantId: text("merchant_id")
      .primaryKey()
      .references(() => merchants.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    updatedByAdminId: text("updated_by_admin_id").references(
      () => adminProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    noteLengthCheck: check(
      "merchant_admin_notes_length_check",
      sql`char_length(${table.note}) <= 5000`,
    ),
    timestampOrderCheck: check(
      "merchant_admin_notes_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

/**
 * Historical administrative overrides are kept separate from canonical channel
 * connections. Importing an old override must never manufacture a real channel
 * credential/connection row.
 */
export const merchantChannelOverrides = pgTable(
  "merchant_channel_overrides",
  {
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    platform: channelPlatformEnum("platform").notNull(),
    status: channelStatusEnum("status").notNull(),
    updatedByAdminId: text("updated_by_admin_id").references(
      () => adminProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.merchantId, table.platform] }),
    statusIndex: index("merchant_channel_overrides_status_idx").on(
      table.platform,
      table.status,
    ),
    timestampOrderCheck: check(
      "merchant_channel_overrides_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

/**
 * Deletion requests preserve an immutable review trail even if the merchant FK
 * is removed in a future archival migration. Merchant snapshots are scrubbed
 * when irreversible deletion completes so this table is not a PII archive.
 */
export const merchantDeletionRequests = pgTable(
  "merchant_deletion_requests",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    merchantIdSnapshot: text("merchant_id_snapshot").notNull(),
    merchantNameSnapshot: text("merchant_name_snapshot").notNull(),
    merchantPhoneSnapshot: text("merchant_phone_snapshot").notNull(),
    requestedByAdminId: text("requested_by_admin_id").references(
      () => adminProfiles.id,
      { onDelete: "set null" },
    ),
    requestedByAdminIdSnapshot: text("requested_by_admin_id_snapshot").notNull(),
    requestedByAdminNameSnapshot: text("requested_by_admin_name_snapshot").notNull(),
    requestedByAdminPhoneSnapshot: text("requested_by_admin_phone_snapshot").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull(),
    status: text("status").notNull().default("pending"),
    reviewedByAdminId: text("reviewed_by_admin_id").references(
      () => adminProfiles.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pendingMerchantUnique: uniqueIndex(
      "merchant_deletion_requests_pending_merchant_unique",
    )
      .on(table.merchantIdSnapshot)
      .where(sql`${table.status} = 'pending'`),
    statusCreatedIndex: index("merchant_deletion_requests_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    reasonCheck: check(
      "merchant_deletion_requests_reason_check",
      sql`${table.reason} IN ('policy_violation', 'retention_expired')`,
    ),
    statusCheck: check(
      "merchant_deletion_requests_status_check",
      sql`${table.status} IN ('pending', 'rejected', 'completed')`,
    ),
    detailsLengthCheck: check(
      "merchant_deletion_requests_details_length_check",
      sql`char_length(${table.details}) BETWEEN 1 AND 1000`,
    ),
    reviewStateCheck: check(
      "merchant_deletion_requests_review_state_check",
      sql`(${table.status} = 'pending' AND ${table.reviewedAt} IS NULL AND ${table.completedAt} IS NULL) OR (${table.status} = 'rejected' AND ${table.reviewedAt} IS NOT NULL AND ${table.completedAt} IS NULL) OR (${table.status} = 'completed' AND ${table.reviewedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL)`,
    ),
  }),
);

export type MerchantAdminNote = typeof merchantAdminNotes.$inferSelect;
export type MerchantChannelOverride = typeof merchantChannelOverrides.$inferSelect;
export type MerchantDeletionRequest = typeof merchantDeletionRequests.$inferSelect;
