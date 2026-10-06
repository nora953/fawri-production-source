import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { merchants } from "./merchants";

export const merchantCashierSubscriptions = pgTable(
  "merchant_cashier_subscriptions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("inactive"),
    licensedStations: integer("licensed_stations").notNull().default(0),
    pricePerStationIqd: integer("price_per_station_iqd").notNull().default(3900),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    merchantUnique: unique("merchant_cashier_subscriptions_merchant_unique").on(table.merchantId),
    statusIndex: index("merchant_cashier_subscriptions_status_idx").on(table.status, table.expiresAt),
    statusCheck: check("merchant_cashier_subscriptions_status_check", sql`${table.status} IN ('inactive','active','grace','suspended','expired')`),
    countersCheck: check("merchant_cashier_subscriptions_counters_check", sql`${table.licensedStations} >= 0 AND ${table.pricePerStationIqd} >= 0 AND ${table.version} > 0`),
    lifecycleCheck: check("merchant_cashier_subscriptions_lifecycle_check", sql`(${table.status} = 'inactive' AND ${table.licensedStations} = 0) OR (${table.status} IN ('active','grace','suspended','expired') AND ${table.licensedStations} > 0 AND ${table.startsAt} IS NOT NULL AND ${table.expiresAt} IS NOT NULL AND ${table.graceUntil} IS NOT NULL AND ${table.expiresAt} > ${table.startsAt} AND ${table.graceUntil} = ${table.expiresAt} + interval '7 days')`),
    timestampCheck: check("merchant_cashier_subscriptions_timestamp_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  }),
);

export type MerchantCashierSubscription = typeof merchantCashierSubscriptions.$inferSelect;
export type NewMerchantCashierSubscription = typeof merchantCashierSubscriptions.$inferInsert;
