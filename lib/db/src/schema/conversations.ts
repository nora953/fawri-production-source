import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { merchantChannels } from "./channels";
import {
  conversationStatusEnum,
  messageSenderEnum,
  messageStatusEnum,
  replyTypeEnum,
} from "./enums";
import { merchants } from "./merchants";

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    externalConversationId: text("external_conversation_id"),
    customerExternalId: text("customer_external_id").notNull(),
    customerName: text("customer_name"),
    customerHandle: text("customer_handle"),
    status: conversationStatusEnum("status")
      .notNull()
      .default("auto_replying"),
    assignedToHuman: boolean("assigned_to_human").notNull().default(false),
    assignedAccountId: text("assigned_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    needsTraining: boolean("needs_training").notNull().default(false),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
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
    channelTenantForeignKey: foreignKey({
      name: "conversations_channel_merchant_fk",
      columns: [table.channelId, table.merchantId],
      foreignColumns: [merchantChannels.id, merchantChannels.merchantId],
    }).onDelete("restrict"),
    idMerchantUnique: uniqueIndex("conversations_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantCustomerUnique: uniqueIndex(
      "conversations_merchant_channel_customer_unique",
    ).on(table.merchantId, table.channelId, table.customerExternalId),
    merchantUpdatedIndex: index("conversations_merchant_updated_idx").on(
      table.merchantId,
      table.updatedAt,
    ),
    merchantStatusIndex: index("conversations_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
    manualAssignmentCheck: check(
      "conversations_manual_assignment_check",
      sql`(${table.status} = 'manual') = ${table.assignedToHuman}`,
    ),
    closedTimestampCheck: check(
      "conversations_closed_timestamp_check",
      sql`(${table.status} <> 'closed') OR ${table.closedAt} IS NOT NULL`,
    ),
    timestampOrderCheck: check(
      "conversations_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    externalMessageId: text("external_message_id"),
    externalEventId: text("external_event_id"),
    sender: messageSenderEnum("sender").notNull(),
    text: text("text").notNull(),
    status: messageStatusEnum("status").notNull(),
    replyType: replyTypeEnum("reply_type"),
    countedAsAutoReply: boolean("counted_as_auto_reply")
      .notNull()
      .default(false),
    failureCode: text("failure_code"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    conversationTenantForeignKey: foreignKey({
      name: "messages_conversation_merchant_fk",
      columns: [table.conversationId, table.merchantId],
      foreignColumns: [conversations.id, conversations.merchantId],
    }).onDelete("cascade"),
    idConversationMerchantUnique: uniqueIndex(
      "messages_id_conversation_merchant_unique",
    ).on(table.id, table.conversationId, table.merchantId),
    externalMessageUnique: uniqueIndex("messages_merchant_external_message_unique")
      .on(table.merchantId, table.externalMessageId)
      .where(sql`${table.externalMessageId} is not null`),
    externalEventUnique: uniqueIndex("messages_merchant_external_event_unique")
      .on(table.merchantId, table.externalEventId)
      .where(sql`${table.externalEventId} is not null`),
    conversationCreatedIndex: index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    merchantCreatedIndex: index("messages_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    statusTimestampCheck: check(
      "messages_status_timestamp_check",
      sql`${table.status} <> 'failed' OR (${table.failedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL)`,
    ),
  }),
);

export const processedChannelEvents = pgTable(
  "processed_channel_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    processingStatus: text("processing_status").notNull(),
    errorCode: text("error_code"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    channelTenantForeignKey: foreignKey({
      name: "processed_channel_events_channel_merchant_fk",
      columns: [table.channelId, table.merchantId],
      foreignColumns: [merchantChannels.id, merchantChannels.merchantId],
    }).onDelete("cascade"),
    externalEventUnique: uniqueIndex(
      "processed_channel_events_channel_external_unique",
    ).on(table.channelId, table.externalEventId),
    statusReceivedIndex: index("processed_channel_events_status_received_idx").on(
      table.processingStatus,
      table.receivedAt,
    ),
    completedTimeCheck: check(
      "processed_channel_events_completed_time_check",
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.receivedAt}`,
    ),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ProcessedChannelEvent = typeof processedChannelEvents.$inferSelect;
