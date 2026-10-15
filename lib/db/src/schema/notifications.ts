import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { notificationAudienceEnum } from "./enums";
import { accounts } from "./accounts";
import { merchants } from "./merchants";

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    audience: notificationAudienceEnum("audience").notNull(),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "cascade",
    }),
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    titleKey: text("title_key").notNull(),
    bodyKey: text("body_key").notNull(),
    variables: jsonb("variables")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: text("source_entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantUnreadIndex: index("notifications_merchant_unread_idx").on(
      table.merchantId,
      table.readAt,
      table.createdAt,
    ),
    accountUnreadIndex: index("notifications_account_unread_idx").on(
      table.accountId,
      table.readAt,
      table.createdAt,
    ),
    sourceIndex: index("notifications_source_idx").on(
      table.sourceEntityType,
      table.sourceEntityId,
    ),
  }),
);

export type Notification = typeof notifications.$inferSelect;
