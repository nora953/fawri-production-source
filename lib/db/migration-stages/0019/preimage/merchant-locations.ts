import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { merchants } from "./merchants";

export const merchantLocations = pgTable(
  "merchant_locations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    legacyBranchKey: text("legacy_branch_key"),
    isDefault: boolean("is_default").notNull().default(false),
    operationalStatus: text("operational_status").notNull().default("open"),
    onlineFulfillmentEnabled: boolean("online_fulfillment_enabled")
      .notNull()
      .default(false),
    acceptOnlineOrdersWhileClosed: boolean("accept_online_orders_while_closed")
      .notNull()
      .default(false),
    merchantPriority: integer("merchant_priority").notNull().default(0),
    city: text("city"),
    area: text("area"),
    address: text("address"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    inventoryFreshAt: timestamp("inventory_fresh_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantForeignKey: foreignKey({
      name: "merchant_locations_merchant_fk",
      columns: [table.merchantId],
      foreignColumns: [merchants.id],
    }).onDelete("cascade"),
    idMerchantUnique: unique("merchant_locations_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantLegacyBranchUnique: uniqueIndex(
      "merchant_locations_merchant_legacy_branch_unique",
    )
      .on(table.merchantId, table.legacyBranchKey)
      .where(sql`${table.legacyBranchKey} IS NOT NULL`),
    merchantDefaultUnique: uniqueIndex("merchant_locations_merchant_default_unique")
      .on(table.merchantId)
      .where(sql`${table.isDefault} = TRUE`),
    merchantStatusIndex: index("merchant_locations_merchant_status_idx").on(
      table.merchantId,
      table.operationalStatus,
    ),
    routingIndex: index("merchant_locations_routing_idx").on(
      table.merchantId,
      table.onlineFulfillmentEnabled,
      table.operationalStatus,
      table.merchantPriority,
    ),
    nameCheck: check(
      "merchant_locations_name_check",
      sql`char_length(${table.name}) BETWEEN 1 AND 120`,
    ),
    branchKeyCheck: check(
      "merchant_locations_legacy_branch_key_check",
      sql`${table.legacyBranchKey} IS NULL OR char_length(${table.legacyBranchKey}) BETWEEN 1 AND 120`,
    ),
    statusCheck: check(
      "merchant_locations_operational_status_check",
      sql`${table.operationalStatus} IN ('open','temporarily_unavailable','closed')`,
    ),
    priorityCheck: check(
      "merchant_locations_priority_check",
      sql`${table.merchantPriority} BETWEEN -1000000 AND 1000000`,
    ),
    addressCheck: check(
      "merchant_locations_address_check",
      sql`(${table.city} IS NULL OR char_length(${table.city}) <= 120) AND (${table.area} IS NULL OR char_length(${table.area}) <= 160) AND (${table.address} IS NULL OR char_length(${table.address}) <= 500)`,
    ),
    coordinatesCheck: check(
      "merchant_locations_coordinates_check",
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL AND ${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180)`,
    ),
    timestampCheck: check(
      "merchant_locations_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt} AND (${table.inventoryFreshAt} IS NULL OR ${table.inventoryFreshAt} >= ${table.createdAt})`,
    ),
  }),
);

export type MerchantLocation = typeof merchantLocations.$inferSelect;
export type NewMerchantLocation = typeof merchantLocations.$inferInsert;
