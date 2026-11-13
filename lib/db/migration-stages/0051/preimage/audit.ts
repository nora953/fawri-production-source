import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { auditActorKindEnum } from "./enums";
import { accounts } from "./accounts";
import { merchants } from "./merchants";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorKind: auditActorKindEnum("actor_kind").notNull(),
    actorAccountId: text("actor_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    actionType: text("action_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    reasonCode: text("reason_code"),
    details: text("details"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    previousHash: text("previous_hash"),
    eventHash: text("event_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    actorCreatedIndex: index("audit_events_actor_created_idx").on(
      table.actorAccountId,
      table.createdAt,
    ),
    merchantCreatedIndex: index("audit_events_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    entityIndex: index("audit_events_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    actionCreatedIndex: index("audit_events_action_created_idx").on(
      table.actionType,
      table.createdAt,
    ),
  }),
);

export type AuditEvent = typeof auditEvents.$inferSelect;
