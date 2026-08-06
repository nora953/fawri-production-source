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
import { merchants } from "./merchants";

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    code: text("code"),
    name: text("name").notNull(),
    sku: text("sku"),
    barcode: text("barcode"),
    category: text("category"),
    description: text("description"),
    originalPriceIqd: integer("original_price_iqd").notNull().default(0),
    currentPriceIqd: integer("current_price_iqd").notNull().default(0),
    quantity: integer("quantity").notNull().default(0),
    status: text("status").notNull().default("available"),
    allowFawriReply: boolean("allow_fawri_reply").notNull().default(true),
    imageUrl: text("image_url"),
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    merchantNameIndex: index("products_merchant_name_idx").on(
      table.merchantId,
      table.name,
    ),
    merchantSkuUnique: uniqueIndex("products_merchant_sku_unique").on(
      table.merchantId,
      table.sku,
    ),
    merchantBarcodeUnique: uniqueIndex("products_merchant_barcode_unique").on(
      table.merchantId,
      table.barcode,
    ),
    merchantStatusIndex: index("products_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
  }),
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    color: text("color"),
    size: text("size"),
    sku: text("sku"),
    quantity: integer("quantity").notNull().default(0),
    priceAdjustmentIqd: integer("price_adjustment_iqd").notNull().default(0),
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
    productIndex: index("product_variants_product_idx").on(table.productId),
    merchantSkuUnique: uniqueIndex("product_variants_merchant_sku_unique").on(
      table.merchantId,
      table.sku,
    ),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
