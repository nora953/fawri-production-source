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
  consentDecisionEnum,
  inspectionModeEnum,
  inspectionStatusEnum,
  previewSessionStatusEnum,
  supportSenderTypeEnum,
  supportTicketStatusEnum,
  supportWaitingOnEnum,
} from "./enums";
import { accounts } from "./accounts";
import { merchants } from "./merchants";
import { accountSessions } from "./sessions";

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    category: text("category").notNull(),
    status: supportTicketStatusEnum("status").notNull().default("open"),
    assignedAdminAccountId: text("assigned_admin_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    waitingOn: supportWaitingOnEnum("waiting_on"),
    waitingSince: timestamp("waiting_since", { withTimezone: true }),
    merchantReminderSentAt: timestamp("merchant_reminder_sent_at", {
      withTimezone: true,
    }),
    assistantReminderSentAt: timestamp("assistant_reminder_sent_at", {
      withTimezone: true,
    }),
    ownerEscalatedAt: timestamp("owner_escalated_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
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
    merchantStatusIndex: index("support_tickets_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.updatedAt,
    ),
    assignedStatusIndex: index("support_tickets_assigned_status_idx").on(
      table.assignedAdminAccountId,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    senderType: supportSenderTypeEnum("sender_type").notNull(),
    senderAccountId: text("sender_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    senderNameSnapshot: text("sender_name_snapshot").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketCreatedIndex: index("support_messages_ticket_created_idx").on(
      table.ticketId,
      table.createdAt,
    ),
    merchantCreatedIndex: index("support_messages_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
  }),
);

export const supportAttachments = pgTable(
  "support_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => supportMessages.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("image"),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storageKeyUnique: uniqueIndex("support_attachments_storage_key_unique").on(
      table.storageKey,
    ),
    ticketIndex: index("support_attachments_ticket_idx").on(table.ticketId),
  }),
);

export const supportInspectionRequests = pgTable(
  "support_inspection_requests",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    adminAccountId: text("admin_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    mode: inspectionModeEnum("mode").notNull(),
    reason: text("reason").notNull(),
    status: inspectionStatusEnum("status").notNull().default("pending"),
    consentDecision: consentDecisionEnum("consent_decision"),
    readOnly: boolean("read_only").notNull().default(true),
    sessionDurationMinutes: integer("session_duration_minutes")
      .notNull()
      .default(30),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestExpiresAt: timestamp("request_expires_at", { withTimezone: true })
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (table) => ({
    ticketStatusIndex: index("inspection_requests_ticket_status_idx").on(
      table.ticketId,
      table.status,
    ),
    merchantCreatedIndex: index("inspection_requests_merchant_created_idx").on(
      table.merchantId,
      table.requestedAt,
    ),
  }),
);

export const supportPreviewSessions = pgTable(
  "support_preview_sessions",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => supportInspectionRequests.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    adminAccountId: text("admin_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    adminSessionId: text("admin_session_id").references(() => accountSessions.id, {
      onDelete: "set null",
    }),
    status: previewSessionStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    viewedSections: jsonb("viewed_sections").$type<string[]>().notNull().default([]),
  },
  (table) => ({
    requestUnique: uniqueIndex("support_preview_sessions_request_unique").on(
      table.requestId,
    ),
    activeExpiryIndex: index("support_preview_sessions_status_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
    adminActiveIndex: index("support_preview_sessions_admin_status_idx").on(
      table.adminAccountId,
      table.status,
    ),
  }),
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type SupportAttachment = typeof supportAttachments.$inferSelect;
export type SupportInspectionRequest = typeof supportInspectionRequests.$inferSelect;
export type SupportPreviewSession = typeof supportPreviewSessions.$inferSelect;
