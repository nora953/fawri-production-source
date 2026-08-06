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
  accountKindEnum,
  accountStateEnum,
  interfaceLanguageEnum,
} from "./enums";

/**
 * Authentication identity shared by merchants and administrators.
 *
 * Business data never lives in this table. Merchant and administrator
 * profiles are stored separately so an administrator is not represented as a
 * fake merchant, which was a legacy JSON limitation.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    kind: accountKindEnum("kind").notNull(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    state: accountStateEnum("state").notNull().default("active"),
    language: interfaceLanguageEnum("language").notNull().default("ar"),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    sessionVersion: integer("session_version").notNull().default(1),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
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
    phoneUnique: uniqueIndex("accounts_phone_unique").on(table.phone),
    kindStateIndex: index("accounts_kind_state_idx").on(
      table.kind,
      table.state,
    ),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
