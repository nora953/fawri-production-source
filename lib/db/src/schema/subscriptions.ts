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
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  replyBatchSourceEnum,
  subscriptionPlanEnum,
  subscriptionStatusEnum,
} from "./enums";
import { merchants } from "./merchants";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    planName: subscriptionPlanEnum("plan_name").notNull(),
    status: subscriptionStatusEnum("status")
      .notNull()
      .default("pending_activation"),
    priceIqd: integer("price_iqd").notNull().default(0),
    billingAnchorDay: integer("billing_anchor_day").notNull(),
    baseReplyLimit: integer("base_reply_limit").notNull().default(0),
    baseRepliesUsed: integer("base_replies_used").notNull().default(0),
    baseRepliesRemaining: integer("base_replies_remaining").notNull().default(0),
    addonRepliesRemaining: integer("addon_replies_remaining")
      .notNull()
      .default(0),
    emergencyCreditAmount: integer("emergency_credit_amount")
      .notNull()
      .default(0),
    emergencyCreditActivated: boolean("emergency_credit_activated")
      .notNull()
      .default(false),
    emergencyDebt: integer("emergency_debt").notNull().default(0),
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    expiryReminderSentAt: timestamp("expiry_reminder_sent_at", {
      withTimezone: true,
    }),
    expiredNotificationSentAt: timestamp("expired_notification_sent_at", {
      withTimezone: true,
    }),
    version: integer("version").notNull().default(1),
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
    idMerchantUnique: unique("subscriptions_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantUnique: uniqueIndex("subscriptions_merchant_unique").on(
      table.merchantId,
    ),
    statusExpiryIndex: index("subscriptions_status_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
    billingAnchorCheck: check(
      "subscriptions_billing_anchor_check",
      sql`${table.billingAnchorDay} BETWEEN 1 AND 31`,
    ),
    countersCheck: check(
      "subscriptions_counters_check",
      sql`${table.priceIqd} >= 0 AND ${table.baseReplyLimit} >= 0 AND ${table.baseRepliesUsed} >= 0 AND ${table.baseRepliesRemaining} >= 0 AND ${table.addonRepliesRemaining} >= 0 AND ${table.emergencyCreditAmount} >= 0 AND ${table.emergencyDebt} >= 0`,
    ),
    baseUsageCheck: check(
      "subscriptions_base_usage_check",
      sql`${table.baseRepliesUsed} + ${table.baseRepliesRemaining} <= ${table.baseReplyLimit}`,
    ),
    timeRangeCheck: check(
      "subscriptions_time_range_check",
      sql`${table.expiresAt} > ${table.startsAt} AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
    versionCheck: check("subscriptions_version_check", sql`${table.version} > 0`),
  }),
);

export const subscriptionReplyBatches = pgTable(
  "subscription_reply_batches",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    source: replyBatchSourceEnum("source").notNull(),
    amount: integer("amount").notNull(),
    remaining: integer("remaining").notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    expiryReminderSentAt: timestamp("expiry_reminder_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    subscriptionTenantForeignKey: foreignKey({
      name: "reply_batches_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [subscriptions.id, subscriptions.merchantId],
    }).onDelete("cascade"),
    idMerchantUnique: unique("reply_batches_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    consumptionIndex: index("reply_batches_consumption_idx").on(
      table.subscriptionId,
      table.expiresAt,
      table.purchasedAt,
    ),
    merchantExpiryIndex: index("reply_batches_merchant_expiry_idx").on(
      table.merchantId,
      table.expiresAt,
    ),
    amountCheck: check(
      "reply_batches_amount_check",
      sql`${table.amount} > 0 AND ${table.remaining} >= 0 AND ${table.remaining} <= ${table.amount}`,
    ),
    expiryCheck: check(
      "reply_batches_expiry_check",
      sql`${table.expiresAt} > ${table.purchasedAt}`,
    ),
  }),
);

export const replyLedger = pgTable(
  "reply_ledger",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id"),
    replyBatchId: text("reply_batch_id"),
    direction: text("direction").notNull(),
    amount: integer("amount").notNull(),
    reasonCode: text("reason_code").notNull(),
    externalEventId: text("external_event_id"),
    messageId: text("message_id"),
    balanceAfter: integer("balance_after"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    subscriptionTenantForeignKey: foreignKey({
      name: "reply_ledger_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [subscriptions.id, subscriptions.merchantId],
    }).onDelete("restrict"),
    batchTenantForeignKey: foreignKey({
      name: "reply_ledger_batch_merchant_fk",
      columns: [table.replyBatchId, table.merchantId],
      foreignColumns: [subscriptionReplyBatches.id, subscriptionReplyBatches.merchantId],
    }).onDelete("restrict"),
    eventUnique: uniqueIndex("reply_ledger_external_event_unique")
      .on(table.externalEventId)
      .where(sql`${table.externalEventId} is not null`),
    merchantCreatedIndex: index("reply_ledger_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    amountCheck: check("reply_ledger_amount_check", sql`${table.amount} > 0`),
    directionCheck: check(
      "reply_ledger_direction_check",
      sql`${table.direction} IN ('debit', 'credit')`,
    ),
    balanceCheck: check(
      "reply_ledger_balance_check",
      sql`${table.balanceAfter} IS NULL OR ${table.balanceAfter} >= 0`,
    ),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionReplyBatch = typeof subscriptionReplyBatches.$inferSelect;
