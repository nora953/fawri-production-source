import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  conversationStatusEnum,
  messageSenderEnum,
  messageStatusEnum,
  replyTypeEnum,
} from "./enums";
import { merchantChannels } from "./channels";
import { merchants } from "./merchants";

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    channelId: text("channel_id").references(() => merchantChannels.id, {
      onDelete: "set null",
    }),
    externalConversationId: text("external_conversation_id"),
    customerExternalId: text("customer_external_id").notNull(),
    customerName: text("customer_name"),
    customerHandle: text("customer_handle"),
    status: conversationStatusEnum("status")
      .notNull()
      .default("auto_replying"),
    assignedToHuman: boolean("assigned_to_human").notNull().default(false),
    assignedAccountId: text("assigned_account_id"),
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
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
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
    externalMessageUnique: uniqueIndex("messages_external_message_unique")
      .on(table.externalMessageId)
      .where(sql`${table.externalMessageId} is not null`),
    externalEventUnique: uniqueIndex("messages_external_event_unique")
      .on(table.externalEventId)
      .where(sql`${table.externalEventId} is not null`),
    conversationCreatedIndex: index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    merchantCreatedIndex: index("messages_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
  }),
);

export const processedChannelEvents = pgTable(
  "processed_channel_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "cascade",
    }),
    channelId: text("channel_id").references(() => merchantChannels.id, {
      onDelete: "cascade",
    }),
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
    externalEventUnique: uniqueIndex(
      "processed_channel_events_external_event_unique",
    ).on(table.externalEventId),
    statusReceivedIndex: index("processed_channel_events_status_received_idx").on(
      table.processingStatus,
      table.receivedAt,
    ),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ProcessedChannelEvent = typeof processedChannelEvents.$inferSelect;
