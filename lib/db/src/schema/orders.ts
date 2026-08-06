import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import {
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from "./enums";
import { merchants } from "./merchants";
import { products, productVariants } from "./catalog";

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    customerExternalId: text("customer_external_id"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    customerArea: text("customer_area"),
    status: orderStatusEnum("status")
      .notNull()
      .default("pending_confirmation"),
    paymentMethod: paymentMethodEnum("payment_method")
      .notNull()
      .default("cash_on_delivery"),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("cash_on_delivery"),
    subtotalIqd: integer("subtotal_iqd").notNull().default(0),
    deliveryFeeIqd: integer("delivery_fee_iqd").notNull().default(0),
    totalIqd: integer("total_iqd").notNull().default(0),
    sourceChannel: text("source_channel").notNull(),
    notes: text("notes"),
    paymentVerifiedAt: timestamp("payment_verified_at", { withTimezone: true }),
    paymentVerifiedByAccountId: text("payment_verified_by_account_id"),
    paymentRejectionReason: text("payment_rejection_reason"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
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
    merchantCreatedIndex: index("orders_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    merchantStatusIndex: index("orders_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
    conversationIndex: index("orders_conversation_idx").on(
      table.conversationId,
    ),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productVariantId: text("product_variant_id").references(
      () => productVariants.id,
      { onDelete: "set null" },
    ),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    variantSnapshot: jsonb("variant_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    quantity: integer("quantity").notNull(),
    unitPriceIqd: integer("unit_price_iqd").notNull(),
    lineTotalIqd: integer("line_total_iqd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIndex: index("order_items_order_idx").on(table.orderId),
    merchantProductIndex: index("order_items_merchant_product_idx").on(
      table.merchantId,
      table.productId,
    ),
  }),
);

export const orderDrafts = pgTable(
  "order_drafts",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    customerExternalId: text("customer_external_id").notNull(),
    awaitingField: text("awaiting_field").notNull(),
    draftData: jsonb("draft_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    conversationIndex: index("order_drafts_conversation_idx").on(
      table.conversationId,
    ),
    expiryIndex: index("order_drafts_expiry_idx").on(table.expiresAt),
  }),
);

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderDraft = typeof orderDrafts.$inferSelect;
