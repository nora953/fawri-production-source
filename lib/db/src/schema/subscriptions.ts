import { sql } from "drizzle-orm";
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
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantUnique: uniqueIndex("subscriptions_merchant_unique").on(
      table.merchantId,
    ),
    statusExpiryIndex: index("subscriptions_status_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
  }),
);

export const subscriptionReplyBatches = pgTable(
  "subscription_reply_batches",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
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
    consumptionIndex: index("reply_batches_consumption_idx").on(
      table.subscriptionId,
      table.expiresAt,
      table.purchasedAt,
    ),
    merchantExpiryIndex: index("reply_batches_merchant_expiry_idx").on(
      table.merchantId,
      table.expiresAt,
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
    subscriptionId: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    replyBatchId: text("reply_batch_id").references(
      () => subscriptionReplyBatches.id,
      { onDelete: "set null" },
    ),
    direction: text("direction").notNull(),
    amount: integer("amount").notNull(),
    reasonCode: text("reason_code").notNull(),
    externalEventId: text("external_event_id"),
    messageId: text("message_id"),
    balanceAfter: integer("balance_after"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventUnique: uniqueIndex("reply_ledger_external_event_unique")
      .on(table.externalEventId)
      .where(sql`${table.externalEventId} is not null`),
    merchantCreatedIndex: index("reply_ledger_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionReplyBatch = typeof subscriptionReplyBatches.$inferSelect;
