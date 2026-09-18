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
import { accounts } from "./accounts";
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
    legacyBranchKey: text("legacy_branch_key"),
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
    merchantLegacyBranchUnique: uniqueIndex(
      "merchant_locations_legacy_branch_unique",
    )
      .on(table.merchantId, table.legacyBranchKey)
      .where(sql`${table.legacyBranchKey} IS NOT NULL`),
    merchantStatusIndex: index("merchant_locations_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.operationalStatus,
    ),
    identityCheck: check(
      "merchant_locations_identity_check",
      sql`char_length(btrim(${table.name})) BETWEEN 1 AND 120`,
    ),
    legacyBranchKeyCheck: check(
      "merchant_locations_legacy_branch_key_check",
      sql`${table.legacyBranchKey} IS NULL OR char_length(btrim(${table.legacyBranchKey})) BETWEEN 1 AND 120`,
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


export const locationInventoryMutations = pgTable(
  "location_inventory_mutations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    locationId: text("location_id").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    mutationType: text("mutation_type").notNull(),
    beforeOnHandQuantity: integer("before_on_hand_quantity").notNull(),
    afterOnHandQuantity: integer("after_on_hand_quantity").notNull(),
    beforeReservedQuantity: integer("before_reserved_quantity").notNull(),
    afterReservedQuantity: integer("after_reserved_quantity").notNull(),
    expectedVersion: integer("expected_version").notNull(),
    resultingVersion: integer("resulting_version").notNull(),
    actorType: text("actor_type").notNull(),
    actorAccountId: text("actor_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    operationId: text("operation_id"),
    reasonCode: text("reason_code").notNull(),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    locationTenantForeignKey: foreignKey({
      name: "location_inventory_mutations_location_merchant_fk",
      columns: [table.locationId, table.merchantId],
      foreignColumns: [merchantLocations.id, merchantLocations.merchantId],
    }).onDelete("restrict"),
    productTenantForeignKey: foreignKey({
      name: "location_inventory_mutations_product_merchant_fk",
      columns: [table.productId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("restrict"),
    variantTenantForeignKey: foreignKey({
      name: "location_inventory_mutations_variant_product_merchant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("restrict"),
    merchantIdempotencyUnique: uniqueIndex(
      "location_inventory_mutations_merchant_idempotency_unique",
    ).on(table.merchantId, table.idempotencyKeyHash),
    locationProductOccurredIndex: index(
      "location_inventory_mutations_location_product_occurred_idx",
    ).on(table.merchantId, table.locationId, table.productId, table.occurredAt),
    operationIndex: index(
      "location_inventory_mutations_operation_idx",
    ).on(table.merchantId, table.operationId),
    mutationTypeCheck: check(
      "location_inventory_mutations_type_check",
      sql`${table.mutationType} IN ('set','adjust')`,
    ),
    quantityCheck: check(
      "location_inventory_mutations_quantity_check",
      sql`${table.beforeOnHandQuantity} >= 0 AND ${table.afterOnHandQuantity} >= 0 AND ${table.beforeReservedQuantity} >= 0 AND ${table.afterReservedQuantity} >= 0 AND ${table.beforeReservedQuantity} <= ${table.beforeOnHandQuantity} AND ${table.afterReservedQuantity} <= ${table.afterOnHandQuantity}`,
    ),
    versionCheck: check(
      "location_inventory_mutations_version_check",
      sql`${table.expectedVersion} > 0 AND ${table.resultingVersion} = ${table.expectedVersion} + 1`,
    ),
    actorTypeCheck: check(
      "location_inventory_mutations_actor_type_check",
      sql`${table.actorType} IN ('cashier_operator','merchant','system')`,
    ),
    hashCheck: check(
      "location_inventory_mutations_hash_check",
      sql`char_length(${table.idempotencyKeyHash}) BETWEEN 32 AND 128 AND char_length(${table.requestHash}) BETWEEN 32 AND 128`,
    ),
    operationCheck: check(
      "location_inventory_mutations_operation_check",
      sql`${table.operationId} IS NULL OR char_length(${table.operationId}) BETWEEN 1 AND 200`,
    ),
  }),
);

export type MerchantLocation = typeof merchantLocations.$inferSelect;
export type NewMerchantLocation = typeof merchantLocations.$inferInsert;
export type LocationInventoryLevel = typeof locationInventoryLevels.$inferSelect;
export type NewLocationInventoryLevel = typeof locationInventoryLevels.$inferInsert;
export type LocationInventoryMutation =
  typeof locationInventoryMutations.$inferSelect;
export type NewLocationInventoryMutation =
  typeof locationInventoryMutations.$inferInsert;
