import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { conversations, messages } from "./conversations";
import { merchants } from "./merchants";

export const manualReplyRequestStatusEnum = pgEnum(
  "manual_reply_request_status",
  ["pending", "sent", "failed", "uncertain"],
);

export const manualReplyRequests = pgTable(
  "manual_reply_requests",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    textSha256: text("text_sha256").notNull(),
    status: manualReplyRequestStatusEnum("status")
      .notNull()
      .default("pending"),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    externalMessageId: text("external_message_id"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantIdempotencyUnique: uniqueIndex(
      "manual_reply_requests_merchant_idempotency_unique",
    ).on(table.merchantId, table.idempotencyKey),
    conversationCreatedIndex: index(
      "manual_reply_requests_conversation_created_idx",
    ).on(table.conversationId, table.createdAt),
    statusUpdatedIndex: index("manual_reply_requests_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    idempotencyKeyFormatCheck: check(
      "manual_reply_requests_idempotency_key_format_check",
      sql`char_length(${table.idempotencyKey}) between 16 and 128`,
    ),
    textHashFormatCheck: check(
      "manual_reply_requests_text_hash_format_check",
      sql`${table.textSha256} ~ '^[a-f0-9]{64}$'`,
    ),
    timestampOrderCheck: check(
      "manual_reply_requests_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    sentMessageCheck: check(
      "manual_reply_requests_sent_message_check",
      sql`${table.status} <> 'sent' or ${table.messageId} is not null`,
    ),
    failureCodeCheck: check(
      "manual_reply_requests_failure_code_check",
      sql`${table.status} not in ('failed', 'uncertain') or ${table.errorCode} is not null`,
    ),
  }),
);

export type ManualReplyRequest = typeof manualReplyRequests.$inferSelect;
export type NewManualReplyRequest = typeof manualReplyRequests.$inferInsert;
