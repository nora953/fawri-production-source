import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products, productVariants } from "./catalog";
import { merchantLocations } from "./merchant-locations";
import { merchants } from "./merchants";

export const locationInventoryLevels = pgTable(
  "location_inventory_levels",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    locationId: text("location_id").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    quantity: integer("quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    merchantForeignKey: foreignKey({
      name: "location_inventory_levels_merchant_fk",
      columns: [table.merchantId],
      foreignColumns: [merchants.id],
    }).onDelete("cascade"),
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
      name: "location_inventory_levels_variant_tenant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("cascade"),
    productLevelUnique: uniqueIndex(
      "location_inventory_levels_product_level_unique",
    )
      .on(table.merchantId, table.locationId, table.productId)
      .where(sql`${table.variantId} IS NULL`),
    variantLevelUnique: uniqueIndex(
      "location_inventory_levels_variant_level_unique",
    )
      .on(table.merchantId, table.locationId, table.productId, table.variantId)
      .where(sql`${table.variantId} IS NOT NULL`),
    locationProductIndex: index(
      "location_inventory_levels_location_product_idx",
    ).on(table.merchantId, table.locationId, table.productId),
    quantityCheck: check(
      "location_inventory_levels_quantity_check",
      sql`${table.quantity} >= 0 AND ${table.lowStockThreshold} >= 0`,
    ),
    versionCheck: check(
      "location_inventory_levels_version_check",
      sql`${table.version} > 0`,
    ),
    timestampCheck: check(
      "location_inventory_levels_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export type LocationInventoryLevel = typeof locationInventoryLevels.$inferSelect;
export type NewLocationInventoryLevel = typeof locationInventoryLevels.$inferInsert;
