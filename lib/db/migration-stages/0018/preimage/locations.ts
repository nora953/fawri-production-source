import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products, productVariants } from "./catalog";
import { merchants } from "./merchants";

export const merchantLocations = pgTable(
  "merchant_locations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    isDefault: boolean("is_default").notNull().default(false),
    operationalStatus: text("operational_status").notNull().default("open"),
    city: text("city"),
    area: text("area"),
    address: text("address"),
    serviceAreas: jsonb("service_areas")
      .$type<string[]>()
      .notNull()
      .default([]),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    onlineFulfillmentEnabled: boolean("online_fulfillment_enabled")
      .notNull()
      .default(true),
    acceptOnlineOrdersWhenClosed: boolean("accept_online_orders_when_closed")
      .notNull()
      .default(true),
    version: integer("version").notNull().default(1),
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
    idMerchantUnique: unique("merchant_locations_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantDefaultUnique: uniqueIndex("merchant_locations_default_unique")
      .on(table.merchantId)
      .where(sql`${table.isDefault} = TRUE`),
    merchantStatusIndex: index("merchant_locations_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.operationalStatus,
    ),
    identityCheck: check(
      "merchant_locations_identity_check",
      sql`char_length(btrim(${table.name})) BETWEEN 1 AND 120`,
    ),
    statusCheck: check(
      "merchant_locations_status_check",
      sql`${table.status} IN ('active','disabled')`,
    ),
    operationalStatusCheck: check(
      "merchant_locations_operational_status_check",
      sql`${table.operationalStatus} IN ('open','temporarily_unavailable','closed')`,
    ),
    serviceAreasCheck: check(
      "merchant_locations_service_areas_check",
      sql`jsonb_typeof(${table.serviceAreas}) = 'array' AND jsonb_array_length(${table.serviceAreas}) <= 100`,
    ),
    coordinatePairCheck: check(
      "merchant_locations_coordinate_pair_check",
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180)`,
    ),
    versionCheck: check(
      "merchant_locations_version_check",
      sql`${table.version} > 0`,
    ),
    timestampCheck: check(
      "merchant_locations_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const locationInventoryLevels = pgTable(
  "location_inventory_levels",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    locationId: text("location_id").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    onHandQuantity: integer("on_hand_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
    version: integer("version").notNull().default(1),
    inventoryFreshAt: timestamp("inventory_fresh_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    locationTenantForeignKey: foreignKey({
      name: "location_inventory_levels_location_merchant_fk",
      columns: [table.locationId, table.merchantId],
      foreignColumns: [merchantLocations.id, merchantLocations.merchantId],
    }).onDelete("cascade"),
    productTenantForeignKey: foreignKey({
      name: "location_inventory_levels_product_merchant_fk",
      columns: [table.productId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("cascade"),
    variantTenantForeignKey: foreignKey({
      name: "location_inventory_levels_variant_product_merchant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("cascade"),
    productLevelUnique: uniqueIndex(
      "location_inventory_levels_product_unique",
    )
      .on(table.merchantId, table.locationId, table.productId)
      .where(sql`${table.variantId} IS NULL`),
    variantLevelUnique: uniqueIndex(
      "location_inventory_levels_variant_unique",
    )
      .on(table.merchantId, table.locationId, table.productId, table.variantId)
      .where(sql`${table.variantId} IS NOT NULL`),
    locationProductIndex: index(
      "location_inventory_levels_location_product_idx",
    ).on(table.merchantId, table.locationId, table.productId),
    quantityCheck: check(
      "location_inventory_levels_quantity_check",
      sql`${table.onHandQuantity} >= 0 AND ${table.reservedQuantity} >= 0 AND ${table.reservedQuantity} <= ${table.onHandQuantity} AND ${table.lowStockThreshold} >= 0`,
    ),
    versionCheck: check(
      "location_inventory_levels_version_check",
      sql`${table.version} > 0`,
    ),
    timestampCheck: check(
      "location_inventory_levels_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt} AND ${table.inventoryFreshAt} >= ${table.createdAt}`,
    ),
  }),
);

export type MerchantLocation = typeof merchantLocations.$inferSelect;
export type NewMerchantLocation = typeof merchantLocations.$inferInsert;
export type LocationInventoryLevel = typeof locationInventoryLevels.$inferSelect;
export type NewLocationInventoryLevel = typeof locationInventoryLevels.$inferInsert;
