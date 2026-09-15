import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
  accountKindEnum,
  accountStateEnum,
  interfaceLanguageEnum,
} from "./enums";

/**
 * Authentication identity shared by merchants and administrators.
 * Role-specific profiles prove their account kind through (id, kind).
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    kind: accountKindEnum("kind").notNull(),
    // Closed merchant tombstones deliberately clear the phone so irreversible
    // deletion does not retain the login identifier. Active accounts are still
    // required to provide a valid phone by application authority.
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    passwordVersion: integer("password_version").notNull().default(1),
    securityVersion: integer("security_version").notNull().default(1),
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
    idKindUnique: unique("accounts_id_kind_unique").on(table.id, table.kind),
    phoneUnique: uniqueIndex("accounts_phone_unique").on(table.phone),
    kindStateIndex: index("accounts_kind_state_idx").on(
      table.kind,
      table.state,
    ),
    passwordVersionCheck: check(
      "accounts_password_version_check",
      sql`${table.passwordVersion} > 0`,
    ),
    securityVersionCheck: check(
      "accounts_security_version_check",
      sql`${table.securityVersion} > 0`,
    ),
    sessionVersionCheck: check(
      "accounts_session_version_check",
      sql`${table.sessionVersion} > 0`,
    ),
    phoneShapeCheck: check(
      "accounts_phone_shape_check",
      sql`${table.phone} IS NULL OR ${table.phone} ~ '^07[0-9]{9}$'`,
    ),
    activePhoneCheck: check(
      "accounts_active_phone_required_check",
      sql`${table.state} = 'closed' OR ${table.phone} IS NOT NULL`,
    ),
    timestampOrderCheck: check(
      "accounts_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;